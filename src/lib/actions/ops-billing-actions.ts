"use server";

import { revalidatePath } from "next/cache";
import { requireOpsRole } from "@/lib/authz";
import { billingProfile, generateDueInvoices, markInvoicePaid, refreshOverdue, sendInvoice } from "@/lib/invoicing";
import { prisma } from "@/lib/prisma";
import { decideRequest, RequestError } from "@/lib/requests";
import { redirect } from "next/navigation";

/** Ops → Billing (Phase S): drafts from the contracts' schedules, send, mark paid. Admins only; every step logged. */

export async function createDueInvoicesAction() {
  await requireOpsRole(["ADMIN"]);
  await generateDueInvoices();
  await refreshOverdue();
  revalidatePath("/ops/admin/billing");
}

export async function sendInvoiceAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  await sendInvoice(String(formData.get("invoiceId") ?? ""), viewer.userId);
  revalidatePath("/ops/admin/billing");
}

export async function markInvoicePaidAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  await markInvoicePaid(String(formData.get("invoiceId") ?? ""), viewer.userId);
  revalidatePath("/ops/admin/billing");
}

/** Ops → Requests: approve or decline, with a note the client sees. */
export async function decideRequestAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const id = String(formData.get("requestId") ?? "");
  try {
    await decideRequest(id, viewer.userId, formData.get("decision") === "approve", String(formData.get("note") ?? "").trim() || null);
  } catch (e) {
    if (e instanceof RequestError) redirect(`/ops/requests?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/ops/requests");
  revalidatePath("/ops/admin/billing");
}

/** Staff billing settings for one client: payment terms, VAT rate, AI top-up auto-approval. Admins; logged. */
export async function saveStaffBillingAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  const before = await billingProfile(clientId);
  const num = (k: string) => (String(formData.get(k) ?? "").trim() === "" ? null : Number(String(formData.get(k)).replace(",", ".")));
  const terms = num("paymentTermsDays");
  const vat = num("vatRate");
  const auto = num("aiTopUpAutoApproveUpTo");
  const data = {
    paymentTermsDays: terms != null && terms >= 0 ? Math.round(terms) : before.paymentTermsDays,
    vatRate: vat != null && vat >= 0 && vat <= 100 ? Math.round(vat * 100) / 10000 : before.vatRate,
    aiTopUpAutoApproveUpTo: auto != null && auto >= 0 ? auto : null,
  };
  await prisma.billingProfile.update({ where: { clientId }, data });
  await prisma.auditLog.create({ data: { clientId, actorUserId: viewer.userId, area: "billing", action: "billing settings changed", before: { paymentTermsDays: before.paymentTermsDays, vatRate: before.vatRate, aiTopUpAutoApproveUpTo: before.aiTopUpAutoApproveUpTo }, after: data } });
  revalidatePath(`/ops/clients/${clientId}/billing`);
}
