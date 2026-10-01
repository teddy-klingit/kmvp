import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { AssetTile } from "@/components/portal/asset-tile";
import { StageBadge } from "@/components/portal/stage-badge";
import { loadProjectStateMap } from "@/lib/project-state-loader";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const viewer = await getPortalViewer();

  const query = q.trim();
  const [projects, assets, agentRuns] = query
    ? await Promise.all([
        prisma.project.findMany({
          where: { clientId: viewer.clientId, name: { contains: query }, ...projectVisibilityWhere(viewer.id) },
        }),
        prisma.asset.findMany({
          where: {
            clientId: viewer.clientId,
            OR: [{ name: { contains: query } }, { format: { contains: query } }],
            project: { is: projectVisibilityWhere(viewer.id) },
          },
          include: { project: true },
          take: 8,
        }),
        prisma.agentRun.findMany({
          where: { clientId: viewer.clientId, agent: { name: { contains: query } } },
          include: { agent: true },
          distinct: ["agentId"],
        }),
      ])
    : [[], [], []];

  const noResults = query && projects.length === 0 && assets.length === 0 && agentRuns.length === 0;
  const stateById = await loadProjectStateMap(projects.map((p) => p.id), viewer.clientId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={query ? `Results for "${query}"` : "Search"} />

      {!query && <p className="text-sm text-muted-foreground">Search projects, assets, and agents.</p>}
      {noResults && <p className="text-sm text-muted-foreground">No results for &quot;{query}&quot;.</p>}

      {projects.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Projects</SectionLabel>
          <Card className="divide-y divide-border p-0">
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/50">
                <p className="text-sm font-medium">{p.name}</p>
                {stateById.get(p.id) && <StageBadge state={stateById.get(p.id)!} />}
              </Link>
            ))}
          </Card>
        </div>
      )}

      {assets.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Assets</SectionLabel>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {assets.map((a) => (
              <AssetTile key={a.id} name={a.name} format={a.format} color={a.thumbnailColor} ctr={a.performanceCtr} campaign={a.project.name} />
            ))}
          </div>
        </div>
      )}

      {agentRuns.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Agents</SectionLabel>
          <Card className="divide-y divide-border p-0">
            {agentRuns.map((r) => (
              <div key={r.id} className="px-5 py-3.5 text-sm font-medium">
                {r.agent.name}
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
