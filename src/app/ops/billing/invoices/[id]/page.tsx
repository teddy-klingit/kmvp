import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOpsPage } from "@/lib/authz";
import { OpsPage } from "@/components/ops/ops-page";
import { InvoiceDocument } from "@/components/billing/invoice-document";

/** Ops → Billing → one invoice (drafts too), as the client gets it. */
export default async function OpsInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOpsPage(["ADMIN"]);
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { client: { select: { name: true, billingProfile: true } } } });
  if (!invoice) notFound();
  return (
    <OpsPage>
      <InvoiceDocument invoice={invoice} clientName={invoice.client.name} profile={invoice.client.billingProfile} />
    </OpsPage>
  );
}
