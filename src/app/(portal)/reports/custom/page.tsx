import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { StatusPill } from "@/components/ds/status-pill";
import { StatTiles, type Stat } from "@/components/ds/stats";
import { FilterChips } from "@/components/ds/filter-chips";
import { PageGrid } from "@/components/ds/page-grid";
import { monoLink } from "@/components/ds/pill-link";
import { PlatformBadge } from "@/components/portal/platform-icon";
import { CampaignDetailDialog } from "@/components/portal/campaign-detail-dialog";
import { PostDetailDialog } from "@/components/portal/post-detail-dialog";
import { FollowerGrowthChart } from "@/components/portal/follower-growth-chart";
import { DiscreteMetricBars } from "@/components/portal/discrete-metric-bars";
import { PrintButton } from "@/components/portal/print-button";
import { saveReportAction, deleteSavedReportAction } from "@/lib/actions/report-actions";
import { DATE_RANGE_PRESETS, resolveDateRange, previousPeriod, pctChange, filtersToQueryString, type ReportFilters } from "@/lib/report-filters";
import { campaignMetricsForRange } from "@/lib/campaign-history";
import { sampleImageUrl } from "@/lib/sample-image";
import { formatDate, formatMoney } from "@/lib/utils";
import { Trash2, TrendingUp, TrendingDown, Lightbulb } from "lucide-react";

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

/** Content + follower metrics for one date range — called once for the
 * current period and once for the equivalent previous period, so every KPI
 * can show a "vs. previous period" delta instead of a bare number. */
function metricsForRange(
  range: { from: Date; to: Date },
  allPosts: { publishedDate: Date | null; scheduledDate: Date | null; status: string; platform: string; contentType: string | null; engagementRate: number | null; videoViews: number | null }[],
  followerSnapshots: { platform: string; capturedAt: Date; followerCount: number }[],
  filters: { platform?: string; contentType?: string }
) {
  const inRange = allPosts.filter((p) => {
    const d = p.publishedDate ?? p.scheduledDate;
    if (!d || d < range.from || d > range.to) return false;
    if (filters.platform && p.platform !== filters.platform) return false;
    if (filters.contentType && p.contentType !== filters.contentType) return false;
    return true;
  });
  const published = inRange.filter((p) => p.status === "PUBLISHED");
  const avgEngagementRate = average(published.map((p) => p.engagementRate).filter((v): v is number => v !== null));
  const avgVideoViews = average(published.map((p) => p.videoViews).filter((v): v is number => v !== null));

  const followerFiltered = filters.platform ? followerSnapshots.filter((f) => f.platform === filters.platform) : followerSnapshots;
  const byPlatform = new Map<string, typeof followerFiltered>();
  for (const f of followerFiltered) {
    const arr = byPlatform.get(f.platform) ?? [];
    arr.push(f);
    byPlatform.set(f.platform, arr);
  }
  const growthPcts = Array.from(byPlatform.values())
    .map((snaps) => {
      const inR = snaps.filter((s) => s.capturedAt >= range.from && s.capturedAt <= range.to).sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
      const series = inR.length >= 2 ? inR : [...snaps].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime()).slice(-2);
      const first = series[0];
      const last = series[series.length - 1];
      return first && last && first.followerCount > 0 ? ((last.followerCount - first.followerCount) / first.followerCount) * 100 : null;
    })
    .filter((v): v is number => v !== null);
  const blendedFollowerGrowthPct = growthPcts.length ? Math.round((growthPcts.reduce((s, v) => s + v, 0) / growthPcts.length) * 10) / 10 : null;

  return { contentVolume: published.length, avgEngagementRate, avgVideoViews, blendedFollowerGrowthPct };
}

