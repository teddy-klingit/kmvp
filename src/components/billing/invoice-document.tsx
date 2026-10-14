import type { BillingProfile, Invoice } from "@/generated/prisma";
import { formatDay } from "@/lib/project-state";
import { jsonArray } from "@/lib/utils";
import { money, type InvoiceLine } from "@/lib/invoicing";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { PrintButton } from "@/components/portal/print-button";

type OldLine = { description?: string; label?: string; amount?: number; quantity?: number; unitPrice?: number };

/**
 * One invoice, laid out to print or save as PDF (Phase S): who it's to (billing details), the period, the lines
 * (quantity × unit price), net, VAT and total, the due date. Reverse charge is stated when there's no VAT.
 * Used by the client (Usage → Billing) and by staff (/ops/billing).
 */
export function InvoiceDocument({ invoice, clientName, profile }: { invoice: Invoice; clientName: string; profile: BillingProfile | null }) {
  const lines = jsonArray<InvoiceLine & OldLine>(invoice.lineItems);
  const net = invoice.netAmount ?? invoice.amount;
  const vatRate = invoice.vatRate ?? 0;
  const priced = invoice.amount !== 0 || lines.some((l) => l.amount != null);
  const m = (n: number) => money(n, invoice.currency);
  return (
    <article className="mx-auto flex w-full max-w-[760px] flex-col gap-6 rounded-[12px] bg-white px-6 py-8 sm:px-10 sm:py-10 print:shadow-none">
      <header className="flex items-start justify-between gap-4">
        <span className="flex flex-col">
          <span className="font-brand-mono text-[12px] uppercase text-brand-ink-2">Invoice · Klingit AB</span>
          <span className="text-[28px] font-light">{invoice.number}</span>
        </span>
        <span className="print:hidden">
          <PrintButton />
        </span>
      </header>
      <div className="grid grid-cols-1 gap-6 text-[14px] sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] text-brand-ink-2">Billed to</span>
          <span>{profile?.company ?? clientName}</span>
          {profile?.address && <span className="whitespace-pre-line">{profile.address}</span>}
          {profile?.orgNumber && <span>Org no {profile.orgNumber}</span>}
          {profile?.vatNumber && <span>VAT no {profile.vatNumber}</span>}
          {(invoice.reference ?? profile?.reference) && <span>Reference: {invoice.reference ?? profile?.reference}</span>}
        </div>
        <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="text-brand-ink-2">Issued</dt>
          <dd className="m-0">{invoice.issuedAt ? formatDay(invoice.issuedAt) : "Draft"}</dd>
          <dt className="text-brand-ink-2">Due</dt>
          <dd className="m-0">{invoice.dueAt ? formatDay(invoice.dueAt) : "—"}</dd>
          {invoice.periodStart && invoice.periodEnd && (
            <>
              <dt className="text-brand-ink-2">Period</dt>
              <dd className="m-0">
                {formatDay(invoice.periodStart)} – {formatDay(new Date(invoice.periodEnd.getTime() - 86400000))}
              </dd>
            </>
          )}
          <dt className="text-brand-ink-2">Status</dt>
          <dd className="m-0">{invoice.status.charAt(0) + invoice.status.slice(1).toLowerCase()}</dd>
        </dl>
      </div>
      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-brand-line text-left text-[12px] text-brand-ink-2">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Unit</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-brand-line">
                  <td className="py-3 pr-3">{l.description ?? l.label ?? "Item"}</td>
                  <td className="py-3 text-right tabular-nums">{l.quantity ?? ""}</td>
                  <td className="py-3 text-right tabular-nums">{l.unitPrice != null ? m(l.unitPrice) : ""}</td>
                  <td className="py-3 text-right tabular-nums">{l.amount != null ? m(l.amount) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {priced ? (
        <dl className="m-0 ml-auto grid w-full max-w-[300px] grid-cols-2 gap-y-1 text-[14px]">
          <dt className="text-brand-ink-2">Net</dt>
          <dd className="m-0 text-right tabular-nums">{m(net)}</dd>
          <dt className="text-brand-ink-2">{vatRate > 0 ? `VAT ${Math.round(vatRate * 100)}%` : "VAT"}</dt>
          <dd className="m-0 text-right tabular-nums">{vatRate > 0 ? m(invoice.vatAmount ?? 0) : "Reverse charge"}</dd>
          <dt className="pt-2 text-[18px]">Total</dt>
          <dd className="m-0 pt-2 text-right text-[18px] tabular-nums">{m(invoice.amount)}</dd>
        </dl>
      ) : (
        <p className="m-0 flex justify-between text-[18px]">
          <span>Total</span>
          <PlaceholderTag>Price not set</PlaceholderTag>
        </p>
      )}
      <p className="m-0 text-[12px] text-brand-ink-2">
        Pay by bank transfer within {profile?.paymentTermsDays ?? 30} days, quoting {invoice.number}.{vatRate === 0 ? " Reverse charge: VAT to be accounted for by the recipient." : ""} Prices are placeholders.
      </p>
    </article>
  );
}
