import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { CtrByFormatChart } from "@/components/portal/ctr-by-format-chart";
import { KpiTile } from "@/components/portal/kpi-tile";
import { CampaignDetailDialog } from "@/components/portal/campaign-detail-dialog";
import { PostDetailDialog } from "@/components/portal/post-detail-dialog";
import { PlatformBadge } from "@/components/portal/platform-icon";
import { MixDonutChart, MIX_DONUT_COLORS } from "@/components/portal/mix-donut-chart";
import { FollowerGrowthChart } from "@/components/portal/follower-growth-chart";
import { performanceTierFor } from "@/lib/asset-performance";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Radio, Users, Heart, LayoutGrid, Video as VideoIcon, Video, TrendingUp, TrendingDown, SlidersHorizontal } from "lucide-react";
import { getMetaAdAccountInsights } from "@/lib/integrations/meta-ads";
import { getLinkedInAdInsights } from "@/lib/integrations/linkedin-ads";
import { getGoogleAdsAccountInsights } from "@/lib/integrations/google-ads";
import { buildSamplePlatformCampaigns } from "@/lib/integrations/sample-data";
import { buildPlatformCampaigns, summarizePlatformCampaigns, type PlatformCampaign } from "@/lib/performance";
import { computeContentKpis, contentFormatPerformance } from "@/lib/content-calendar-metrics";
import { recordPerformanceSnapshots } from "@/lib/integrations/performance-alerts";
import { campaignMetricsForRange, weeklyPerformanceTrend } from "@/lib/campaign-history";
import { DATE_RANGE_PRESETS, resolveDateRange } from "@/lib/report-filters";
import { sampleImageUrl } from "@/lib/sample-image";
import { cn, formatDate, formatMoney, jsonArray, kpiToneVsTarget } from "@/lib/utils";
import { GeneratePerformanceInsightsButton } from "@/components/portal/generate-performance-insights-button";
import { INSIGHTS_TABS } from "@/lib/insights-tabs";

type Recommendation = { title: string; detail: string };
type KpiTarget = { metric: string; target: string; platform: string | null };

function kpiTargetFor(targets: KpiTarget[], metric: string) {
  return targets.find((t) => t.metric === metric)?.target ?? null;
}

