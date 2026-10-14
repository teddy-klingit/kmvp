"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { billingProfile, vatFor } from "@/lib/invoicing";

export type BillingState = { error?: string; ok?: string };

/**
 * Settings → Billing details (Phase S): who and how Klingit invoices. Client admins edit them; payment terms and
 * auto-approval are staff settings. VAT follows the country (Sweden 25%, abroad reverse charge) unless staff set it.
 */
export async function saveBillingDetailsAction(_prev: BillingState, formData: FormData): Promise<BillingState> {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return { error: "Only an admin on your account can change billing details." };
  const before = await billingProfile(viewer.clientId);
  const text = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const email = text("invoiceEmail");
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: "That invoice email doesn't look right." };
  const country = (text("country") ?? "SE").toUpperCase().slice(0, 2);
  const data = { company: text("company"), orgNumber: text("orgNumber"), vatNumber: text("vatNumber"), address: text("address"), country, invoiceEmail: email, reference: text("reference"), eInvoiceAddress: text("eInvoiceAddress"), ...(country !== before.country ? { vatRate: await vatFor(country) } : {}) };
  await prisma.billingProfile.update({ where: { clientId: viewer.clientId }, data });
  await prisma.auditLog.create({ data: { clientId: viewer.clientId, actorUserId: viewer.userId, area: "billing", action: "billing details changed", before: { company: before.company, orgNumber: before.orgNumber, vatNumber: before.vatNumber, country: before.country, invoiceEmail: before.invoiceEmail, reference: before.reference }, after: data } });
  revalidatePath("/settings/billing");
  return { ok: "Saved. Your next invoice uses these details." };
}
