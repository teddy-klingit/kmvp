import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { clientHealthMap } from "@/lib/client-health";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { SectionCard, CardBody, CardNote } from "@/components/ds/card";
import { DataTable, HealthDot } from "@/components/ds/data-table";
import { StatTiles, type Stat } from "@/components/ds/stats";
import { RevenueByClientChart } from "@/components/ops/revenue-by-client-chart";

export default async function AnalyticsPage() {
  await requireOpsPage(["ADMIN"]);
  const [clients, health] = await Promise.all([
    prisma.client.findMany({
      include: { projects: { include: { assets: true } } },
    }),
    clientHealthMap(),
  ]);

  const revenueByClient = clients.map((c) => ({
    client: c.name,
    revenue: c.projects.reduce((sum, p) => sum + (p.priceAmount ?? 0), 0),
  }));
  const totalRevenue = revenueByClient.reduce((s, r) => s + r.revenue, 0);

  const delivered = clients.flatMap((c) => c.projects).filter((p) => p.deliveredAt && p.startedAt);
  const avgTurnaround =
    delivered.length > 0
      ? Math.round(
          (delivered.reduce((sum, p) => sum + (p.deliveredAt!.getTime() - p.startedAt!.getTime()), 0) /
            delivered.length /
            86400000) *
            10
        ) / 10
      : null;

  const agentRunCount = await prisma.agentRun.count();
  const hoursSaved = agentRunCount * 1.5; // heuristic: ~1.5h saved per automated agent run

  // Computed health (src/lib/client-health.ts), never the stored score.
  const churnRisk = clients.filter((c) => health.get(c.id)?.atRisk);

  const tiles: Stat[] = [
    { label: "Total revenue booked", value: `€${totalRevenue.toLocaleString()}` },
    ...(avgTurnaround !== null ? [{ label: "Avg turnaround", value: `${avgTurnaround}d`, note: `${delivered.length} delivered project${delivered.length === 1 ? "" : "s"}` }] : []),
    ...(agentRunCount > 0 ? [{ label: "Agent hours saved", value: `${Math.round(hoursSaved)}h`, note: "Estimate: 1.5h per run" }] : []),
    { label: "Churn-risk accounts", value: String(churnRisk.length) },
  ];

  return (
    <OpsPage>
      <PageHeader eyebrow={`${clients.length} client${clients.length === 1 ? "" : "s"} · ${churnRisk.length} at risk`} title="Analytics & reporting" />

      <SectionCard title="Overview">
        <StatTiles tiles={tiles} />
      </SectionCard>

      <SectionCard title="Revenue by client">
        {totalRevenue > 0 ? (
          <CardBody>
            <RevenueByClientChart data={revenueByClient} />
          </CardBody>
        ) : (
          <CardNote>No priced projects yet.</CardNote>
        )}
      </SectionCard>

      {churnRisk.length > 0 && (
        <SectionCard title="Churn-risk flags" meta={<span className="font-brand-mono text-[12px] text-brand-ink-2">{churnRisk.length}</span>}>
          <DataTable
            label="Churn-risk clients"
            columns={[
              { key: "client", label: "Client" },
              { key: "health", label: "Health", className: "w-[120px]" },
              { key: "why", label: "Why" },
            ]}
            rows={churnRisk.map((c) => {
              const h = health.get(c.id)!;
              return {
                id: c.id,
                href: `/ops/clients/${c.id}/dashboard`,
                cells: {
                  client: <span className="text-[15px]">{c.name}</span>,
                  health: <HealthDot score={h.score} />,
                  why: <span className="text-[13px] text-brand-ink-2">{h.reasons.join(" · ")}</span>,
                },
              };
            })}
          />
        </SectionCard>
      )}
    </OpsPage>
  );
}
