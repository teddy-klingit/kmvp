import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RevenueByClientChart } from "@/components/ops/revenue-by-client-chart";

export default async function AnalyticsPage() {
  await requireOpsPage(["ADMIN"]);
  const clients = await prisma.client.findMany({
    include: { projects: { include: { assets: true } } },
  });

  const revenueByClient = clients.map((c) => ({
    client: c.name,
    revenue: c.projects.reduce((sum, p) => sum + (p.priceAmount ?? 0), 0),
  }));

  const delivered = clients.flatMap((c) => c.projects).filter((p) => p.deliveredAt && p.startedAt);
  const avgTurnaround =
    delivered.length > 0
      ? Math.round(
          (delivered.reduce((sum, p) => sum + (p.deliveredAt!.getTime() - p.startedAt!.getTime()), 0) /
            delivered.length /
            86400000) *
            10
        ) / 10
      : 0;

  const agentRunCount = await prisma.agentRun.count();
  const hoursSaved = agentRunCount * 1.5; // heuristic: ~1.5h saved per automated agent run

  const churnRisk = clients.filter((c) => c.healthScore < 75);

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Analytics & reporting" addHref="/ops/analytics" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">
              €{revenueByClient.reduce((s, r) => s + r.revenue, 0).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Total revenue booked</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">{avgTurnaround}d</p>
            <p className="text-xs text-muted-foreground">Avg turnaround</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">{Math.round(hoursSaved)}h</p>
            <p className="text-xs text-muted-foreground">Agent hours saved (est.)</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light text-ink">{churnRisk.length}</p>
            <p className="text-xs text-muted-foreground">Churn-risk accounts</p>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Revenue by client</SectionLabel>
          <Card className="p-5">
            <RevenueByClientChart data={revenueByClient} />
          </Card>
        </div>

        {churnRisk.length > 0 && (
          <div className="flex flex-col gap-3">
            <SectionLabel>Churn-risk flags</SectionLabel>
            <Card className="divide-y divide-border p-0">
              {churnRisk.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-5 py-3.5">
                  <p className="text-sm font-medium">{c.name}</p>
                  <Badge tone="danger">Health {c.healthScore}</Badge>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>
    </OpsPage>
  );
}