function PlatformCampaignGrid({ campaigns, tier }: { campaigns: PlatformCampaign[]; tier?: string }) {
  const sorted = [...campaigns].sort((a, b) => b.spend - a.spend);
  const trackedConversions = campaigns.some((c) => c.conversions > 0);
  const ctrs = campaigns.map((c) => c.ctr).filter((v) => v > 0);
  const avgCtr = ctrs.length ? ctrs.reduce((s, v) => s + v, 0) / ctrs.length : 0;
  const costs = campaigns.map((c) => c.costPerConversion).filter((v): v is number => v !== null && v > 0);
  const avgCostPerConversion = costs.length ? costs.reduce((s, v) => s + v, 0) / costs.length : null;
  const hasStrongOrWeak = sorted.some((c) => (c.ctr >= avgCtr * 1.2 || c.ctr <= avgCtr * 0.6) && avgCtr > 0);

  const visible = sorted.filter((c) => {
    if (!tier) return true;
    const isStrong = c.ctr >= avgCtr * 1.2 && avgCtr > 0;
    const isWeak = c.ctr <= avgCtr * 0.6 && avgCtr > 0;
    return tier === "strong" ? isStrong : tier === "weak" ? isWeak : true;
  });

  return (
    <div className="flex flex-col gap-3">
      {!trackedConversions && (
        <p className="text-xs text-muted-foreground">
          No conversion tracking detected on this account yet — showing reach and engagement only. Cost-per-conversion will
          appear here once a conversion action is configured on the platform side.
        </p>
      )}
      {hasStrongOrWeak && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-success-foreground">Strong</span> = CTR at least 20% above this platform&apos;s
          own average · <span className="font-medium text-ink">Weak</span> = CTR at or below half the average.
        </p>
      )}
      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground">No campaigns match this filter.</p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">Click any campaign for the full breakdown, plus tips on what to do next.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visible.map((c) => {
              const isStrong = c.ctr >= avgCtr * 1.2 && avgCtr > 0;
              const isWeak = c.ctr <= avgCtr * 0.6 && avgCtr > 0;
              return (
                <CampaignDetailDialog
                  key={c.campaignId}
                  campaign={c}
                  isStrong={isStrong}
                  isWeak={isWeak}
                  avgCtr={avgCtr}
                  avgCostPerConversion={avgCostPerConversion}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function groupAverage<T>(items: T[], keyOf: (item: T) => string, valueOf: (item: T) => number | null) {
  const map = new Map<string, { total: number; count: number }>();
  for (const item of items) {
    const key = keyOf(item);
    const value = valueOf(item);
    if (value === null) continue;
    const entry = map.get(key) ?? { total: 0, count: 0 };
    entry.total += value;
    entry.count += 1;
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .map(([key, { total, count }]) => ({ key, ctr: Math.round((total / count) * 10) / 10, count }))
    .sort((a, b) => b.ctr - a.ctr);
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ platform?: string; range?: string; tier?: string }> }) {
  const { platform: selectedPlatform, range: selectedRange, tier: selectedTier } = await searchParams;
  const viewer = await getPortalViewer();
  const client = await prisma.client.findUnique({ where: { id: viewer.clientId }, include: { reportingConfig: true } });
  const isSample = client?.isSampleAccount ?? false;
  const paidInScope = client?.paidMediaInScope ?? true;
  const kpiTargets = jsonArray<KpiTarget>(client?.reportingConfig?.kpiTargets);
  const dateRange = resolveDateRange({ preset: selectedRange });

  const filterHref = (overrides: { platform?: string; range?: string; tier?: string }) => {
    const params = new URLSearchParams();
    const merged = { platform: selectedPlatform, range: selectedRange, tier: selectedTier, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return `/insights${s ? `?${s}` : ""}`;
  };

  let platformCampaigns: PlatformCampaign[];
  let metaInsights: Awaited<ReturnType<typeof getMetaAdAccountInsights>> | null = null;
  let linkedInInsights: Awaited<ReturnType<typeof getLinkedInAdInsights>> | null = null;
  let googleInsights: Awaited<ReturnType<typeof getGoogleAdsAccountInsights>> | null = null;
  let trend: Awaited<ReturnType<typeof weeklyPerformanceTrend>> | null = null;

  const [allAssets, brief, kpis] = await Promise.all([
    prisma.asset.findMany({ where: { clientId: viewer.clientId }, include: { project: true } }),
    prisma.performanceBrief.findUnique({ where: { clientId: viewer.clientId } }),
    computeContentKpis(viewer.clientId),
  ]);

  if (!paidInScope) {
    // This client's engagement is contractually organic-only — never fetch
    // or show paid-ad data, not even a seeded sample.
    platformCampaigns = [];
  } else if (isSample) {
    const [{ campaigns }, trendData] = await Promise.all([
      campaignMetricsForRange(viewer.clientId, dateRange),
      weeklyPerformanceTrend(viewer.clientId),
    ]);
    platformCampaigns = campaigns.length > 0 ? campaigns : await buildSamplePlatformCampaigns(viewer.clientId);
    trend = trendData;
  } else {
    [metaInsights, linkedInInsights, googleInsights] = await Promise.all([
      getMetaAdAccountInsights(),
      getLinkedInAdInsights(),
      getGoogleAdsAccountInsights(),
    ]);
    platformCampaigns = buildPlatformCampaigns(metaInsights, linkedInInsights, googleInsights);
    await recordPerformanceSnapshots(viewer.clientId, platformCampaigns);
  }

  const assets = allAssets.filter((a) => a.performanceCtr !== null);
  const byFormat = groupAverage(assets, (a) => a.format, (a) => a.performanceCtr);
  // Sample (pitch/demo) clients have no delivered-creative history yet — use
  // real organic content-format performance instead of an empty CTR chart.
  const platformFilteredPublishedPosts = selectedPlatform ? kpis.publishedPosts.filter((p) => p.platform === selectedPlatform) : kpis.publishedPosts;
  const contentFormats = contentFormatPerformance(platformFilteredPublishedPosts);

  const campaignPlatforms = Array.from(new Set(platformCampaigns.map((c) => c.platform)));
  const overallMixedCurrencies = new Set(platformCampaigns.map((c) => c.currency)).size > 1;
  const spendByPlatformData = campaignPlatforms.map((platform) => ({
    name: platform,
    value: Math.round(platformCampaigns.filter((c) => c.platform === platform).reduce((s, c) => s + c.spend, 0)),
  }));
  const totalSpendAllPlatforms = spendByPlatformData.reduce((s, p) => s + p.value, 0);

  const filteredCampaigns = selectedPlatform ? platformCampaigns.filter((c) => c.platform === selectedPlatform) : platformCampaigns;
  const summary = summarizePlatformCampaigns(filteredCampaigns);

  const campaignsByPlatform = (selectedPlatform ? [selectedPlatform] : campaignPlatforms).map((platform) => ({
    platform,
    accountName: platformCampaigns.find((c) => c.platform === platform)?.accountName ?? platform,
    campaigns: filteredCampaigns.filter((c) => c.platform === platform),
  }));

  const platformCtrs = campaignsByPlatform
    .map((p) => {
      const impressions = p.campaigns.reduce((s, c) => s + c.impressions, 0);
      const clicks = p.campaigns.reduce((s, c) => s + c.clicks, 0);
      return { key: p.platform, ctr: impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : 0, count: p.campaigns.length };
    })
    .sort((a, b) => b.ctr - a.ctr);
  const bestPlatform = platformCtrs[0];
  const worstPlatform = platformCtrs.length > 1 ? platformCtrs[platformCtrs.length - 1] : null;
  const accountAvgCtr = platformCtrs.length ? platformCtrs.reduce((s, p) => s + p.ctr, 0) / platformCtrs.length : 0;

  const topContentPosts = [...platformFilteredPublishedPosts]
    .filter((p) => p.engagementRate !== null)
    .sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0))
    .slice(0, 8);

  // Organic-only equivalent of the paid best/worst-platform read — used
  // whenever paidInScope is false, so a client with no paid media still
  // gets a "which platform is winning" callout, just from engagement
  // rate instead of CTR.
  const organicPlatformStats = groupAverage(kpis.publishedPosts, (p) => p.platform, (p) => p.engagementRate);
  const bestOrganicPlatform = organicPlatformStats[0];
  const worstOrganicPlatform = organicPlatformStats.length > 1 ? organicPlatformStats[organicPlatformStats.length - 1] : null;
  const organicAvgEngagement = organicPlatformStats.length ? organicPlatformStats.reduce((s, p) => s + p.ctr, 0) / organicPlatformStats.length : 0;

  const followerGrowthTone = kpiToneVsTarget(kpis.blendedFollowerGrowthPct, kpiTargetFor(kpiTargets, "Follower Growth"));
  const engagementTone = kpiToneVsTarget(kpis.avgEngagementRate, kpiTargetFor(kpiTargets, "Engagement Rate"));
  const videoViewsTone = kpiToneVsTarget(kpis.avgVideoViews, kpiTargetFor(kpiTargets, "Video Views"));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Performance Insights"
        tabs={INSIGHTS_TABS}
      />
      {isSample ? (
        <Card className="-mt-2 flex items-center gap-3 border-l-4 border-l-accent bg-accent-soft/30 p-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-ink">
            <LayoutGrid className="size-4" />
          </span>
          <p className="text-sm text-foreground">
            <span className="font-medium">This is your dashboard from day one.</span> Every number below tracks a KPI
            from your SOW — once your real accounts are connected, this exact view fills in with live data.
            {!paidInScope && " Paid media isn't part of this engagement, so this view is organic-only by design — no ad spend or campaign data mixed in."}
          </p>
        </Card>
      ) : (
        <p className="-mt-4 text-sm text-muted-foreground">
          How your delivered creative is actually performing, broken down by platform and format, so you know where to
          double down.
        </p>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <SlidersHorizontal className="size-3.5" />
          Filters
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {isSample && paidInScope && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Date range</p>
              <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card p-0.5 w-fit">
                {DATE_RANGE_PRESETS.map((p) => (
                  <Link
                    key={p.key}
                    href={filterHref({ range: p.key })}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      (selectedRange ?? "30d") === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {p.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {(paidInScope ? campaignPlatforms : organicPlatformStats.map((p) => p.key)).length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Platform</p>
              <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card p-0.5 w-fit">
                <Link href={filterHref({ platform: undefined })} className={cn("rounded-full px-2.5 py-1 text-xs font-medium transition-colors", !selectedPlatform ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  All
                </Link>
                {(paidInScope ? campaignPlatforms : organicPlatformStats.map((p) => p.key)).map((p) => (
                  <Link key={p} href={filterHref({ platform: p })} className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors", selectedPlatform === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                    <PlatformBadge platform={p} className="size-4" />
                    {p}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {paidInScope && (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Performance tier</p>
            <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card p-0.5 w-fit">
              <Link href={filterHref({ tier: undefined })} className={cn("rounded-full px-2.5 py-1 text-xs font-medium transition-colors", !selectedTier ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                All
              </Link>
              <Link href={filterHref({ tier: "strong" })} className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors", selectedTier === "strong" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                <TrendingUp className="size-3" />
                Strong
              </Link>
              <Link href={filterHref({ tier: "weak" })} className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors", selectedTier === "weak" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                <TrendingDown className="size-3" />
                Weak
              </Link>
            </div>
          </div>
          )}
        </div>
      </Card>

      <SectionLabel>KPIs from your SOW (Section 8)</SectionLabel>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile
          icon={Users}
          label="Follower growth, MoM"
          value={kpis.blendedFollowerGrowthPct !== null ? `${kpis.blendedFollowerGrowthPct >= 0 ? "+" : ""}${kpis.blendedFollowerGrowthPct}%` : "—"}
          sublabel={kpiTargetFor(kpiTargets, "Follower Growth") ? `target ${kpiTargetFor(kpiTargets, "Follower Growth")}` : null}
          tone={followerGrowthTone}
        />
        <KpiTile
          icon={Heart}
          label="Engagement rate"
          value={kpis.avgEngagementRate !== null ? `${kpis.avgEngagementRate}%` : "—"}
          sublabel={kpiTargetFor(kpiTargets, "Engagement Rate") ? `target ${kpiTargetFor(kpiTargets, "Engagement Rate")}` : null}
          tone={engagementTone}
        />
        <KpiTile
          icon={LayoutGrid}
          label="Content volume this month"
          value={`${kpis.contentVolumeThisMonth}/${kpis.contentVolumeTarget || "—"}`}
          sublabel="meets or exceeds monthly minimums"
        />
        <KpiTile
          icon={VideoIcon}
          label="Video views, avg"
          value={kpis.avgVideoViews !== null ? kpis.avgVideoViews.toLocaleString() : "—"}
          sublabel={kpiTargetFor(kpiTargets, "Video Views") ? `target ${kpiTargetFor(kpiTargets, "Video Views")}` : null}
          tone={videoViewsTone}
        />
      </div>

      {platformCampaigns.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>
            Paid ad account summary {isSample && <span className="font-normal normal-case text-muted-foreground">— {dateRange.label}</span>}
          </SectionLabel>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="border border-border bg-paper p-4">
              {summary.mixedCurrencies ? (
                <>
                  <p className="text-sm font-semibold">{summary.spendByCurrency.map((s) => formatMoney(s.amount, s.currency)).join(" + ")}</p>
                  <p className="text-xs text-muted-foreground">Spend — mixed currencies</p>
                </>
              ) : (
                <>
                  <p className="font-display text-xl font-light">{formatMoney(summary.totalSpend, summary.currency)}</p>
                  <p className="text-xs text-muted-foreground">Spend, all platforms</p>
                </>
              )}
            </Card>
            <Card className="border border-border bg-paper p-4">
              <p className="font-display text-xl font-light">{summary.totalConversions || "—"}</p>
              <p className="text-xs text-muted-foreground">Conversions / leads</p>
            </Card>
            <Card className="border border-border bg-paper p-4">
              <p className="font-display text-xl font-light">{summary.blendedCostPerConversion ? formatMoney(summary.blendedCostPerConversion, summary.currency) : "—"}</p>
              <p className="text-xs text-muted-foreground">
                Cost / conversion{summary.conversionTrackingIsPartial ? " (tracked only)" : ""}
              </p>
            </Card>
            <Card className="border border-border bg-paper p-4">
              <p className="font-display text-xl font-light">{summary.blendedCtr}%</p>
              <p className="text-xs text-muted-foreground">Blended CTR</p>
            </Card>
          </div>
        </div>
      )}

      {!brief ? (
        <Card className="flex flex-col items-start gap-3 border-l-4 border-l-accent p-5">
          <div>
            <p className="text-sm font-semibold">What this means for you</p>
            <p className="text-sm text-muted-foreground">
              Have the Performance agent read your live campaign data and delivered creative performance, and tell you
              what to scale, cut, or investigate — not just list the numbers.
            </p>
          </div>
          <GeneratePerformanceInsightsButton label="Generate insights" />
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 border-l-4 border-l-accent p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">What this means for you</p>
              <p className="mt-1 text-sm text-muted-foreground">{brief.summary}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <GeneratePerformanceInsightsButton label="Refresh insights" />
              <p className="text-[11px] text-muted-foreground">Generated {formatDate(brief.generatedAt, { day: "2-digit", month: "short" })}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {jsonArray<Recommendation>(brief.recommendations).map((r, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-paper p-3">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-ink" />
                <div>
                  <p className="text-xs font-semibold text-foreground">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {spendByPlatformData.length > 1 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <SectionLabel>Spend by platform</SectionLabel>
            <Card className="p-5">
              {overallMixedCurrencies ? (
                <p className="text-sm text-muted-foreground">Accounts are in different currencies — see per-platform cards below for exact spend.</p>
              ) : (
                <>
                  <MixDonutChart
                    data={spendByPlatformData}
                    centerValue={formatMoney(totalSpendAllPlatforms, platformCampaigns[0]?.currency ?? "USD")}
                    centerLabel="total spend"
                  />
                  <div className="mt-3 flex flex-col gap-1.5">
                    {spendByPlatformData.map((p, i) => (
                      <div key={p.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="size-2 rounded-full" style={{ backgroundColor: MIX_DONUT_COLORS[i % MIX_DONUT_COLORS.length] }} />
                          <PlatformBadge platform={p.name} className="size-4" />
                          {p.name}
                        </span>
                        <span className="font-medium text-foreground">{formatMoney(p.value, platformCampaigns[0]?.currency ?? "USD")}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>
          <div className="flex flex-col gap-3">
            <SectionLabel>CTR by ad platform</SectionLabel>
            <Card className="p-5">
              {platformCtrs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ad account connected yet.</p>
              ) : (
                <CtrByFormatChart data={platformCtrs.map((p) => ({ platform: p.key, ctr: p.ctr }))} dataKey="platform" />
              )}
            </Card>
          </div>
        </div>
      )}

      {trend && trend.spendData.length > 1 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <SectionLabel>Weekly spend trend</SectionLabel>
            <Card className="p-5">
              <FollowerGrowthChart data={trend.spendData} platforms={trend.platforms} />
            </Card>
          </div>
          <div className="flex flex-col gap-3">
            <SectionLabel>Weekly impressions trend</SectionLabel>
            <Card className="p-5">
              <FollowerGrowthChart data={trend.impressionsData} platforms={trend.platforms} />
            </Card>
          </div>
        </div>
      )}

      {campaignsByPlatform.map(({ platform, accountName, campaigns }) => (
        <div key={platform} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <PlatformBadge platform={platform} className="size-6" />
            <SectionLabel>{platform}</SectionLabel>
            <span className="text-xs text-muted-foreground">{accountName}</span>
            {!isSample && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-success-foreground">
                <Radio className="size-2.5" />
                Live
              </span>
            )}
          </div>
          {campaigns.length === 0 ? (
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">No active campaigns for this window.</p>
            </Card>
          ) : (
            <PlatformCampaignGrid campaigns={campaigns} tier={selectedTier} />
          )}
        </div>
      ))}

      {!isSample && metaInsights && !metaInsights.ok && metaInsights.reason === "api_error" && (
        <Card className="border-l-4 border-l-danger p-4">
          <p className="text-sm font-medium">Couldn&apos;t reach Meta Ads</p>
          <p className="text-sm text-muted-foreground">{metaInsights.message}</p>
        </Card>
      )}
      {!isSample && linkedInInsights && !linkedInInsights.ok && linkedInInsights.reason === "api_error" && (
        <Card className="border-l-4 border-l-danger p-4">
          <p className="text-sm font-medium">Couldn&apos;t reach LinkedIn Ads</p>
          <p className="text-sm text-muted-foreground">{linkedInInsights.message}</p>
        </Card>
      )}
      {!isSample && googleInsights && !googleInsights.ok && googleInsights.reason === "api_error" && (
        <Card className="border-l-4 border-l-danger p-4">
          <p className="text-sm font-medium">Couldn&apos;t reach Google Ads</p>
          <p className="text-sm text-muted-foreground">{googleInsights.message}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border border-border bg-paper p-4">
          <p className="font-display text-xl font-light">{assets.length ? Math.round((assets.reduce((s, a) => s + (a.performanceCtr ?? 0), 0) / assets.length) * 10) / 10 : 0}%</p>
          <p className="text-xs text-muted-foreground">Average CTR (delivered creative)</p>
        </Card>
        <Card className="border border-border bg-paper p-4">
          <p className="font-display text-xl font-light">{assets.length}</p>
          <p className="text-xs text-muted-foreground">Assets tracked</p>
        </Card>
        <Card className="border border-border bg-paper p-4">
          <p className="font-display text-xl font-light">{assets.filter((a) => (a.performanceCtr ?? 0) >= 6.5).length}</p>
          <p className="text-xs text-muted-foreground">Top performers</p>
        </Card>
        <Card className="border border-border bg-paper p-4">
          <p className="font-display text-xl font-light">{paidInScope ? campaignPlatforms.length : organicPlatformStats.length}</p>
          <p className="text-xs text-muted-foreground">{paidInScope ? "Ad platforms connected" : "Organic platforms live"}</p>
        </Card>
      </div>

      {paidInScope && bestPlatform && worstPlatform && bestPlatform.key !== worstPlatform.key && (
        <Card className="flex items-start gap-3 bg-fade-purple-green p-5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-paper/60 text-ink">
            <Lightbulb className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">{bestPlatform.key} is outperforming</p>
            <p className="text-sm text-muted-foreground">
              {bestPlatform.key} is running at {bestPlatform.ctr}% CTR across {bestPlatform.count} campaign
              {bestPlatform.count === 1 ? "" : "s"} — well ahead of {worstPlatform.key} at {worstPlatform.ctr}%. Worth
              shifting budget toward {bestPlatform.key} and investigating why {worstPlatform.key} is lagging.
            </p>
          </div>
        </Card>
      )}
      {!paidInScope && bestOrganicPlatform && worstOrganicPlatform && bestOrganicPlatform.key !== worstOrganicPlatform.key && (
        <Card className="flex items-start gap-3 bg-fade-purple-green p-5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-paper/60 text-ink">
            <Lightbulb className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">{bestOrganicPlatform.key} is outperforming</p>
            <p className="text-sm text-muted-foreground">
              {bestOrganicPlatform.key} is averaging {bestOrganicPlatform.ctr}% engagement across {bestOrganicPlatform.count} post
              {bestOrganicPlatform.count === 1 ? "" : "s"} — well ahead of {worstOrganicPlatform.key} at {worstOrganicPlatform.ctr}%.
              Worth leaning further into {bestOrganicPlatform.key} and rethinking the format mix on {worstOrganicPlatform.key}.
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {byFormat.length > 0 ? (
          <div className="flex flex-col gap-3">
            <SectionLabel>CTR by creative format (delivered work)</SectionLabel>
            <Card className="p-5">
              <CtrByFormatChart data={byFormat.map((f) => ({ format: f.key, ctr: f.ctr }))} dataKey="format" />
            </Card>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <SectionLabel>Content engagement by format</SectionLabel>
            <Card className="p-5">
              {contentFormats.length === 0 ? (
                <p className="text-sm text-muted-foreground">No performance data yet.</p>
              ) : (
                <CtrByFormatChart data={contentFormats.map((f) => ({ format: f.key, ctr: f.ctr }))} dataKey="format" />
              )}
            </Card>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <SectionLabel>Platform comparison</SectionLabel>
          <Card className="divide-y divide-border p-0">
            {paidInScope
              ? campaignPlatforms.map((p) => {
                  const camps = platformCampaigns.filter((c) => c.platform === p);
                  const impressions = camps.reduce((s, c) => s + c.impressions, 0);
                  const clicks = camps.reduce((s, c) => s + c.clicks, 0);
                  const spend = camps.reduce((s, c) => s + c.spend, 0);
                  const conversions = camps.reduce((s, c) => s + c.conversions, 0);
                  const ctr = impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : 0;
                  const isAbove = accountAvgCtr > 0 && ctr >= accountAvgCtr * 1.1;
                  const isBelow = accountAvgCtr > 0 && ctr <= accountAvgCtr * 0.9;
                  return (
                    <div key={p} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <PlatformBadge platform={p} className="size-6" />
                        {p}
                      </span>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{formatMoney(spend, camps[0]?.currency ?? "USD")}</span>
                        <span className={cn("flex items-center gap-1 font-medium", isAbove && "text-success-foreground", isBelow && "text-ink", !isAbove && !isBelow && "text-foreground")}>
                          {isAbove && <TrendingUp className="size-3" />}
                          {isBelow && <TrendingDown className="size-3" />}
                          {ctr}% CTR
                        </span>
                        <span>{conversions} conv.</span>
                      </div>
                    </div>
                  );
                })
              : organicPlatformStats.map((p) => {
                  const isAbove = organicAvgEngagement > 0 && p.ctr >= organicAvgEngagement * 1.1;
                  const isBelow = organicAvgEngagement > 0 && p.ctr <= organicAvgEngagement * 0.9;
                  return (
                    <div key={p.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <PlatformBadge platform={p.key} className="size-6" />
                        {p.key}
                      </span>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{p.count} post{p.count === 1 ? "" : "s"}</span>
                        <span className={cn("flex items-center gap-1 font-medium", isAbove && "text-success-foreground", isBelow && "text-ink", !isAbove && !isBelow && "text-foreground")}>
                          {isAbove && <TrendingUp className="size-3" />}
                          {isBelow && <TrendingDown className="size-3" />}
                          {p.ctr}% eng.
                        </span>
                      </div>
                    </div>
                  );
                })}
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>{allAssets.length > 0 ? "Creative effectiveness" : "Top content this month"}</SectionLabel>
        <Card className="divide-y divide-border p-0">
          {allAssets.length > 0
            ? allAssets.map((a) => {
                const tier = performanceTierFor(a.performanceCtr);
                return (
                  <div key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.project.name} · {a.format}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {a.platform && <Badge tone="neutral">{a.platform}</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {a.performanceCtr !== null ? `${a.performanceCtr}% CTR` : "No data yet"}
                      </span>
                      <Badge tone={tier.tone}>{tier.label}</Badge>
                    </div>
                  </div>
                );
              })
            : topContentPosts.map((p) => (
                <PostDetailDialog key={p.id} post={p}>
                  <div className="flex cursor-pointer items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-muted/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sampleImageUrl(p.id)} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.title}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <PlatformBadge platform={p.platform} className="size-3.5" />
                        {p.platform}
                        {p.contentType ? ` · ${p.contentType}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                      {p.impressions !== null && <span>{p.impressions.toLocaleString()} impr.</span>}
                      {p.engagementRate !== null && <span className="font-medium text-foreground">{p.engagementRate}% eng.</span>}
                      {p.videoViews !== null && (
                        <span className="flex items-center gap-1">
                          <Video className="size-3" />
                          {p.videoViews.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </PostDetailDialog>
              ))}
          {allAssets.length === 0 && topContentPosts.length === 0 && (
            <p className="px-5 py-6 text-sm text-muted-foreground">No performance data yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
