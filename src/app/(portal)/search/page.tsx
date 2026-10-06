import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { Search } from "lucide-react";
import { loadProjectStateMap } from "@/lib/project-state-loader";
import { clientStatusPill } from "@/lib/project-state";
import { PageHeader } from "@/components/ds/page-header";
import { SectionCard, CardRows } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { EmptyState } from "@/components/ds/empty-state";
import { AssetTile, assetTileInclude, tileMedia } from "@/components/portal/asset-tile";
import { clientCtrAverage } from "@/lib/insights-data";
import { clientVisibleAsset } from "@/lib/qc/visibility";

/** Search results across projects, assets and agents. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const viewer = await getPortalViewer();
  const average = await clientCtrAverage(viewer.clientId);

  const query = q.trim();
  const [projects, assets, agentRuns] = query
    ? await Promise.all([
        prisma.project.findMany({
          where: { clientId: viewer.clientId, name: { contains: query }, ...projectVisibilityWhere(viewer.id) },
        }),
        prisma.asset.findMany({
          where: {
            clientId: viewer.clientId,
            ...clientVisibleAsset,
            OR: [{ name: { contains: query } }, { format: { contains: query } }],
            project: { is: projectVisibilityWhere(viewer.id) },
          },
          include: { project: true, ...assetTileInclude },
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

  const count = (n: number) => <span className="font-brand-mono text-[12px] text-brand-ink-2">{n}</span>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Search" title={query ? `Results for "${query}"` : "Search"} />

      {!query && <EmptyState icon={Search} title="Search projects, assets, and agents." />}
      {noResults && <EmptyState icon={Search} title={`No results for "${query}".`} />}

      {projects.length > 0 && (
        <SectionCard title="Projects" meta={count(projects.length)}>
          <CardRows>
            {projects.map((p) => {
              const state = stateById.get(p.id);
              const pill = state ? clientStatusPill(state) : null;
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 px-6 py-4 text-brand-ink no-underline transition-colors hover:bg-brand-chip">
                    <span className="min-w-0 truncate text-[15px]">{p.name}</span>
                    {pill && <StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
                  </Link>
                </li>
              );
            })}
          </CardRows>
        </SectionCard>
      )}

      {assets.length > 0 && (
        <SectionCard title="Assets" meta={count(assets.length)}>
          <div className="grid grid-cols-2 gap-4 px-6 py-5 sm:grid-cols-4">
            {assets.map((a) => (
              <AssetTile key={a.id} name={a.name} format={a.format} color={a.thumbnailColor} ctr={a.performanceCtr} campaign={a.project.name} {...tileMedia(a)} average={average} href={`/assets/library/${a.id}`} />
            ))}
          </div>
        </SectionCard>
      )}

      {agentRuns.length > 0 && (
        <SectionCard title="Agents" meta={count(agentRuns.length)}>
          <CardRows>
            {agentRuns.map((r) => (
              <li key={r.id} className="px-6 py-4 text-[15px]">
                {r.agent.name}
              </li>
            ))}
          </CardRows>
        </SectionCard>
      )}
    </div>
  );
}
