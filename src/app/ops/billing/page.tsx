import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { generateInvoiceAction, markInvoicePaidAction } from "@/lib/actions/ops-billing-actions";

const STATUS_TONE = { PAID: "success", SENT: "info", OVERDUE: "danger", DRAFT: "neutral" } as const;
const PLAN_PRICING = [
  { tier: "Starter", credits: 16, price: "€2,400/mo" },
  { tier: "Growth", credits: 40, price: "€5,600/mo" },
  { tier: "Scale", credits: 80, price: "€10,400/mo" },
];

export default async function BillingPage() {
  const [invoices, uninvoicedProjects] = await Promise.all([
    prisma.invoice.findMany({ include: { client: true }, orderBy: { issuedAt: "desc" } }),
    prisma.project.findMany({
      where: { status: "DELIVERED", invoices: { none: {} }, priceAmount: { not: null } },
      include: { client: true },
    }),
  ]);

  const overdue = invoices.filter((i) => i.status === "SENT" && i.dueAt && i.dueAt < new Date());
  const outstanding = invoices.filter((i) => i.status !== "PAID").reduce((sum, i) => sum + i.amount, 0);

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Billing & invoicing" addHref="/ops/billing" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">€{outstanding.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Outstanding</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light text-ink">{overdue.length}</p>
            <p className="text-xs text-muted-foreground">Overdue invoices</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">{invoices.filter((i) => i.status === "PAID").length}</p>
            <p className="text-xs text-muted-foreground">Paid this year</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">{uninvoicedProjects.length}</p>
            <p className="text-xs text-muted-foreground">Awaiting invoice</p>
          </Card>
        </div>

        {uninvoicedProjects.length > 0 && (
          <div className="flex flex-col gap-3">
            <SectionLabel>Delivered — ready to invoice</SectionLabel>
            <Card className="divide-y divide-border p-0">
              {uninvoicedProjects.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{p.client.name} — {p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.priceCurrency} {p.priceAmount?.toLocaleString()}
                    </p>
                  </div>
                  <form action={generateInvoiceAction}>
                    <input type="hidden" name="projectId" value={p.id} />
                    <Button type="submit" size="sm">
                      Generate invoice
                    </Button>
                  </form>
                </div>
              ))}
            </Card>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <SectionLabel>Invoice history</SectionLabel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.number}</TableCell>
                  <TableCell>{inv.client.name}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.issuedAt && formatDate(inv.issuedAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.dueAt && formatDate(inv.dueAt)}</TableCell>
                  <TableCell>
                    {inv.currency} {inv.amount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge tone={STATUS_TONE[inv.status]}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {inv.status === "SENT" && (
                      <form action={markInvoicePaidAction}>
                        <input type="hidden" name="invoiceId" value={inv.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Mark paid
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Plan-tier pricing</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PLAN_PRICING.map((p) => (
              <Card key={p.tier} className="p-5">
                <p className="text-sm font-semibold">{p.tier}</p>
                <p className="font-display text-2xl font-light">{p.price}</p>
                <p className="text-xs text-muted-foreground">{p.credits} credits / month</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </OpsPage>
  );
}
