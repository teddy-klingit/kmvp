import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { InvoiceDocument } from "@/components/billing/invoice-document";

/** An invoice, laid out to print or save as PDF (Usage → Billing). Admins only; never a draft. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) redirect("/settings/usage");
  const invoice = await prisma.invoice.findFirst({ where: { id, clientId: viewer.clientId, status: { not: "DRAFT" } } });
  if (!invoice) notFound();
  const profile = await prisma.billingProfile.findUnique({ where: { clientId: viewer.clientId } });
  return <InvoiceDocument invoice={invoice} clientName={viewer.client.name} profile={profile} />;
}
