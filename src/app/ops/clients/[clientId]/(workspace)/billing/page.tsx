import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { Field, fieldClass } from "@/components/ops/form-field";
import { billingProfile, money } from "@/lib/invoicing";
import { REQUEST_KINDS, type RequestKind } from "@/lib/requests";
import { saveStaffBillingAction } from "@/lib/actions/ops-billing-actions";

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);

/**
 * Client workspace → Billing (Phase S, S7.3): the client's invoices (overdue in orange), their requests, their
 * billing details, and the staff settings: payment terms, VAT, and AI top-ups auto-approved up to a price.
 */
export default async function ClientBillingPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) notFound();
  const [profile, invoices, requests, pendingItems] = await Promise.all([
    billingProfile(clientId),
    prisma.invoice.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 24 }),
    prisma.purchaseRequest.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.billingItem.findMany({ where: { clientId, invoiceId: null } }),
  ]);
  return (
    <>
      <SectionCard title="Invoices">
        {invoices.length === 0 ? (
          <CardNote>No invoices yet. Billing → Create due invoices writes drafts from the contract.</CardNote>
        ) : (
          <CardRows>
            {invoices.map((i) => (
              <li key={i.id} className={`flex flex-wrap items-baseline gap-x-4 px-6 py-3 text-[14px] ${i.status === "OVERDUE" ? "bg-brand-peach-pale" : ""}`}>
                <Link href={`/ops/admin/billing/invoices/${i.id}`} className="w-32 text-brand-ink">
                  {i.number}
                </Link>
                <span className="flex-1 text-brand-ink-2">{i.periodStart ? `${day(i.periodStart)} →` : ""}</span>
                <span className="tabular-nums">{money(i.amount, i.currency)}</span>
                <span className={i.status === "OVERDUE" ? "text-brand-orange-text" : "text-brand-ink-2"}>{i.status.toLowerCase()}</span>
              </li>
            ))}
          </CardRows>
        )}
        {pendingItems.length > 0 && <p className="m-0 border-t border-brand-line px-6 py-3 text-[13px] text-brand-ink-2">On the next invoice: {pendingItems.map((p) => `${p.description} ${money(p.amount, p.currency)}`).join(" · ")}</p>}
      </SectionCard>

      <SectionCard title="Requests" action={<Link href="/ops/requests" className="text-[13px]">Requests queue</Link>}>
        {requests.length === 0 ? (
          <CardNote>No requests.</CardNote>
        ) : (
          <CardRows>
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-4 px-6 py-3 text-[14px]">
                <span className="w-28 text-[12px] text-brand-ink-2">{day(r.createdAt)}</span>
                <span className="flex-1">{REQUEST_KINDS[r.kind as RequestKind]?.label ?? r.kind}</span>
                <span className="tabular-nums">{r.price != null ? money(r.price, r.currency) : ""}</span>
                <span className={r.status === "pending" ? "text-brand-orange-text" : "text-brand-ink-2"}>{r.status}</span>
              </li>
            ))}
          </CardRows>
        )}
      </SectionCard>

      <SectionCard title="Billing details" meta={<span className="text-[12px] text-brand-ink-2">The client&apos;s admins edit these</span>}>
        <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 px-6 py-5 text-[14px] sm:grid-cols-2">
          {[
            ["Company", profile.company],
            ["Org number", profile.orgNumber],
            ["VAT number", profile.vatNumber],
            ["Country", profile.country],
            ["Address", profile.address],
            ["Invoice email", profile.invoiceEmail],
            ["Reference / PO", profile.reference],
            ["E-invoice", profile.eInvoiceAddress],
          ].map(([k, v]) => (
            <div key={k as string} className="flex flex-col">
              <dt className="text-[12px] text-brand-ink-2">{k}</dt>
              <dd className="m-0">{v || "—"}</dd>
            </div>
          ))}
        </dl>
        <form action={saveStaffBillingAction} className="flex flex-wrap items-end gap-3 border-t border-brand-line px-6 py-5">
          <input type="hidden" name="clientId" value={clientId} />
          <Field label="Payment terms (days)" htmlFor="terms">
            <input id="terms" name="paymentTermsDays" type="number" min={0} defaultValue={profile.paymentTermsDays} className={`${fieldClass} w-28`} />
          </Field>
          <Field label="VAT %" htmlFor="vat">
            <input id="vat" name="vatRate" type="number" min={0} max={100} step="0.01" defaultValue={Math.round(profile.vatRate * 10000) / 100} className={`${fieldClass} w-24`} />
          </Field>
          <Field label="Auto-approve AI top-ups up to" htmlFor="auto">
            <input id="auto" name="aiTopUpAutoApproveUpTo" type="number" min={0} defaultValue={profile.aiTopUpAutoApproveUpTo ?? ""} placeholder="Always ask" className={`${fieldClass} w-36`} />
          </Field>
          <Button type="submit" variant="secondary" size="sm">
            Save
          </Button>
        </form>
      </SectionCard>
    </>
  );
}
