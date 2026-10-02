import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { loadContentKpis, loadMeasuredAssets, loadPaidMedia } from "@/lib/insights-data";
import { summarizePlatformCampaigns, type PlatformCampaign } from "@/lib/performance";
import { contentFormatPerformance } from "@/lib/content-calendar-metrics";
import { DATE_RANGE_PRESETS, resolveDateRange } from "@/lib/report-filters";
import { performanceTierFor } from "@/lib/asset-performance";
import { generatePerformanceInsightsAction } from "@/lib/actions/performance-actions";
import { formatDate, formatMoney, jsonArray } from "@/lib/utils";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard, CardBody, CardNote, CardRows } from "@/components/ds/card";
import { FilterChips } from "@/components/ds/filter-chips";
import { HBars, Meter, StatTiles, type Stat } from "@/components/ds/stats";
import { DiscreteMetricBars } from "@/components/portal/discrete-metric-bars";
import { NumberedRow } from "@/components/ds/numbered-row";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { CampaignDetailDialog } from "@/components/portal/campaign-detail-dialog";
import { PostDetailDialog } from "@/components/portal/post-detail-dialog";
import { PlatformBadge } from "@/components/portal/platform-icon";
import { MixDonutChart, MIX_DONUT_COLORS } from "@/components/portal/mix-donut-chart";
import { FollowerGrowthChart } from "@/components/portal/follower-growth-chart";
import { AgentButton } from "@/components/portal/insights/agent-button";

type Recommendation = { title: string; detail: string };
type KpiTarget = { metric: string; target: string; platform: string | null };

const TIER_TONE: Record<string, PillTone> = { success: "success", info: "neutral", warning: "watch", danger: "danger", neutral: "neutral" };

function average(values: number[]) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function groupAverage<T>(items: T[], keyOf: (item: T) => string, valueOf: (item: T) => number | null) {
  const map = new Map<string, { total: number; count: number }>();
  for (const item of items) {
    const v = valueOf(item);
    if (v === null) continue;
    const e = map.get(keyOf(item)) ?? { total: 0, count: 0 };
    e.total += v;
    e.count += 1;
    map.set(keyOf(item), e);
  }
  return [...map].map(([key, { total, count }]) => ({ key, value: Math.round((total / count) * 10) / 10, count })).sort((a, b) => b.value - a.value);
}

/** Strong = CTR at least 20% above the platform's own average; weak = at or below 60% of it. */
function tierOf(c: PlatformCampaign, avgCtr: number) {
  if (avgCtr <= 0) return null;
  return c.ctr >= avgCtr * 1.2 ? "strong" : c.ctr <= avgCtr * 0.6 ? "weak" : null;
}

/**
 * Insights → Performance: paid campaigns, SOW KPIs, the performance agent's read, and every delivered
 * asset's measured CTR. Same data and actions as before; metrics without data are left out.
 */