export default async function CustomReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportFilters & { saved?: string; sent?: string }>;
}) {
  const sp = await searchParams;
  const filters: ReportFilters = { preset: sp.preset, from: sp.from, to: sp.to, platform: sp.platform, contentType: sp.contentType };
  const range = resolveDateRange(filters);
  const prevRange = previousPeriod(range);
  const qs = (overrides: Partial<ReportFilters>) => {
    const next = { ...filters, ...overrides };
    if (overrides.preset) {
      next.from = undefined;
      next.to = undefined;
    }
    const s = filtersToQueryString(next);
    return `/reports/custom${s ? `?${s}` : ""}`;
  };

  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;

  const clientRecord = await prisma.client.findUnique({ where: { id: clientId }, select: { paidMediaInScope: true } });
  const paidInScope = clientRecord?.paidMediaInScope ?? true;

  const [allPosts, followerSnapshots, businessOutcomes, savedReports, campaignData, prevCampaignData, brief] = await Promise.all([
    prisma.contentPost.findMany({ where: { clientId } }),
    prisma.followerSnapshot.findMany({ where: { clientId }, orderBy: { capturedAt: "asc" } }),
    prisma.clientBusinessOutcome.findMany({ where: { clientId }, orderBy: { periodStart: "asc" } }),
    prisma.savedReport.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
    paidInScope ? campaignMetricsForRange(clientId, range, filters.platform) : Promise.resolve({ campaigns: [], hasHistory: false }),
    paidInScope ? campaignMetricsForRange(clientId, prevRange, filters.platform) : Promise.resolve({ campaigns: [], hasHistory: false }),
    prisma.performanceBrief.findUnique({ where: { clientId } }),
  ]);

  const platforms = Array.from(new Set(allPosts.map((p) => p.platform)));
  const contentTypes = Array.from(new Set(allPosts.map((p) => p.contentType).filter((v): v is string => !!v)));

  const postsInRange = allPosts.filter((p) => {
    const d = p.publishedDate ?? p.scheduledDate;
    if (!d || d < range.from || d > range.to) return false;
    if (filters.platform && p.platform !== filters.platform) return false;
    if (filters.contentType && p.contentType !== filters.contentType) return false;
    return true;
  });
  const publishedInRange = postsInRange.filter((p) => p.status === "PUBLISHED").sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0));

  const current = metricsForRange(range, allPosts, followerSnapshots, filters);
  const previous = metricsForRange(prevRange, allPosts, followerSnapshots, filters);

  const followerFiltered = filters.platform ? followerSnapshots.filter((f) => f.platform === filters.platform) : followerSnapshots;
  const byPlatform = new Map<string, typeof followerFiltered>();
  for (const f of followerFiltered) {
    const arr = byPlatform.get(f.platform) ?? [];
    arr.push(f);
    byPlatform.set(f.platform, arr);
  }
  const followerGrowth = Array.from(byPlatform.entries()).map(([platform, snaps]) => {
    const inR = snaps.filter((s) => s.capturedAt >= range.from && s.capturedAt <= range.to);
    const series = inR.length >= 2 ? inR : snaps.slice(-2);
    return { platform, series };
  });
  const dateMap = new Map<number, string>();
  for (const f of followerGrowth) for (const s of f.series) dateMap.set(s.capturedAt.getTime(), formatDate(s.capturedAt));
  const sortedTimestamps = Array.from(dateMap.keys()).sort((a, b) => a - b);
  const followerChartData = sortedTimestamps.map((ts) => {
    const row: Record<string, string | number> = { date: dateMap.get(ts)! };
    for (const f of followerGrowth) {
      const point = f.series.find((s) => s.capturedAt.getTime() === ts);
      if (point) row[f.platform] = point.followerCount;
    }
    return row;
  });

  const outcomesInRange = businessOutcomes.filter((o) => o.periodStart <= range.to && o.periodEnd >= range.from);
  const hasRevenue = outcomesInRange.some((o) => o.revenue !== null);

  const summarize = (data: typeof campaignData) =>
    data.campaigns.reduce(
      (acc, c) => ({ spend: acc.spend + c.spend, impressions: acc.impressions + c.impressions, clicks: acc.clicks + c.clicks, conversions: acc.conversions + c.conversions }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
    );
  const summary = summarize(campaignData);
  const prevSummary = summarize(prevCampaignData);
  const blendedCtr = summary.impressions > 0 ? Math.round((summary.clicks / summary.impressions) * 1000) / 10 : 0;
  const prevBlendedCtr = prevSummary.impressions > 0 ? Math.round((prevSummary.clicks / prevSummary.impressions) * 1000) / 10 : 0;
  const campaignCtrs = campaignData.campaigns.map((c) => c.ctr).filter((v) => v > 0);
  const avgCampaignCtr = campaignCtrs.length ? campaignCtrs.reduce((s, v) => s + v, 0) / campaignCtrs.length : 0;
  const campaignCosts = campaignData.campaigns.map((c) => c.costPerConversion).filter((v): v is number => v !== null && v > 0);
  const avgCampaignCost = campaignCosts.length ? campaignCosts.reduce((s, v) => s + v, 0) / campaignCosts.length : null;

  // Deltas vs. the previous equivalent period — feeds the colored delta
  // pills on every KPI tile below.
  const engagementDelta = pctChange(current.avgEngagementRate, previous.avgEngagementRate);
  const videoViewsDelta = pctChange(current.avgVideoViews, previous.avgVideoViews);
  const contentVolumeDelta = pctChange(current.contentVolume, previous.contentVolume);
  const followerGrowthDelta = pctChange(current.blendedFollowerGrowthPct, previous.blendedFollowerGrowthPct);
  const spendDelta = pctChange(summary.spend, prevSummary.spend);
  const conversionsDelta = pctChange(summary.conversions, prevSummary.conversions);
  const ctrDelta = pctChange(blendedCtr, prevBlendedCtr);

  // Rule-based read on the deltas — deterministic, not an AI call, so the
  // report renders instantly and never disagrees with the numbers above it.
  const trendLines: string[] = [];
  if (engagementDelta !== null) trendLines.push(`Engagement rate is ${engagementDelta >= 0 ? "up" : "down"} ${Math.abs(engagementDelta)}% vs. ${prevRange ? "the previous period" : "last time"}.`);
  if (followerGrowthDelta !== null) trendLines.push(`Follower growth ${followerGrowthDelta >= 0 ? "accelerated" : "slowed"} ${Math.abs(followerGrowthDelta)} points vs. the prior period.`);
  if (spendDelta !== null && summary.spend > 0) trendLines.push(`Paid spend is ${spendDelta >= 0 ? "up" : "down"} ${Math.abs(spendDelta)}% while CTR is ${ctrDelta !== null ? `${ctrDelta >= 0 ? "up" : "down"} ${Math.abs(ctrDelta)}%` : "flat"} — ${ctrDelta !== null && ctrDelta >= 0 ? "efficiency held or improved" : "worth a closer look at efficiency"}.`);
  if (contentVolumeDelta !== null) trendLines.push(`Content volume ${contentVolumeDelta >= 0 ? "increased" : "decreased"} ${Math.abs(contentVolumeDelta)}% vs. the prior period.`);

  const actions: string[] = [];
  if (engagementDelta !== null && engagementDelta < -10) actions.push("Engagement dropped meaningfully — refresh the creative format mix before the next posting cycle.");
  if (spendDelta !== null && ctrDelta !== null && spendDelta > 10 && ctrDelta < 0) actions.push("Spend is climbing faster than CTR — pause or rework the weakest campaign before scaling further.");
  if (followerGrowthDelta !== null && followerGrowthDelta > 0) actions.push("Follower growth is accelerating — this is the moment to lean into whatever format is driving it.");
  if (actions.length === 0) actions.push("No red flags this period — stay the course and revisit this report next cycle.");

  // Only metrics with data become tiles: no "—", no $0 / 0-conversion placeholders.
  const vsPrev = (pct: number | null) => (pct !== null ? { pct, vs: "previous period" } : null);
  const contentTiles: Stat[] = [
    ...(current.blendedFollowerGrowthPct !== null
      ? [{ label: "Follower growth", value: `${current.blendedFollowerGrowthPct >= 0 ? "+" : ""}${current.blendedFollowerGrowthPct}%`, change: vsPrev(followerGrowthDelta) }]
      : []),
    ...(current.avgEngagementRate !== null ? [{ label: "Avg. engagement rate", value: `${current.avgEngagementRate}%`, change: vsPrev(engagementDelta) }] : []),
    ...(current.contentVolume > 0 ? [{ label: "Content published", value: String(current.contentVolume), change: vsPrev(contentVolumeDelta) }] : []),
    ...(current.avgVideoViews !== null ? [{ label: "Avg. video views", value: Math.round(current.avgVideoViews).toLocaleString("en-GB"), change: vsPrev(videoViewsDelta) }] : []),
  ];
  const paidTiles: Stat[] = [
    ...(summary.spend > 0 ? [{ label: "Spend", value: formatMoney(summary.spend, "USD"), change: vsPrev(spendDelta) }] : []),
    ...(summary.impressions > 0 ? [{ label: "Impressions", value: summary.impressions.toLocaleString(), change: vsPrev(pctChange(summary.impressions, prevSummary.impressions)) }] : []),
    ...(summary.conversions > 0 ? [{ label: "Conversions", value: String(summary.conversions), change: vsPrev(conversionsDelta) }] : []),
    ...(summary.impressions > 0 ? [{ label: "Blended CTR", value: `${blendedCtr}%`, change: vsPrev(ctrDelta) }] : []),
  ];

  const presetActive = (key: string) => (filters.preset ?? "30d") === key && !filters.from;
  const filterRows = [
    {
      label: "Date range",
      chips: DATE_RANGE_PRESETS.map((p) => ({ label: p.label, href: qs({ preset: p.key }), active: presetActive(p.key) })),
    },
    {
      label: "Platform",
      chips: [{ label: "All", href: qs({ platform: undefined }), active: !filters.platform }, ...platforms.map((p) => ({ label: p, href: qs({ platform: p }), active: filters.platform === p }))],
    },
    ...(contentTypes.length > 0
      ? [
          {
            label: "Content type",
            chips: [{ label: "All", href: qs({ contentType: undefined }), active: !filters.contentType }, ...contentTypes.map((ct) => ({ label: ct, href: qs({ contentType: ct }), active: filters.contentType === ct }))],
          },
        ]
      : []),
  ];
  const rangeMeta = <span className="text-[13px] text-brand-ink-2">{range.label}</span>;

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      {/* The Reports header (layout) holds Send to; print stays with the builder. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <span className="font-brand-mono text-[12px] text-brand-ink-2">CUSTOM REPORT · {range.label.toUpperCase()}</span>
        <PrintButton />
      </div>

      {sp.sent === "1" && (
        <Card tone="muted" className="px-6 py-4 text-[14px] print:hidden">
          Sent. Your team will find it in the channel you picked.
        </Card>
      )}
      {sp.saved === "1" && (
        <Card tone="muted" className="px-6 py-4 text-[14px] print:hidden">
          Saved. You&apos;ll find it in &quot;My saved reports&quot; below.
        </Card>
      )}

      <SectionCard
        title="Filters"
        className="print:hidden"
        action={
          (filters.platform || filters.contentType || filters.preset) && (
            <Link href="/reports/custom" className={monoLink}>
              CLEAR ALL FILTERS
            </Link>
          )
        }
      >
        <div className="flex flex-col gap-4 px-6 py-5">
          {filterRows.map((row) => (
            <div key={row.label} className="flex flex-col gap-2">
              <span className="font-brand-mono text-[11px] uppercase text-brand-ink-2">{row.label}</span>
              <FilterChips label={row.label} items={row.chips} />
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="hidden flex-col gap-1 print:flex">
        <h1 className="m-0 text-[24px] font-light">{viewer.client.name} — Custom report</h1>
        <p className="m-0 text-[13px] text-brand-ink-2">
          {range.label} · {filters.platform ?? "All platforms"} · {filters.contentType ?? "All content types"} — vs. {formatDate(prevRange.from)}–{formatDate(prevRange.to)}
        </p>
      </div>

      <SectionCard title="How it's gone" meta={<span className="text-[13px] text-brand-ink-2">{range.label}, vs. the equivalent period before</span>}>
        {contentTiles.length > 0 ? <StatTiles tiles={contentTiles} /> : <CardNote>Nothing published in {range.label.toLowerCase()} yet.</CardNote>}
      </SectionCard>

      {campaignData.campaigns.length > 0 && (
        <SectionCard title="Paid campaigns" meta={rangeMeta}>
          {paidTiles.length > 0 && <StatTiles tiles={paidTiles} className="border-b border-brand-line" />}
          <div className="grid grid-cols-1 gap-3 px-6 py-5 sm:grid-cols-2 print:grid-cols-2">
            {campaignData.campaigns.map((c) => (
              <CampaignDetailDialog key={c.campaignId} campaign={c} isStrong={false} isWeak={false} avgCtr={avgCampaignCtr} avgCostPerConversion={avgCampaignCost} />
            ))}
          </div>
        </SectionCard>
      )}
      {campaignData.campaigns.length === 0 && !filters.contentType && paidInScope && (
        <SectionCard title="Paid campaigns" meta={rangeMeta}>
          <CardNote>No paid-campaign history recorded for {range.label.toLowerCase()} yet.</CardNote>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 print:grid-cols-2 print:gap-4">
        <SectionCard title="Insights & trends">
          {trendLines.length === 0 ? (
            <CardNote>Not enough history yet to compare against a previous period.</CardNote>
          ) : (
            <CardRows>
              {trendLines.map((line, i) => (
                <li key={i} className="flex items-start gap-3 px-6 py-3.5 text-[14px]">
                  {line.includes("up") || line.includes("increased") || line.includes("accelerated") ? (
                    <TrendingUp className="mt-0.5 size-4 shrink-0 text-ds-success-text" strokeWidth={1.75} />
                  ) : (
                    <TrendingDown className="mt-0.5 size-4 shrink-0 text-brand-ink" strokeWidth={1.75} />
                  )}
                  <span className="text-brand-ink-2">{line}</span>
                </li>
              ))}
            </CardRows>
          )}
          {brief?.summary && <p className="m-0 border-t border-brand-line px-6 py-4 text-[14px] text-brand-ink-2">{brief.summary}</p>}
        </SectionCard>
        <SectionCard title="Actions">
          <CardRows>
            {actions.map((a, i) => (
              <li key={i} className="flex items-start gap-3 px-6 py-3.5 text-[14px]">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-ink" strokeWidth={1.75} />
                <span className="text-brand-ink-2">{a}</span>
              </li>
            ))}
          </CardRows>
        </SectionCard>
      </div>

      {followerChartData.length > 1 && (
        <SectionCard title="Follower growth" meta={rangeMeta}>
          <div className="px-6 py-5">
            <FollowerGrowthChart data={followerChartData} platforms={followerGrowth.map((f) => f.platform)} />
          </div>
        </SectionCard>
      )}

      {outcomesInRange.length > 0 && (
        <SectionCard title="Business outcomes" meta={rangeMeta}>
          <div className="px-6 py-5">
            <DiscreteMetricBars
              data={outcomesInRange.map((o) => ({ period: formatDate(o.periodStart, { month: "short", day: "2-digit" }), value: hasRevenue ? (o.revenue ?? 0) : (o.leadsGenerated ?? 0) }))}
              label={hasRevenue ? "Revenue" : "Leads"}
            />
          </div>
        </SectionCard>
      )}

      <PageGrid
        main={
          <SectionCard title="Content in range" meta={<span className="font-brand-mono text-[12px] text-brand-ink-2">{postsInRange.length}</span>}>
            {postsInRange.length === 0 ? (
              <CardNote>No content matches this filter selection.</CardNote>
            ) : (
              <CardRows as="div">
                {postsInRange.slice(0, 20).map((p) => (
                  <PostDetailDialog key={p.id} post={p}>
                    <div className="flex cursor-pointer items-center gap-3 px-6 py-3.5 transition-colors hover:bg-brand-chip print:cursor-default">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sampleImageUrl(p.id)} alt="" className="size-11 shrink-0 rounded-[8px] object-cover" />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px]">{p.title}</span>
                        <span className="flex items-center gap-1 text-[13px] text-brand-ink-2">
                          <PlatformBadge platform={p.platform} className="size-3.5" />
                          {p.platform}
                          {p.contentType ? ` · ${p.contentType}` : ""}
                          <span className="sm:hidden print:hidden"> · {formatDate(p.publishedDate ?? p.scheduledDate ?? p.createdAt)}</span>
                        </span>
                      </div>
                      <StatusPill tone={p.status === "PUBLISHED" ? "success" : "neutral"}>{p.status === "PUBLISHED" ? "Published" : "Scheduled"}</StatusPill>
                      <span className="hidden shrink-0 font-brand-mono text-[11px] text-brand-ink-2 sm:inline print:inline">{formatDate(p.publishedDate ?? p.scheduledDate ?? p.createdAt)}</span>
                    </div>
                  </PostDetailDialog>
                ))}
              </CardRows>
            )}
          </SectionCard>
        }
        side={
          <>
            <SectionCard title="Save this report" className="print:hidden">
              <form action={saveReportAction} className="flex flex-col gap-3 px-6 py-5">
                <input type="hidden" name="preset" value={filters.preset ?? ""} />
                <input type="hidden" name="from" value={filters.from ?? ""} />
                <input type="hidden" name="to" value={filters.to ?? ""} />
                <input type="hidden" name="platform" value={filters.platform ?? ""} />
                <input type="hidden" name="contentType" value={filters.contentType ?? ""} />
                <input
                  type="text"
                  name="name"
                  required
                  aria-label="Report name"
                  placeholder={`e.g. "${filters.platform ?? "All"} — ${range.label}"`}
                  className="h-11 w-full rounded-[8px] border border-brand-outline bg-white px-3 text-[14px] outline-none placeholder:text-brand-ink-2 focus:border-brand-ink sm:h-9"
                />
                <Button type="submit" variant="primary" size="sm" className="self-start">
                  Save
                </Button>
              </form>
            </SectionCard>

            {savedReports.length > 0 && (
              <SectionCard title="My saved reports" className="print:hidden">
                <CardRows>
                  {savedReports.map((r) => {
                    const f = r.filters as ReportFilters;
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-3 py-1 pl-6 pr-3">
                        <Link href={`/reports/custom?${filtersToQueryString(f)}`} className="flex min-w-0 flex-1 flex-col gap-0.5 py-2.5 text-brand-ink no-underline hover:underline">
                          <span className="truncate text-[15px]">{r.name}</span>
                          <span className="text-[12px] text-brand-ink-2">
                            {resolveDateRange(f).label}
                            {f.platform ? ` · ${f.platform}` : ""}
                            {f.contentType ? ` · ${f.contentType}` : ""} · saved {formatDate(r.createdAt)}
                          </span>
                        </Link>
                        <form action={deleteSavedReportAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <Button type="submit" variant="ghost" size="icon" title="Delete" aria-label={`Delete ${r.name}`}>
                            <Trash2 strokeWidth={1.75} />
                          </Button>
                        </form>
                      </li>
                    );
                  })}
                </CardRows>
              </SectionCard>
            )}
          </>
        }
      />
    </div>
  );
}
