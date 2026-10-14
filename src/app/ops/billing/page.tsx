import Link from "next/link";
import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { FilterChips } from "@/components/ds/filter-chips";
import { SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { StatTiles } from "@/components/ds/stats";
import { Button } from "@/components/ds/button";
import { money, refreshOverdue } from "@/lib/invoicing";
import { renewals } from "@/lib/contracts";
import { createDueInvoicesAction, markInvoicePaidAction, sendInvoiceAction } from "@/lib/actions/ops-billing-actions";
import { cn } from "@/lib/utils";

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
const STATUSES = ["DRAFT", "SENT", "OVERDUE", "PAID"] as const;
type Status = (typeof STATUSES)[number];

/**
 * Ops → Billing (Phase S): invoices from the contracts' schedules (drafts, sent, overdue in orange, paid), with send
 * and mark paid; a CSV per period for accounting; and Renewals, soonest notice deadline first (orange from 30 days
 * before it). Clients pay by invoice; there's no card anywhere. Admins only.
 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireOpsPage(["ADMIN"]);
  const q = await searchParams;
  await refreshOverdue();
  const status = STATUSES.find((s) => s === q.status) ?? null;
  const [invoices, renew] = await Promise.all([prisma.invoice.findMany({ include: { client: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }], take: 200 }), renewals()]);
  const shown = invoices.filter((i) => !status || i.status === status);
  const count = (s: Status) => invoices.filter((i) => i.status === s).length;
  const overdue = invoices.filter((i) => i.status === "OVERDUE");
  const thisMonth = new Date();
  const ym = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, "0")}`;

  return (
    <OpsPage>
      <PageHeader
        eyebrow={`${count("DRAFT")} drafts · ${count("OVERDUE")} overdue · by invoice, never card`}
        title="Billing"
        actions={
          <form action={createDueInvoicesAction}>
            <Button type="submit" variant="primary" size="sm">
              Create due invoices
            </Button>
          </form>
        }
      />
      <StatTiles
        tiles={[
          { label: "Drafts to send", value: String(count("DRAFT")) },
          { label: "Sent, not yet due", value: String(count("SENT")) },
          { label: "Overdue", value: String(overdue.length) },
          { label: "Paid", value: String(count("PAID")) },
        ]}
      />

      <SectionCard title="Renewals" meta={<span className="text-[13px] text-brand-ink-2">Renew automatically unless cancelled by the notice deadline</span>}>
        {renew.length === 0 ? (
          <CardNote>No contracts yet.</CardNote>
        ) : (
          <CardRows>
            {renew.map(({ contract: c, daysToNotice, urgent }) => (
              <li key={c.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3 text-[14px]", urgent && "bg-brand-peach-pale")}>
                <Link href={`/ops/clients/${c.client.id}/contract`} className="min-w-[160px] flex-1 text-brand-ink">
                  {c.client.name}
                </Link>
                <span className={cn("tabular-nums", urgent && "text-brand-orange-text")}>
                  Notice by {day(c.noticeDeadline)} · {daysToNotice < 0 ? "passed" : `${daysToNotice} days`}
                </span>
                <span className="text-brand-ink-2">
                  Renews {day(c.endDate)} for {c.termMonths} months
                </span>
                <span className="text-brand-ink-2">{c.contact?.user.name ?? "No contact person"}</span>
              </li>
            ))}
          </CardRows>
        )}
      </SectionCard>

      <FilterChips label="Invoice status" items={[{ label: "All", href: "/ops/billing", active: !status }, ...STATUSES.map((s) => ({ label: s.charAt(0) + s.slice(1).toLowerCase(), href: `/ops/billing?status=${s}`, active: status === s, count: count(s) }))]} />
      <SectionCard title="Invoices">
        {shown.length === 0 ? (
          <CardNote>No invoices{status ? ` with status ${status.toLowerCase()}` : ""}. “Create due invoices” writes drafts from the contracts.</CardNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-brand-ink-2">
                  {["Invoice", "Client", "Period", "Total", "Status", "Due", ""].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-medium first:pl-6 last:pr-6">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.id} className={cn("border-t border-brand-line", i.status === "OVERDUE" && "bg-brand-peach-pale")}>
                    <td className="py-3 pl-6 pr-3">
                      <Link href={`/ops/billing/invoices/${i.id}`} className="text-brand-ink">
                        {i.number}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{i.client.name}</td>
                    <td className="px-3 py-3 text-brand-ink-2">{i.periodStart ? `${day(i.periodStart)} – ${day(new Date((i.periodEnd ?? i.periodStart).getTime() - 86400000))}` : "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{money(i.amount, i.currency)}</td>
                    <td className={cn("px-3 py-3", i.status === "OVERDUE" && "text-brand-orange-text")}>{i.status.charAt(0) + i.status.slice(1).toLowerCase()}</td>
                    <td className="px-3 py-3 text-brand-ink-2">{i.dueAt ? day(i.dueAt) : "—"}</td>
                    <td className="py-3 pl-3 pr-6 text-right">
                      {i.status === "DRAFT" && (
                        <form action={sendInvoiceAction}>
                          <input type="hidden" name="invoiceId" value={i.id} />
                          <Button type="submit" variant="secondary" size="sm">
                            Send
                          </Button>
                        </form>
                      )}
                      {(i.status === "SENT" || i.status === "OVERDUE") && (
                        <form action={markInvoicePaidAction}>
                          <input type="hidden" name="invoiceId" value={i.id} />
                          <Button type="submit" variant="secondary" size="sm">
                            Mark paid
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Export for accounting">
        <form action="/api/ops/invoices/export" method="get" className="flex flex-wrap items-end gap-3 px-6 py-5 text-[13px] text-brand-ink-2">
          <label className="flex flex-col gap-1">
            From month
            <input type="month" name="from" defaultValue={ym} className="h-9 rounded-[8px] border border-brand-outline px-2 text-[14px] text-brand-ink" />
          </label>
          <label className="flex flex-col gap-1">
            To month
            <input type="month" name="to" defaultValue={ym} className="h-9 rounded-[8px] border border-brand-outline px-2 text-[14px] text-brand-ink" />
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Download CSV
          </Button>
          <span className="basis-full">One row per invoice issued in the period: org and VAT numbers, net, VAT, total, status. An accounting integration would plug in where invoices are sent and paid (src/lib/invoicing.ts).</span>
        </form>
      </SectionCard>
    </OpsPage>
  );
}
