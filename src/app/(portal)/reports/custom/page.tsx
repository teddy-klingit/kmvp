import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiTile } from "@/components/portal/kpi-tile";
import { PlatformBadge } from "@/components/portal/platform-icon";
import { CampaignDetailDialog } from "@/components/portal/campaign-detail-dialog";
import { PostDetailDialog } from "@/components/portal/post-detail-dialog";
import { FollowerGrowthChart } from "@/components/portal/follower-growth-chart";
import { DiscreteMetricBars } from "@/components/portal/discrete-metric-bars";
import { PrintButton } from "@/components/portal/print-button";
import { SendToChannelDialog } from "@/components/portal/send-to-channel-dialog";
import { saveReportAction, deleteSavedReportAction } from "@/lib/actions/report-actions";
import { DATE_RANGE_PRESETS, resolveDateRange, previousPeriod, pctChange, filtersToQueryString, type ReportFilters } from "@/lib/report-filters";
import { campaignMetricsForRange } from "@/lib/campaign-history";
import { sampleImageUrl } from "@/lib/sample-image";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { Trash2, X, Users, Heart, LayoutGrid, Video as VideoIcon, DollarSign, Eye, Target, Percent, TrendingUp, TrendingDown, Lightbulb } from "lucide-react";

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

  const [allPosts, followerSnapshots, businessOutcomes, savedReports, campaignData, prevCampaignData, brief, channels] = await Promise.all([
    prisma.contentPost.findMany({ where: { clientId } }),
    prisma.followerSnapshot.findMany({ where: { clientId }, orderBy: { capturedAt: "asc" } }),
    prisma.clientBusinessOutcome.findMany({ where: { clientId }, orderBy: { periodStart: "asc" } }),
    prisma.savedReport.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
    paidInScope ? campaignMetricsForRange(clientId, range, filters.platform) : Promise.resolve({ campaigns: [], hasHistory: false }),
    paidInScope ? campaignMetricsForRange(clientId, prevRange, filters.platform) : Promise.resolve({ campaigns: [], hasHistory: false }),
    prisma.performanceBrief.findUnique({ where: { clientId } }),
    prisma.connectedChannel.findMany({ where: { clientId }, orderBy: { connectedAt: "asc" } }),
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

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <div className="print:hidden">
        <PageHeader title="Reports" />
      </div>

      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-sm text-muted-foreground hover:text-foreground">
            &lt; SOW reports
          </Link>
          <h2 className="text-lg font-semibold">Custom report</h2>
        </div>
        <div className="flex items-center gap-2">
          <SendToChannelDialog channels={channels} subjectType="REPORT" subjectLabel={`Custom report — ${range.label}`} returnTo={qs({})} />
          <PrintButton />
        </div>
      </div>

      {sp.sent === "1" && (
        <Card className="flex items-center gap-2 border-l-4 border-l-success p-3 text-sm print:hidden">
          <p>Sent — your team will find it in the channel you picked.</p>
        </Card>
      )}
      {sp.saved === "1" && (
        <Card className="flex items-center justify-between border-l-4 border-l-success p-3 text-sm print:hidden">
          <p>Saved — you&apos;ll find it in &quot;My saved reports&quot; below.</p>
        </Card>
      )}

      <Card className="flex flex-col gap-3 p-4 print:hidden">
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Date range</p>
          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card p-0.5 w-fit">
            {DATE_RANGE_PRESETS.map((p) => (
              <Link
                key={p.key}
                href={qs({ preset: p.key })}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  (filters.preset ?? "30d") === p.key && !filters.from ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Platform</p>
          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card p-0.5 w-fit">
            <Link href={qs({ platform: undefined })} className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-colors", !filters.platform ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              All
            </Link>
            {platforms.map((p) => (
              <Link key={p} href={qs({ platform: p })} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors", filters.platform === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                <PlatformBadge platform={p} className="size-4" />
                {p}
              </Link>
            ))}
          </div>
        </div>
        {contentTypes.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Content type</p>
            <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card p-0.5 w-fit">
              <Link href={qs({ contentType: undefined })} className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-colors", !filters.contentType ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                All
              </Link>
              {contentTypes.map((ct) => (
                <Link key={ct} href={qs({ contentType: ct })} className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-colors", filters.contentType === ct ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {ct}
                </Link>
              ))}
            </div>
          </div>
        )}
        {(filters.platform || filters.contentType || filters.preset) && (
          <Link href="/reports/custom" className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="size-3" />
            Clear all filters
          </Link>
        )}
      </Card>

      <div className="hidden flex-col gap-1 print:flex">
        <h1 className="font-display text-xl font-light">{viewer.client.name} — Custom report</h1>
        <p className="text-sm text-muted-foreground">
          {range.label} · {filters.platform ?? "All platforms"} · {filters.contentType ?? "All content types"} — vs. {formatDate(prevRange.from)}–{formatDate(prevRange.to)}
        </p>
      </div>

      <SectionLabel>How it&apos;s gone — {range.label}, vs. the equivalent period before</SectionLabel>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-4">
        <KpiTile icon={Users} label="Follower growth" value={current.blendedFollowerGrowthPct !== null ? `${current.blendedFollowerGrowthPct >= 0 ? "+" : ""}${current.blendedFollowerGrowthPct}%` : "—"} delta={followerGrowthDelta} sublabel="vs. previous period" />
        <KpiTile icon={Heart} label="Avg. engagement rate" value={current.avgEngagementRate !== null ? `${current.avgEngagementRate}%` : "—"} delta={engagementDelta} sublabel="vs. previous period" />
        <KpiTile icon={LayoutGrid} label="Content published" value={String(current.contentVolume)} delta={contentVolumeDelta} sublabel="vs. previous period" />
        <KpiTile icon={VideoIcon} label="Avg. video views" value={current.avgVideoViews !== null ? current.avgVideoViews.toLocaleString() : "—"} delta={videoViewsDelta} sublabel="vs. previous period" />
      </div>

      {campaignData.campaigns.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Paid campaign performance — {range.label}</SectionLabel>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-4">
            <KpiTile icon={DollarSign} label="Spend" value={formatMoney(summary.spend, "USD")} delta={spendDelta} sublabel="vs. previous period" />
            <KpiTile icon={Eye} label="Impressions" value={summary.impressions.toLocaleString()} delta={pctChange(summary.impressions, prevSummary.impressions)} sublabel="vs. previous period" />
            <KpiTile icon={Target} label="Conversions" value={String(summary.conversions)} delta={conversionsDelta} sublabel="vs. previous period" />
            <KpiTile icon={Percent} label="Blended CTR" value={`${blendedCtr}%`} delta={ctrDelta} sublabel="vs. previous period" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
            {campaignData.campaigns.map((c) => (
              <CampaignDetailDialog key={c.campaignId} campaign={c} isStrong={false} isWeak={false} avgCtr={avgCampaignCtr} avgCostPerConversion={avgCampaignCost} />
            ))}
          </div>
        </div>
      )}
      {campaignData.campaigns.length === 0 && !filters.contentType && paidInScope && (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">No paid-campaign history recorded for {range.label.toLowerCase()} yet.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionLabel>Insights &amp; trends</SectionLabel>
          <Card className="flex flex-col gap-2.5 p-4">
            {trendLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not enough history yet to compare against a previous period.</p>
            ) : (
              trendLines.map((line, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {line.includes("up") || line.includes("increased") || line.includes("accelerated") ? (
                    <TrendingUp className="mt-0.5 size-3.5 shrink-0 text-success-foreground" />
                  ) : (
                    <TrendingDown className="mt-0.5 size-3.5 shrink-0 text-ink" />
                  )}
                  <p className="text-muted-foreground">{line}</p>
                </div>
              ))
            )}
            {brief?.summary && <p className="mt-1 border-t border-border pt-2.5 text-sm text-muted-foreground">{brief.summary}</p>}
          </Card>
        </div>
        <div className="flex flex-col gap-3">
          <SectionLabel>Actions</SectionLabel>
          <Card className="flex flex-col gap-2.5 p-4">
            {actions.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-ink" />
                <p className="text-muted-foreground">{a}</p>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {followerChartData.length > 1 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Follower growth — {range.label}</SectionLabel>
          <Card className="p-5">
            <FollowerGrowthChart data={followerChartData} platforms={followerGrowth.map((f) => f.platform)} />
          </Card>
        </div>
      )}

      {outcomesInRange.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Business outcomes — {range.label}</SectionLabel>
          <Card className="p-5">
            <DiscreteMetricBars
              data={outcomesInRange.map((o) => ({ period: formatDate(o.periodStart, { month: "short", day: "2-digit" }), value: hasRevenue ? (o.revenue ?? 0) : (o.leadsGenerated ?? 0) }))}
              label={hasRevenue ? "Revenue" : "Leads"}
            />
          </Card>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <SectionLabel>Content in range ({postsInRange.length})</SectionLabel>
        {postsInRange.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">No content matches this filter selection.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-border p-0">
            {postsInRange.slice(0, 20).map((p) => (
              <PostDetailDialog key={p.id} post={p}>
                <div className="flex cursor-pointer items-center gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-muted/40 print:cursor-default">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sampleImageUrl(p.id)} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <PlatformBadge platform={p.platform} className="size-3.5" />
                      {p.platform}
                      {p.contentType ? ` · ${p.contentType}` : ""}
                    </p>
                  </div>
                  <Badge tone={p.status === "PUBLISHED" ? "success" : "neutral"}>{p.status === "PUBLISHED" ? "Published" : "Scheduled"}</Badge>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(p.publishedDate ?? p.scheduledDate ?? p.createdAt)}</span>
                </div>
              </PostDetailDialog>
            ))}
          </Card>
        )}
      </div>

      <Card className="flex flex-col gap-3 p-4 print:hidden">
        <SectionLabel>Save this report</SectionLabel>
        <form action={saveReportAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="preset" value={filters.preset ?? ""} />
          <input type="hidden" name="from" value={filters.from ?? ""} />
          <input type="hidden" name="to" value={filters.to ?? ""} />
          <input type="hidden" name="platform" value={filters.platform ?? ""} />
          <input type="hidden" name="contentType" value={filters.contentType ?? ""} />
          <input
            type="text"
            name="name"
            required
            placeholder={`e.g. "${filters.platform ?? "All"} — ${range.label}"`}
            className="h-9 min-w-[240px] flex-1 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-accent"
          />
          <Button type="submit" size="sm">Save</Button>
        </form>
      </Card>

      {savedReports.length > 0 && (
        <div className="flex flex-col gap-3 print:hidden">
          <SectionLabel>My saved reports</SectionLabel>
          <Card className="divide-y divide-border p-0">
            {savedReports.map((r) => {
              const f = r.filters as ReportFilters;
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <Link href={`/reports/custom?${filtersToQueryString(f)}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium hover:text-ink">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {resolveDateRange(f).label}
                      {f.platform ? ` · ${f.platform}` : ""}
                      {f.contentType ? ` · ${f.contentType}` : ""} · saved {formatDate(r.createdAt)}
                    </p>
                  </Link>
                  <form action={deleteSavedReportAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-ink" title="Delete">
                      <Trash2 className="size-3.5" />
                    </button>
                  </form>
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}
