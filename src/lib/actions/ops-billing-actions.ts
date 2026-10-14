"use server";

import { revalidatePath } from "next/cache";
import { requireOpsRole } from "@/lib/authz";
import { generateDueInvoices, markInvoicePaid, refreshOverdue, sendInvoice } from "@/lib/invoicing";
import { decideRequest, RequestError } from "@/lib/requests";
import { redirect } from "next/navigation";

/** Ops → Billing (Phase S): drafts from the contracts' schedules, send, mark paid. Admins only; every step logged. */

export async function createDueInvoicesAction() {
  await requireOpsRole(["ADMIN"]);
  await generateDueInvoices();
  await refreshOverdue();
  revalidatePath("/ops/billing");
}

export async function sendInvoiceAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  await sendInvoice(String(formData.get("invoiceId") ?? ""), viewer.userId);
  revalidatePath("/ops/billing");
}

export async function markInvoicePaidAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  await markInvoicePaid(String(formData.get("invoiceId") ?? ""), viewer.userId);
  revalidatePath("/ops/billing");
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
  revalidatePath("/ops/billing");
}
