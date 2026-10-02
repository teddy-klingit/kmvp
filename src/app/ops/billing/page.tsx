import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { DataTable } from "@/components/ds/data-table";
import { StatTiles } from "@/components/ds/stats";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { pillClass } from "@/components/ds/button";
import { formatDate } from "@/lib/utils";
import { generateInvoiceAction, markInvoicePaidAction } from "@/lib/actions/ops-billing-actions";

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  PAID: { label: "Paid", tone: "success" },
  SENT: { label: "Sent", tone: "info" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  DRAFT: { label: "Draft", tone: "neutral" },
};
const PLAN_PRICING = [
  { tier: "Starter", credits: 16, price: "€2,400/mo" },
  { tier: "Growth", credits: 40, price: "€5,600/mo" },
  { tier: "Scale", credits: 80, price: "€10,400/mo" },
];

const short = (d: Date) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

export default async function BillingPage() {
  await requireOpsPage(["ADMIN"]);
  const [invoices, uninvoicedProjects] = await Promise.all([
    prisma.invoice.findMany({ include: { client: true }, orderBy: { issuedAt: "desc" } }),
    prisma.project.findMany({
      where: { status: "DELIVERED", invoices: { none: {} }, priceAmount: { not: null } },
      include: { client: true },
    }),
  ]);

  const overdue = invoices.filter((i) => i.status === "SENT" && i.dueAt && i.dueAt < new Date());
  const outstanding = invoices.filter((i) => i.status !== "PAID").reduce((sum, i) => sum + i.amount, 0);
  const paid = invoices.filter((i) => i.status === "PAID").length;

  return (
    <OpsPage>
      <PageHeader
        eyebrow={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"} · ${overdue.length} overdue`}
        title="Billing & invoicing"
      />

      <SectionCard title="Overview">
        <StatTiles
          tiles={[
            { label: "Outstanding", value: `€${outstanding.toLocaleString()}` },
            { label: "Overdue invoices", value: String(overdue.length) },
            { label: "Paid invoices", value: String(paid) },
            { label: "Awaiting invoice", value: String(uninvoicedProjects.length) },
          ]}
        />
      </SectionCard>

      {uninvoicedProjects.length > 0 && (
        <SectionCard title="Delivered, ready to invoice" meta={<span className="font-brand-mono text-[12px] text-brand-ink-2">{uninvoicedProjects.length}</span>}>
          <CardRows>
            {uninvoicedProjects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px]">{p.name}</span>
                  <span className="text-[13px] text-brand-ink-2">
                    {p.client.name} · {p.priceCurrency} {p.priceAmount?.toLocaleString()}
                  </span>
                </div>
                <form action={generateInvoiceAction}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <button type="submit" className={pillClass("primary", "sm")}>
                    Generate invoice
                  </button>
                </form>
              </li>
            ))}
          </CardRows>
        </SectionCard>
      )}

      <SectionCard title="Invoice history">
        <DataTable
          label="Invoices"
          empty={<CardNote>No invoices issued yet.</CardNote>}
          columns={[
            { key: "number", label: "Invoice" },
            { key: "client", label: "Client" },
            { key: "issued", label: "Issued" },
            { key: "due", label: "Due" },
            { key: "amount", label: "Amount", align: "right" },
            { key: "status", label: "Status" },
            { key: "action", label: "", className: "w-[120px]" },
          ]}
          rows={invoices.map((inv) => ({
            id: inv.id,
            cells: {
              number: <span className="font-brand-mono text-[12px]">{inv.number}</span>,
              client: inv.client.name,
              issued: inv.issuedAt ? <span className="text-brand-ink-2">{short(inv.issuedAt)}</span> : null,
              due: inv.dueAt ? <span className="text-brand-ink-2">{short(inv.dueAt)}</span> : null,
              amount: `${inv.currency} ${inv.amount.toLocaleString()}`,
              status: <StatusPill tone={STATUS[inv.status]?.tone}>{STATUS[inv.status]?.label ?? inv.status}</StatusPill>,
              action:
                inv.status === "SENT" ? (
                  <form action={markInvoicePaidAction}>
                    <input type="hidden" name="invoiceId" value={inv.id} />
                    <button type="submit" className={pillClass("secondary", "sm")}>
                      Mark paid
                    </button>
                  </form>
                ) : null,
            },
          }))}
        />
      </SectionCard>

      <SectionCard title="Plan-tier pricing">
        <StatTiles tiles={PLAN_PRICING.map((p) => ({ label: p.tier, value: p.price, note: `${p.credits} credits / month` }))} />
      </SectionCard>
    </OpsPage>
  );
}
