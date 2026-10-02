import { prisma } from "@/lib/prisma";
import { platformStatus } from "@/lib/brand-completeness";
import { clientHealthMap } from "@/lib/client-health";
import { SectionCard, CardNote } from "@/components/ds/card";
import { StatTiles, type Stat } from "@/components/ds/stats";
import { DataTable } from "@/components/ds/data-table";
import { StatusPill } from "@/components/ds/status-pill";
import { formatDate } from "@/lib/utils";
import { PROJECT_STATUS_LABEL } from "@/lib/labels";

export default async function ClientOpsDashboardPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  // Computed from what is happening now (overdue work, waiting items, credits, renewal), never the stored score.
  const health = (await clientHealthMap()).get(clientId);
  const [projects, client] = await Promise.all([
    prisma.project.findMany({
      where: { clientId, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      include: { assets: true },
    }),
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, include: { brandOS: true } }),
  ]);

  const active = projects.filter((p) => p.status !== "ARCHIVED" && p.status !== "DELIVERED");
  const brand = platformStatus({ brandSummary: client.brandSummary, brandOS: client.brandOS });

  const tiles: Stat[] = [
    { label: "Active projects", value: String(active.length) },
    { label: "Credits remaining", value: `${client.creditBalance}c` },
    { label: "Brand OS sections written", value: `${brand.done} of 8` },
    ...(health ? [{ label: "Account health", value: String(health.score), note: health.atRisk ? `At risk${health.reasons.length ? `: ${health.reasons.join(" · ")}` : ""}` : null }] : []),
  ];

  return (
    <>
      <SectionCard title="Overview">
        <StatTiles tiles={tiles} />
      </SectionCard>

      <SectionCard title="All projects" meta={<span className="font-brand-mono text-[12px] text-brand-ink-2">{projects.length}</span>}>
        <DataTable
          label="Projects"
          empty={<CardNote>No projects for this client yet.</CardNote>}
          columns={[
            { key: "project", label: "Project" },
            { key: "assets", label: "Assets", align: "right", className: "w-[100px]" },
            { key: "due", label: "Due", className: "w-[120px]" },
            { key: "status", label: "Status", className: "w-[160px]" },
          ]}
          rows={projects.map((p) => ({
            id: p.id,
            href: p.status === "DRAFT" ? `/ops/clients/${clientId}` : `/ops/projects/${p.id}`,
            cells: {
              project: <span className="text-[15px]">{p.name}</span>,
              assets: p.assets.length,
              due: p.dueDate ? <span className="text-brand-ink-2">{formatDate(p.dueDate, { day: "numeric", month: "short" })}</span> : null,
              status: <StatusPill tone={p.status === "DELIVERED" ? "success" : p.status === "PAUSED" ? "watch" : "neutral"}>{PROJECT_STATUS_LABEL[p.status]}</StatusPill>,
            },
          }))}
        />
      </SectionCard>
    </>
  );
}
