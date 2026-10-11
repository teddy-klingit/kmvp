import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { formatDay } from "@/lib/project-state";
import { jsonArray } from "@/lib/utils";
import { PrintButton } from "@/components/portal/print-button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";

/** An invoice, laid out to print or save as PDF (Usage → Billing). Admins only. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) redirect("/settings/usage");
  const invoice = await prisma.invoice.findFirst({ where: { id, clientId: viewer.clientId }, include: { project: { select: { name: true } } } });
  if (!invoice) notFound();
  const lines = jsonArray<{ description?: string; label?: string; amount?: number }>(invoice.lineItems);
  return (
    <article className="mx-auto flex w-full max-w-[720px] flex-col gap-6 rounded-[12px] bg-white px-10 py-10 print:shadow-none">
      <header className="flex items-start justify-between gap-4">
        <span className="flex flex-col">
          <span className="font-brand-mono text-[12px] uppercase text-brand-ink-2">Invoice</span>
          <span className="text-[28px] font-light">{invoice.number}</span>
        </span>
        <span className="print:hidden">
          <PrintButton />
        </span>
      </header>
      <dl className="m-0 grid grid-cols-2 gap-3 text-[14px]">
        <dt className="text-brand-ink-2">Billed to</dt>
        <dd className="m-0">{viewer.client.name}</dd>
        <dt className="text-brand-ink-2">Issued</dt>
        <dd className="m-0">{invoice.issuedAt ? formatDay(invoice.issuedAt) : "—"}</dd>
        <dt className="text-brand-ink-2">Due</dt>
        <dd className="m-0">{invoice.dueAt ? formatDay(invoice.dueAt) : "—"}</dd>
        <dt className="text-brand-ink-2">Status</dt>
        <dd className="m-0">{invoice.status.charAt(0) + invoice.status.slice(1).toLowerCase()}</dd>
        {invoice.project && (
          <>
            <dt className="text-brand-ink-2">Project</dt>
            <dd className="m-0">{invoice.project.name}</dd>
          </>
        )}
      </dl>
      {lines.length > 0 && (
        <ul className="m-0 flex list-none flex-col border-t border-brand-line p-0">
          {lines.map((l, i) => (
            <li key={i} className="flex justify-between border-b border-brand-line py-3 text-[14px]">
              <span className="flex flex-col">
                <span>{l.label ?? l.description ?? "Item"}</span>
                {l.label && l.description && <span className="text-[12px] text-brand-ink-2">{l.description}</span>}
              </span>
              <span className="tabular-nums">{l.amount != null ? l.amount.toLocaleString("en-GB") : ""}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 flex justify-between text-[18px]">
        <span>Total</span>
        {/* No price on the line items and none on the invoice: the plan price isn't set yet. */}
        {invoice.amount === 0 && lines.every((l) => l.amount == null) ? (
          <PlaceholderTag>Price not set</PlaceholderTag>
        ) : (
          <span className="tabular-nums">
            {invoice.currency} {invoice.amount.toLocaleString("en-GB")}
          </span>
        )}
      </p>
    </article>
  );
}
