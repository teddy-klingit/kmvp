import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { platformStatus } from "@/lib/brand-completeness";
import { draftEmptySectionsAction } from "@/lib/actions/brand-draft-actions";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard, Card } from "@/components/ds/card";
import { Meter } from "@/components/ds/stats";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { PlatformList } from "@/components/portal/platform-list";

/** Brand OS → Platform: the eight brand & message sections, each opening its editor. */
export default async function BrandPlatformPage() {
  const viewer = await getPortalViewer();
  const [client, brandOS, drafts] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId } }),
    prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } }),
    prisma.brandSectionDraft.findMany({ where: { clientId: viewer.clientId, status: "PENDING" }, select: { section: true } }),
  ]);
  const status = platformStatus({ brandSummary: client.brandSummary, brandOS });
  const drafted = new Set(drafts.map((d) => d.section));
  const undrafted = status.empty.filter((s) => !drafted.has(s.slug));
  return (
    <PageGrid
      main={
        <SectionCard title="Brand & message platform" action={<span className="text-[12px] text-brand-ink-2">{status.done} of {status.total} done</span>}>
          <PlatformList sections={status.sections} drafted={drafted} />
        </SectionCard>
      }
      side={
        <>
          <SectionCard title="Brand health">
            <div className="flex flex-col gap-3 px-6 py-5">
              <span className="text-[15px]">
                <span className="text-[28px] font-light tabular-nums">{status.done}</span> of {status.total} sections done
              </span>
              <Meter value={status.done} max={status.total} label={`${status.done} of ${status.total} sections done`} />
              <span className="text-[13px] text-brand-ink-2">Computed from Brand OS, not a stored score.</span>
            </div>
          </SectionCard>
          {undrafted.length > 0 && (
            <Card tone="muted" aria-label="Draft with AI" className="flex flex-col gap-3 px-6 py-5">
              <span className="text-[16px]">Draft the {undrafted.length} empty section{undrafted.length === 1 ? "" : "s"} with AI</span>
              <span className="text-[13px] leading-[1.5] text-brand-ink-2">The brand agent drafts from your website, summary and linked sources. You review every section before it&apos;s saved.</span>
              <AgentButton action={draftEmptySectionsAction} label="Draft with AI" pendingLabel="Drafting…" variant="action" align="start" />
            </Card>
          )}
        </>
      }
    />
  );
}
