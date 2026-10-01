import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { PLAN_TIER_LABEL } from "@/lib/labels";
import { CreditCard } from "lucide-react";

const INVOICE_TONE: Record<string, "success" | "info" | "warning" | "neutral"> = {
  PAID: "success",
  SENT: "info",
  OVERDUE: "warning",
  DRAFT: "neutral",
};

export default async function AccountBillingPage() {
  const viewer = await getPortalViewer();
  const [client, invoices] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId } }),
    prisma.invoice.findMany({ where: { clientId: viewer.clientId }, orderBy: { issuedAt: "desc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionLabel>Plan</SectionLabel>
          <Card className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-semibold">{PLAN_TIER_LABEL[client.planTier]}</p>
              <p className="text-sm text-muted-foreground">{client.monthlyCreditAllowance} credits / month</p>
            </div>
            <Button variant="secondary" size="sm">
              Upgrade plan
            </Button>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Payment method</SectionLabel>
          <Card className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <CreditCard className="size-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Visa •••• 4242</p>
                <p className="text-xs text-muted-foreground">Expires 04/28</p>
              </div>
            </div>
            <Button variant="secondary" size="sm">
              Update
            </Button>
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Invoice history</SectionLabel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.number}</TableCell>
                <TableCell className="text-muted-foreground">{inv.issuedAt && formatDate(inv.issuedAt)}</TableCell>
                <TableCell className="text-muted-foreground">{inv.dueAt && formatDate(inv.dueAt)}</TableCell>
                <TableCell>
                  {inv.currency} {inv.amount.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge tone={INVOICE_TONE[inv.status]}>{inv.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
