import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAgencyAttentionItems } from "@/lib/data/agency-attention";
import type { StaffMember, User } from "@/generated/prisma";

const URGENCY_TONE = { high: "danger", medium: "warning", low: "neutral" } as const;

export async function AdminHome({ viewer }: { viewer: StaffMember & { user: User } }) {
  const [attention, clients, staff, creditEntries] = await Promise.all([
    getAgencyAttentionItems(),
    prisma.client.findMany({ where: { status: "ACTIVE" } }),
    prisma.staffMember.findMany({ include: { teamMemberships: true } }),
    prisma.creditLedgerEntry.findMany({
      where: { type: "CONSUMPTION", createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    }),
  ]);

  const creditsBurned = Math.abs(creditEntries.reduce((sum, e) => sum + e.amount, 0));
  const avgUtilization =
    staff.length > 0
      ? Math.round(
          (staff.reduce((sum, s) => sum + Math.min(1, s.teamMemberships.length * 0.3), 0) / staff.length) * 100
        )
      : 0;
  const overdueInvoiceRisk = await prisma.invoice.aggregate({
    where: { status: { in: ["SENT", "OVERDUE"] } },
    _sum: { amount: true },
  });

  return (
    <OpsPage>
      <div className="flex flex-col gap-8">
        <PageHeader title={`Good morning, ${viewer.user.name.split(" ")[0]}.`} addHref="/ops/projects/new" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">{clients.length}</p>
            <p className="text-xs text-muted-foreground">Active clients</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">{creditsBurned}c</p>
            <p className="text-xs text-muted-foreground">Credits burned (30d)</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">{avgUtilization}%</p>
            <p className="text-xs text-muted-foreground">Team utilization</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">
              €{(overdueInvoiceRisk._sum.amount ?? 0).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Revenue at risk</p>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Needs attention today — agency-wide</SectionLabel>
          {attention.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">Nothing urgent — every account is on track.</p>
            </Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {attention.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/50"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {item.clientName} · {item.projectName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.title} — {item.detail}
                    </p>
                  </div>
                  <Badge tone={URGENCY_TONE[item.urgency]}>{item.urgency}</Badge>
                </Link>
              ))}
            </Card>
          )}
        </div>
      </div>
    </OpsPage>
  );
}
