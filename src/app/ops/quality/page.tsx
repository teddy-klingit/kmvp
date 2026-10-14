import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOpsPage } from "@/lib/authz";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { FilterChips } from "@/components/ds/filter-chips";
import { SectionCard, CardNote } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { scopeFor } from "@/lib/staff-scope";
import { approveQcAction, sendBackQcAction } from "@/lib/actions/ops-quality-actions";
import { cn } from "@/lib/utils";

/** Per project, in the card's header so it stays in view however many outputs the set has. */
function QcActions({ projectId }: { projectId: string }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link href={`/ops/projects/${projectId}/qc`} className="mr-1 text-[13px]">
        Open the check
      </Link>
      <form action={sendBackQcAction}>
        <input type="hidden" name="projectId" value={projectId} />
        <Button type="submit" variant="secondary" size="sm">
          Send back
        </Button>
      </form>
      <form action={approveQcAction}>
        <input type="hidden" name="projectId" value={projectId} />
        <Button type="submit" variant="primary" size="sm">
          Approve and send to client
        </Button>
      </form>
    </span>
  );
}

type Check = { key: string; label: string; source?: string; passed: boolean };

/**
 * Ops → Quality check (Phase S, S7.6): every output from the creative team waiting for the PM's review, across
 * clients (Mine / All), with which Brand OS rules passed or failed. Approve sends the set to the client through the
 * QC gate (every flag fixed or accepted, never by its maker); Send back returns the open flags to the designer.
 */
export default async function QualityQueuePage({ searchParams }: { searchParams: Promise<{ scope?: string; ok?: string; error?: string }> }) {
  const viewer = await requireOpsPage(["ADMIN", "PM"]);
  const q = await searchParams;
  const scope = await scopeFor(viewer, q.scope);
  const versions = await prisma.assetVersion.findMany({
    where: { state: "QC_READY", asset: { ...(scope.clientIds ? { clientId: { in: scope.clientIds } } : {}) } },
    include: { asset: { select: { name: true, format: true, project: { select: { id: true, name: true, client: { select: { name: true } } } } } } },
    orderBy: { createdAt: "asc" },
  });
  const flags = await prisma.qcFlag.findMany({ where: { versionId: { in: versions.map((v) => v.id) }, status: "OPEN" }, select: { versionId: true, label: true } });
  const byProject = new Map<string, typeof versions>();
  for (const v of versions) byProject.set(v.asset.project.id, [...(byProject.get(v.asset.project.id) ?? []), v]);

  return (
    <OpsPage>
      <PageHeader eyebrow={`${versions.length} output${versions.length === 1 ? "" : "s"} in ${byProject.size} project${byProject.size === 1 ? "" : "s"}`} title="Quality check" />
      <FilterChips label="Whose clients" items={[{ label: "Mine", href: "/ops/quality?scope=mine", active: scope.mine }, { label: "All", href: "/ops/quality?scope=all", active: !scope.mine }]} />
      {(q.ok || q.error) && <p className={cn("m-0 rounded-[10px] px-4 py-3 text-[14px]", q.error ? "bg-ds-watch-tint text-ds-watch-text" : "bg-white")}>{q.error ?? q.ok}</p>}
      {byProject.size === 0 ? (
        <SectionCard title="Waiting for review">
          <CardNote>Nothing waiting{scope.mine ? " for your clients" : ""}.</CardNote>
        </SectionCard>
      ) : (
        [...byProject.entries()].map(([projectId, set]) => (
          <SectionCard key={projectId} title={`${set[0].asset.project.client.name} · ${set[0].asset.project.name}`} action={<QcActions projectId={projectId} />}>
            <ul className="m-0 list-none p-0">
              {set.map((v) => {
                const checks = (v.checks as Check[] | null) ?? [];
                const failed = checks.filter((c) => !c.passed);
                const open = flags.filter((f) => f.versionId === v.id);
                return (
                  <li key={v.id} className="flex flex-col gap-1.5 border-t border-brand-line px-6 py-3 first:border-t-0">
                    <span className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-[15px]">{v.asset.name}</span>
                      <span className="text-[12px] text-brand-ink-2">
                        {v.asset.format} · v{v.number}
                      </span>
                      <span className={cn("text-[13px]", failed.length || open.length ? "text-brand-orange-text" : checks.length ? "text-[#5E6B2A]" : "text-brand-ink-2")}>
                        {checks.length ? `Brand OS check ${checks.length - failed.length}/${checks.length} passed` : "Brand OS check not run yet"}
                        {open.length ? ` · ${open.length} open flag${open.length === 1 ? "" : "s"}` : ""}
                      </span>
                    </span>
                    {failed.length > 0 && <span className="text-[13px] text-brand-ink-2">Failed: {failed.map((c) => c.label).join(" · ")}</span>}
                    {open.length > 0 && <span className="text-[13px] text-brand-ink-2">{open.map((f) => f.label).join(" · ")}</span>}
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        ))
      )}
    </OpsPage>
  );
}
