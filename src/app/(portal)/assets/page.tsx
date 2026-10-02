import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { platformStatus } from "@/lib/brand-completeness";
import { appMeta } from "@/lib/brand-sources";
import { listBrandConnections, listBrandSources } from "@/lib/brand-sources-data";
import { draftEmptySectionsAction } from "@/lib/actions/brand-draft-actions";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard, Card, CardRows } from "@/components/ds/card";
import { Meter } from "@/components/ds/stats";
import { monoLink } from "@/components/ds/pill-link";
import { DownloadBrandButton } from "@/components/portal/download-brand-button";
import { AppIcon } from "@/components/portal/brand-sources/app-icon";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { PlatformList } from "@/components/portal/platform-list";

/**
 * Brand OS overview (BrandIQ.dc.html): the brand card, a "Draft with AI" card while platform sections are
 * empty, the platform list with done / not-written per section, and on the side the linked sources and
 * brand health, computed from what's written (never a stored score).
 */
export default async function BrandOsOverviewPage() {
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [client, brandOS, sources, connections, drafts] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId } }),
    prisma.brandOS.findUnique({ where: { clientId } }),
    listBrandSources(clientId),
    listBrandConnections(clientId),
    prisma.brandSectionDraft.findMany({ where: { clientId, status: "PENDING" }, select: { section: true } }),
  ]);
  const status = platformStatus({ brandSummary: client.brandSummary, brandOS });
  const drafted = new Set(drafts.map((d) => d.section));
  const colors = jsonArray<string>(brandOS?.approvedColors);
  const typefaces = jsonArray<unknown>(brandOS?.approvedTypography).length;
  const emptyNotDrafted = status.empty.filter((s) => !drafted.has(s.slug));

  // Sources side card: connected apps, then apps that only have pasted links, then the website.
  const linkCount = new Map<string, number>();
  for (const s of sources) linkCount.set(s.app, (linkCount.get(s.app) ?? 0) + 1);
  const sourceRows = [
    ...connections.map((c) => ({ app: c.app, name: appMeta(c.app).name, note: c.isDemo ? "Connected · demo" : "Connected" })),
    ...[...linkCount].filter(([app]) => app !== "web" && !connections.some((c) => c.app === app)).map(([app, n]) => ({ app, name: appMeta(app).name, note: `${n} link${n === 1 ? "" : "s"}` })),
    ...(client.website ? [{ app: "web", name: "Website", note: client.website.replace(/^https?:\/\//, "").replace(/\/$/, "") }] : []),
  ];

  return (
    <PageGrid
      main={
        <>
          <Card className="flex flex-wrap items-center gap-5 px-6 py-6 @min-[600px]/col:px-8">
            <span
              aria-hidden
              className="flex size-[72px] shrink-0 items-center justify-center rounded-[10px] text-[28px] font-light text-brand-ink"
              style={{ backgroundColor: colors[0] ? `color-mix(in srgb, ${colors[0]} 45%, white)` : "var(--brand-pink)" }}
            >
              {client.name.charAt(0)}
            </span>
            <div className="flex min-w-0 flex-1 basis-[260px] flex-col gap-1.5">
              <h2 className="m-0 text-[24px] font-normal leading-[1.25]">{client.name}</h2>
              <p className="m-0 text-[15px] text-brand-ink-2">{client.brandSummary ?? "No brand summary yet."}</p>
              {(colors.length > 0 || typefaces > 0) && (
                <div className="mt-1 flex items-center gap-3">
                  <span className="flex gap-1.5">
                    {colors.slice(0, 6).map((c) => (
                      <span key={c} title={c} className="size-7 rounded-full border border-brand-line" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                  <span className="text-[13px] text-brand-ink-2">
                    {[colors.length && `${colors.length} colour${colors.length === 1 ? "" : "s"}`, typefaces && `${typefaces} typeface${typefaces === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                  </span>
                </div>
              )}
            </div>
            <DownloadBrandButton clientName={client.name} />
          </Card>

          {status.empty.length > 0 && (
            <section aria-label="Draft with AI" className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[12px] bg-brand-ink px-6 py-6 text-white @min-[600px]/col:px-8">
              <div className="flex min-w-0 flex-1 basis-[300px] flex-col gap-1.5">
                <span className="font-brand-mono text-[12px] text-brand-lime">
                  {status.empty.length} SECTION{status.empty.length === 1 ? "" : "S"} EMPTY
                </span>
                {emptyNotDrafted.length > 0 ? (
                  <>
                    <span className="text-[21px] leading-[1.35]">
                      Let the brand agent draft {emptyNotDrafted.length === 1 ? "it" : "them"} from {sources.length > 0 ? `your ${sources.length} linked source${sources.length === 1 ? "" : "s"}` : "your website and summary"}
                    </span>
                    <span className="text-[14px] text-brand-cream/80">You review every section before it is saved.</span>
                  </>
                ) : (
                  <>
                    <span className="text-[21px] leading-[1.35]">Drafts are ready for your review</span>
                    <span className="text-[14px] text-brand-cream/80">Open a section to use, edit or discard its draft. Nothing is saved until you do.</span>
                  </>
                )}
              </div>
              {emptyNotDrafted.length > 0 ? (
                <AgentButton action={draftEmptySectionsAction} label="Draft with AI" pendingLabel="Drafting…" variant="action" />
              ) : (
                <Link href={`/assets/brand-platform/${status.empty[0].slug}`} className="inline-flex h-11 items-center rounded-full bg-brand-orange px-5 font-brand-mono text-[12px] text-brand-ink no-underline sm:h-10">
                  Review drafts
                </Link>
              )}
            </section>
          )}

          <SectionCard title="Brand & message platform" action={<span className="font-brand-mono text-[12px] text-brand-ink-2">{status.done} OF {status.total} DONE</span>}>
            <PlatformList sections={status.sections} drafted={drafted} />
          </SectionCard>
        </>
      }
      side={
        <>
          <SectionCard
            title="Sources"
            action={
              <Link href="/assets/sources" className={monoLink}>
                MANAGE
              </Link>
            }
          >
            {sourceRows.length === 0 ? (
              <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">No sources linked yet. Link your Drive, Figma or any page your brand lives on.</p>
            ) : (
              <CardRows>
                {sourceRows.map((r) => (
                  <li key={`${r.app}-${r.name}`} className="flex items-center gap-3 px-6 py-3.5">
                    <AppIcon app={r.app} size={16} tile />
                    <span className="min-w-0 flex-1 truncate text-[15px]">{r.name}</span>
                    <span className="truncate text-[13px] text-brand-ink-2">{r.note}</span>
                  </li>
                ))}
              </CardRows>
            )}
          </SectionCard>
          <SectionCard title="Brand health">
            <div className="flex flex-col gap-3 px-6 py-5">
              <div className="flex items-baseline gap-2.5">
                <span className="text-[34px] font-light leading-none tabular-nums">
                  {status.done} of {status.total}
                </span>
                <span className="text-[15px]">platform sections done</span>
              </div>
              <Meter value={status.done} max={status.total} label={`${status.done} of ${status.total} platform sections done`} />
              <span className="text-[13px] leading-[1.5] text-brand-ink-2">Agents write better briefs the more is filled in. Computed from Brand OS, not a stored score.</span>
            </div>
          </SectionCard>
        </>
      }
    />
  );
}
