import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { formatDate } from "@/lib/utils";
import { PLAN_TIER_LABEL } from "@/lib/labels";
import { klingitChatHref } from "@/lib/client-home";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard, CardNote } from "@/components/ds/card";
import { DataTable } from "@/components/ds/data-table";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { PillLink } from "@/components/ds/pill-link";

const INVOICE_TONE: Record<string, PillTone> = { PAID: "success", SENT: "neutral", OVERDUE: "danger", DRAFT: "neutral" };
const INVOICE_LABEL: Record<string, string> = { PAID: "Paid", SENT: "Sent", OVERDUE: "Overdue", DRAFT: "Draft" };

/** Account → Billing: the plan and every invoice. No card details are shown: we don't store any. */
export default async function AccountBillingPage() {
  const viewer = await getPortalViewer();
  const [client, invoices, chat] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId } }),
    prisma.invoice.findMany({ where: { clientId: viewer.clientId }, orderBy: { issuedAt: "desc" } }),
    klingitChatHref(viewer.clientId),
  ]);
  return (
    <PageGrid
      main={
        <SectionCard title="Invoices" action={<span className="text-[12px] text-brand-ink-2">{invoices.length} in total</span>}>
          <DataTable
            label="Invoices"
            empty={<CardNote>No invoices yet.</CardNote>}
            columns={[
              { key: "number", label: "Invoice" },
              { key: "issued", label: "Issued" },
              { key: "due", label: "Due" },
              { key: "amount", label: "Amount", align: "right" },
              { key: "status", label: "Status" },
            ]}
            rows={invoices.map((inv) => ({
              id: inv.id,
              cells: {
                number: inv.number,
                issued: inv.issuedAt ? formatDate(inv.issuedAt, { day: "numeric", month: "short", year: "numeric" }) : "",
                due: inv.dueAt ? formatDate(inv.dueAt, { day: "numeric", month: "short", year: "numeric" }) : "",
                amount: `${inv.currency} ${inv.amount.toLocaleString("en-GB")}`,
                status: <StatusPill tone={INVOICE_TONE[inv.status]}>{INVOICE_LABEL[inv.status] ?? inv.status}</StatusPill>,
              },
            }))}
          />
        </SectionCard>
      }
      side={
        <SectionCard title="Plan">
          <div className="flex flex-col gap-3 px-6 py-5">
            <span className="text-[28px] font-light leading-none">{PLAN_TIER_LABEL[client.planTier] ?? client.planTier}</span>
            <span className="text-[14px] text-brand-ink-2">
              {client.monthlyCreditAllowance} credits a month{client.renewalDate ? ` · renews ${formatDate(client.renewalDate, { day: "numeric", month: "short" })}` : ""}
            </span>
            <PillLink href={chat} className="self-start">
              Ask about upgrading
            </PillLink>
          </div>
          {client.cardLast4 && (
            <div className="flex flex-col gap-1 border-t border-brand-line px-6 py-5">
              <span className="flex items-center gap-2 text-[15px]">
                {client.cardBrand ?? "Card"} •••• {client.cardLast4}
                {client.cardIsDemo && <StatusPill tone="watch">Demo</StatusPill>}
              </span>
              <span className="text-[13px] text-brand-ink-2">
                {client.cardExpiry ? `Expires ${client.cardExpiry}. ` : ""}
                {client.cardIsDemo ? "A dummy card for the demo: no payment details are stored." : "Your Klingit team updates the card on file."}
              </span>
            </div>
          )}
        </SectionCard>
      }
    />
  );
}