export default async function InsightsPerformancePage({ searchParams }: { searchParams: Promise<{ platform?: string; range?: string; tier?: string }> }) {
  const { platform: selectedPlatform, range: selectedRange, tier: selectedTier } = await searchParams;
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [paid, kpis, { all }, brief, config, outcomes] = await Promise.all([
    loadPaidMedia(clientId, selectedRange),
    loadContentKpis(clientId),
    loadMeasuredAssets(clientId),
    prisma.performanceBrief.findUnique({ where: { clientId } }),
    prisma.clientReportingConfig.findUnique({ where: { clientId } }),
    prisma.clientBusinessOutcome.findMany({ where: { clientId }, orderBy: { periodStart: "asc" } }),
  ]);
  // Business outcomes (moved here from the Calendar): revenue when reported, otherwise leads.
  const hasRevenue = outcomes.some((o) => o.revenue !== null);
  const outcomeBars = outcomes
    .map((o) => ({ period: formatDate(o.periodStart, { month: "short" }), value: hasRevenue ? o.revenue : o.leadsGenerated }))
    .filter((o): o is { period: string; value: number } => o.value !== null);
  const kpiTargets = jsonArray<KpiTarget>(config?.kpiTargets);
  const targetFor = (metric: string) => kpiTargets.find((t) => t.metric === metric)?.target ?? null;
  const dateRange = resolveDateRange({ preset: selectedRange });

  const href = (o: { platform?: string; range?: string; tier?: string }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ platform: selectedPlatform, range: selectedRange, tier: selectedTier, ...o })) if (v) q.set(k, v);
    return `/insights/performance${q.size ? `?${q}` : ""}`;
  };

  const platforms = [...new Set(paid.campaigns.map((c) => c.platform))];
  const campaigns = selectedPlatform ? paid.campaigns.filter((c) => c.platform === selectedPlatform) : paid.campaigns;
  const summary = campaigns.length ? summarizePlatformCampaigns(campaigns) : null;
  const posts = selectedPlatform ? kpis.publishedPosts.filter((p) => p.platform === selectedPlatform) : kpis.publishedPosts;
  const organicPlatforms = groupAverage(kpis.publishedPosts, (p) => p.platform, (p) => p.engagementRate);
  const filterPlatforms = paid.inScope ? platforms : organicPlatforms.map((p) => p.key);

  const platformCtr = (selectedPlatform ? [selectedPlatform] : platforms)
    .map((p) => {
      const cs = campaigns.filter((c) => c.platform === p);
      const impressions = cs.reduce((s, c) => s + c.impressions, 0);
      const clicks = cs.reduce((s, c) => s + c.clicks, 0);
      const spend = cs.reduce((s, c) => s + c.spend, 0);
      const conversions = cs.reduce((s, c) => s + c.conversions, 0);
      return { platform: p, ctr: impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : 0, spend, conversions, currency: cs[0]?.currency ?? "USD", count: cs.length, accountName: cs[0]?.accountName ?? p };
    })
    .sort((a, b) => b.ctr - a.ctr);
  const spendByPlatform = platforms.map((p) => ({ name: p, value: Math.round(paid.campaigns.filter((c) => c.platform === p).reduce((s, c) => s + c.spend, 0)) }));
  const mixedCurrencies = new Set(paid.campaigns.map((c) => c.currency)).size > 1;

  // SOW KPIs: only the ones with data.
  const target = (m: string) => (targetFor(m) ? `target ${targetFor(m)}` : null);
  const sow: Stat[] = [
    ...(kpis.blendedFollowerGrowthPct !== null ? [{ label: "Follower growth, MoM", value: `${kpis.blendedFollowerGrowthPct >= 0 ? "+" : ""}${kpis.blendedFollowerGrowthPct}%`, note: target("Follower Growth") }] : []),
    ...(kpis.avgEngagementRate !== null ? [{ label: "Engagement rate", value: `${kpis.avgEngagementRate}%`, note: target("Engagement Rate") }] : []),
    ...(kpis.contentVolumeTarget > 0 ? [{ label: "Content this month", value: `${kpis.contentVolumeThisMonth} of ${kpis.contentVolumeTarget}`, note: "SOW monthly minimum" }] : []),
    ...(kpis.avgVideoViews !== null ? [{ label: "Video views, average", value: kpis.avgVideoViews.toLocaleString("en-GB"), note: target("Video Views") }] : []),
  ];
  const paidTiles: Stat[] = summary
    ? [
        { label: `Spend${paid.isSample ? ` · ${dateRange.label}` : ""}`, value: summary.mixedCurrencies ? summary.spendByCurrency.map((s) => formatMoney(s.amount, s.currency)).join(" + ") : formatMoney(summary.totalSpend, summary.currency) },
        { label: "Blended CTR", value: `${summary.blendedCtr}%` },
        ...(summary.totalConversions > 0 ? [{ label: "Conversions", value: String(summary.totalConversions) }] : []),
        ...(summary.blendedCostPerConversion ? [{ label: `Cost per conversion${summary.conversionTrackingIsPartial ? " (tracked)" : ""}`, value: formatMoney(summary.blendedCostPerConversion, summary.currency) }] : []),
      ]
    : [];

  const byFormat = groupAverage(all.filter((a) => a.performanceCtr !== null), (a) => a.format, (a) => a.performanceCtr);
  const contentFormats = contentFormatPerformance(posts);
  const topPosts = [...posts].filter((p) => p.engagementRate !== null).sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0)).slice(0, 8);
  const best = platformCtr[0];
  const worst = platformCtr.length > 1 ? platformCtr[platformCtr.length - 1] : null;

  return (
    <div className="flex flex-col gap-6">
      {(paid.isSample || filterPlatforms.length > 0) && (
        <div className="flex flex-col gap-3">
          {paid.isSample && paid.inScope && (
            <FilterChips label="Date range" items={DATE_RANGE_PRESETS.map((p) => ({ label: p.label, href: href({ range: p.key }), active: (selectedRange ?? "30d") === p.key }))} />
          )}
          {filterPlatforms.length > 0 && (
            <FilterChips
              label="Platform and tier"
              items={[
                { label: "All platforms", href: href({ platform: undefined }), active: !selectedPlatform },
                ...filterPlatforms.map((p) => ({ label: p, href: href({ platform: p }), active: selectedPlatform === p })),
                ...(paid.inScope
                  ? [
                      { label: "Strong campaigns", href: href({ tier: selectedTier === "strong" ? undefined : "strong" }), active: selectedTier === "strong" },
                      { label: "Weak campaigns", href: href({ tier: selectedTier === "weak" ? undefined : "weak" }), active: selectedTier === "weak" },
                    ]
                  : []),
              ]}
            />
          )}
        </div>
      )}

      <PageGrid
        main={
          <>
            <SectionCard
              title="What this means for you"
              action={<AgentButton action={generatePerformanceInsightsAction} label={brief ? "Refresh" : "Generate insights"} pendingLabel="Analysing…" />}
            >
              {brief ? (
                <>
                  <p className="m-0 px-6 pt-5 text-[15px] leading-[1.55]">{brief.summary}</p>
                  <CardRows as="ol">
                    {jsonArray<Recommendation>(brief.recommendations).map((r, i) => (
                      <NumberedRow key={i} n={i + 1} title={r.title} detail={r.detail} />
                    ))}
                  </CardRows>
                  <p className="m-0 border-t border-brand-line px-6 py-3 font-brand-mono text-[11px] text-brand-ink-2">BY THE PERFORMANCE AGENT · {formatDate(brief.generatedAt, { day: "numeric", month: "short" }).toUpperCase()}</p>
                </>
              ) : (
                <CardNote>The performance agent reads your live campaigns and delivered creative, and tells you what to scale, cut or look into.</CardNote>
              )}
            </SectionCard>

            {paidTiles.length > 0 && (
              <SectionCard title="Paid ads" action={summary && summary.totalConversions === 0 ? <span className="text-[12px] text-brand-ink-2">No conversion tracking yet</span> : undefined}>
                <StatTiles tiles={paidTiles} />
              </SectionCard>
            )}

            {paid.inScope &&
              platformCtr.map((p) => {
                const cs = campaigns.filter((c) => c.platform === p.platform);
                const avgCtr = average(cs.map((c) => c.ctr).filter((v) => v > 0));
                const costs = cs.map((c) => c.costPerConversion).filter((v): v is number => v !== null && v > 0);
                const avgCost = costs.length ? average(costs) : null;
                const visible = [...cs].sort((a, b) => b.spend - a.spend).filter((c) => !selectedTier || tierOf(c, avgCtr) === selectedTier);
                return (
                  <SectionCard
                    key={p.platform}
                    title={
                      <span className="flex items-center gap-2.5">
                        <PlatformBadge platform={p.platform} className="size-6" />
                        {p.platform}
                      </span>
                    }
                    label={`${p.platform} campaigns`}
                    meta={<span className="text-[13px] text-brand-ink-2">{p.accountName}{paid.isSample ? "" : " · live"}</span>}
                  >
                    {visible.length === 0 ? (
                      <CardNote>No campaigns match this filter.</CardNote>
                    ) : (
                      <CardBody className="grid grid-cols-1 gap-3 @min-[600px]/col:grid-cols-2">
                        {visible.map((c) => (
                          <CampaignDetailDialog key={c.campaignId} campaign={c} isStrong={tierOf(c, avgCtr) === "strong"} isWeak={tierOf(c, avgCtr) === "weak"} avgCtr={avgCtr} avgCostPerConversion={avgCost} />
                        ))}
                      </CardBody>
                    )}
                  </SectionCard>
                );
              })}

            {paid.trend && paid.trend.spendData.length > 1 && (
              <SectionCard title="Weekly spend">
                <CardBody>
                  <FollowerGrowthChart data={paid.trend.spendData} platforms={paid.trend.platforms} />
                </CardBody>
              </SectionCard>
            )}

            {(byFormat.length > 0 || contentFormats.length > 0) && (
              <SectionCard
                title={byFormat.length > 0 ? "CTR by creative format" : "Engagement by content format"}
                action={<span className="text-[13px] text-brand-ink-2">{byFormat.length > 0 ? "Delivered work" : "Published posts"}</span>}
              >
                <CardBody>
                  <HBars rows={byFormat.length > 0 ? byFormat.map((f) => ({ label: f.key, value: f.value })) : contentFormats.map((f) => ({ label: f.key, value: f.ctr }))} />
                </CardBody>
              </SectionCard>
            )}

            <SectionCard id="creative" title={all.length > 0 ? "Creative effectiveness" : "Top content"} action={all.length > 0 ? <span className="text-[12px] text-brand-ink-2">{all.length} assets</span> : undefined}>
              {all.length > 0 ? (
                <CardRows>
                  {[...all]
                    .sort((a, b) => (b.performanceCtr ?? -1) - (a.performanceCtr ?? -1))
                    .map((a) => {
                      const tier = performanceTierFor(a.performanceCtr);
                      return (
                        <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3.5">
                          <span className="flex min-w-0 flex-1 basis-[220px] flex-col">
                            <span className="truncate text-[15px]">{a.displayTitle}</span>
                            <span className="truncate text-[12px] text-brand-ink-2">
                              {a.project.name} · {a.format}
                            </span>
                          </span>
                          {a.performanceCtr !== null ? (
                            <>
                              <span className="text-[14px] tabular-nums">{a.performanceCtr}% CTR</span>
                              <StatusPill tone={TIER_TONE[tier.tone]}>{tier.label}</StatusPill>
                            </>
                          ) : (
                            <span className="text-[13px] text-brand-ink-2">Not measured yet</span>
                          )}
                        </li>
                      );
                    })}
                </CardRows>
              ) : topPosts.length > 0 ? (
                <CardRows>
                  {topPosts.map((p) => (
                    <li key={p.id}>
                      <PostDetailDialog post={p}>
                        <div className="flex cursor-pointer items-center gap-3 px-6 py-3.5 hover:bg-brand-chip">
                          <PlatformBadge platform={p.platform} className="size-8" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[15px]">{p.title}</span>
                            <span className="text-[12px] text-brand-ink-2">
                              {p.platform}
                              {p.contentType ? ` · ${p.contentType}` : ""}
                            </span>
                          </span>
                          {p.engagementRate !== null && <span className="text-[14px] tabular-nums">{p.engagementRate}% eng.</span>}
                        </div>
                      </PostDetailDialog>
                    </li>
                  ))}
                </CardRows>
              ) : (
                <CardNote>No performance data yet.</CardNote>
              )}
            </SectionCard>
          </>
        }
        side={
          <>
            {sow.length > 0 && (
              <SectionCard title="KPIs from your SOW" label="SOW KPIs">
                <dl className="m-0 py-1">
                  {sow.map((k) => (
                    <div key={k.label} className="flex items-baseline gap-3 border-t border-brand-line px-6 py-3.5 first:border-t-0">
                      <dt className="min-w-0 flex-1 text-[14px] text-brand-ink-2">
                        {k.label}
                        {k.note && <span className="block text-[12px]">{k.note}</span>}
                      </dt>
                      <dd className="m-0 text-[24px] font-light tabular-nums">{k.value}</dd>
                    </div>
                  ))}
                </dl>
              </SectionCard>
            )}

            {platformCtr.length > 0 && (
              <SectionCard title="By platform">
                <CardRows>
                  {platformCtr.map((p) => (
                    <li key={p.platform} className="flex items-center gap-3 px-6 py-3.5">
                      <PlatformBadge platform={p.platform} className="size-6" />
                      <span className="min-w-0 flex-1 text-[15px]">{p.platform}</span>
                      <span className="flex flex-col items-end">
                        <span className="text-[15px] tabular-nums">{p.ctr}% CTR</span>
                        <span className="text-[12px] text-brand-ink-2">
                          {formatMoney(p.spend, p.currency)}
                          {p.conversions > 0 ? ` · ${p.conversions} conv.` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </CardRows>
                {best && worst && best.platform !== worst.platform && (
                  <p className="m-0 border-t border-brand-line px-6 py-4 text-[13px] leading-[1.5] text-brand-ink-2">
                    {best.platform} runs at {best.ctr}% CTR across {best.count} campaign{best.count === 1 ? "" : "s"}, ahead of {worst.platform} at {worst.ctr}%.
                  </p>
                )}
              </SectionCard>
            )}

            {!paid.inScope && organicPlatforms.length > 0 && (
              <SectionCard title="By platform" label="Organic platforms">
                <CardRows>
                  {organicPlatforms.map((p) => (
                    <li key={p.key} className="flex items-center gap-3 px-6 py-3.5">
                      <PlatformBadge platform={p.key} className="size-6" />
                      <span className="min-w-0 flex-1 text-[15px]">{p.key}</span>
                      <span className="text-[15px] tabular-nums">{p.value}% eng.</span>
                    </li>
                  ))}
                </CardRows>
              </SectionCard>
            )}

            {kpis.volumeByPlatform.some((v) => v.target > 0) && (
              <SectionCard title="Content this month" action={<span className="text-[12px] text-brand-ink-2">vs SOW minimum</span>}>
                <CardRows>
                  {kpis.volumeByPlatform
                    .filter((v) => v.target > 0)
                    .map((v) => (
                      <li key={v.platform} className="flex flex-col gap-2 px-6 py-3.5">
                        <span className="flex items-baseline justify-between gap-3 text-[14px]">
                          <span className="flex items-center gap-2">
                            <PlatformBadge platform={v.platform} className="size-5" />
                            {v.platform}
                          </span>
                          <span className="tabular-nums text-brand-ink-2">
                            {v.published} of {v.target}
                          </span>
                        </span>
                        <Meter value={v.published} max={v.target} label={`${v.published} of ${v.target} published on ${v.platform}`} />
                      </li>
                    ))}
                </CardRows>
              </SectionCard>
            )}

            {outcomeBars.length > 1 && (
              <SectionCard title="Business outcomes" action={<span className="text-[12px] text-brand-ink-2">{hasRevenue ? "Revenue" : "Leads"} per period</span>}>
                <CardBody>
                  <DiscreteMetricBars data={outcomeBars} label={hasRevenue ? "Revenue" : "Leads"} />
                </CardBody>
              </SectionCard>
            )}

            {spendByPlatform.length > 1 && !mixedCurrencies && (
              <SectionCard title="Spend by platform">
                <CardBody>
                  <MixDonutChart data={spendByPlatform} centerValue={formatMoney(spendByPlatform.reduce((s, p) => s + p.value, 0), paid.campaigns[0]?.currency ?? "USD")} centerLabel="total spend" />
                  <div className="mt-3 flex flex-col gap-1.5">
                    {spendByPlatform.map((p, i) => (
                      <div key={p.name} className="flex items-center justify-between text-[13px]">
                        <span className="flex items-center gap-1.5 text-brand-ink-2">
                          <span className="size-2 rounded-full" style={{ backgroundColor: MIX_DONUT_COLORS[i % MIX_DONUT_COLORS.length] }} />
                          {p.name}
                        </span>
                        <span>{formatMoney(p.value, paid.campaigns[0]?.currency ?? "USD")}</span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </SectionCard>
            )}

            {paid.errors.map((e) => (
              <SectionCard key={e.platform} title={`Couldn't reach ${e.platform} Ads`} tone="muted">
                <CardNote>{e.message}</CardNote>
              </SectionCard>
            ))}
          </>
        }
      />
    </div>
  );
}
