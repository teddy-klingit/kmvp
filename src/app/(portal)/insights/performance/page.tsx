import { getPortalViewer } from "@/lib/current-viewer";
import { connectHref, ctrByFormat, loadMeasuredAssets, loadPaidMedia, loadTakeaways } from "@/lib/insights-data";
import { compact, dayLabel, loadDaily, money, parseRange, pct } from "@/lib/insights/daily";
import { paidTiles } from "@/lib/insights/tiles";
import { generatePerformanceInsightsAction } from "@/lib/actions/performance-actions";
import { cn } from "@/lib/utils";
import { PageGrid } from "@/components/ds/page-grid";
import { FilterChips } from "@/components/ds/filter-chips";
import { PillLink } from "@/components/ds/pill-link";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { ChartCard, SkeletonChart, StatTile, WhySheet } from "@/components/insights/cards";
import { BarList, ColumnChart, DumbbellRow, LineChart } from "@/components/insights/charts";
import { SubBar } from "@/components/insights/toolbar";
import { Suspense } from "react";

/** A campaign whose CTR is under half the reference (creative average, or the account's own) needs a look. */
const FAR_BELOW = 0.5;

/**
 * Insights → Performance (InsightsPerformance.dc.html): five tiles with sparklines, spend per day and clicks
 * per day as two charts on one x-axis (never a dual axis), the campaigns table and creative effectiveness; on
 * the side the agent's "What to do", fatigue watch and CTR by format. Daily charts only from stored days.
 */
export default async function InsightsPerformancePage({ searchParams }: { searchParams: Promise<{ platform?: string; range?: string }> }) {
  const { platform, range } = await searchParams;
  const days = parseRange(range);
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [paid, daily, { all, measured }, { actions }, connect] = await Promise.all([
    loadPaidMedia(clientId),
    loadDaily(clientId, days, platform ?? null),
    loadMeasuredAssets(clientId),
    loadTakeaways(clientId),
    connectHref(clientId),
  ]);

  const platforms = daily.platforms.length ? daily.platforms : [...new Set(paid.campaigns.map((c) => c.platform))];
  const href = (p?: string) => {
    const q = new URLSearchParams();
    if (p) q.set("platform", p);
    if (range) q.set("range", range);
    return `/insights/performance${q.size ? `?${q}` : ""}`;
  };
  const fallback = platform ? paid.campaigns.filter((c) => c.platform === platform) : paid.campaigns;
  const source = platform ?? (daily.has ? daily.platforms.join(" + ") : paid.isSample ? "sample data" : paid.connected.join(" + "));
  const tiles = paid.inScope ? paidTiles(daily, daily.has ? [] : fallback, days, source) : [];
  const currency = daily.currency ?? fallback[0]?.currency ?? null;

  const avg = measured.length ? measured.reduce((a, m) => a + m.ctr, 0) / measured.length : null;
  const campaigns = daily.has
    ? daily.campaigns.map((c) => ({ id: `${c.platform}:${c.campaignId}`, name: c.name, sub: `${c.platform} · ${c.accountName}${c.live ? " · live" : ""}`, spend: c.spend, impressions: c.impressions, clicks: c.clicks, ctr: c.ctr, live: c.live }))
    : fallback.map((c) => ({ id: `${c.platform}:${c.campaignId}`, name: c.campaignName, sub: `${c.platform} · ${c.accountName}`, spend: c.spend, impressions: c.impressions, clicks: c.clicks, ctr: c.ctr, live: !paid.isSample }));
  const reference = avg ?? (daily.has ? daily.totals.ctr : null);
  const maxSpend = Math.max(...campaigns.map((c) => c.spend), 1);
  const flagged = (ctr: number) => reference !== null && ctr < reference * FAR_BELOW;

  const fatigue = daily.campaigns
    .filter((c): c is typeof c & { ctrLast7: number; ctrTrailing: number } => c.ctrLast7 !== null && c.ctrTrailing !== null && c.ctrTrailing > 0)
    .map((c) => ({ ...c, change: (c.ctrLast7 - c.ctrTrailing) / c.ctrTrailing }))
    .sort((a, b) => a.change - b.change)
    .slice(0, 4);
  const formats = ctrByFormat(measured);
  const unmeasured = all.filter((a) => a.performanceCtr === null);
  const xEvery = days === 7 ? 1 : days === 30 ? 7 : 14;
  const briefQ = actions.map((a) => a.brief || a.headline).join("; ");

  return (
    <div className="flex flex-col gap-6">
      <Suspense>
        <SubBar
          chips={
            platforms.length > 0 ? (
              <FilterChips label="Platform" items={[{ label: "All platforms", href: href(), active: !platform }, ...platforms.map((p) => ({ label: p, href: href(p), active: platform === p }))]} />
            ) : null
          }
        />
      </Suspense>

      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-4 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-5">
          {tiles.map((t) => (
            <StatTile key={t.key} icon={t.icon} label={t.label === "Ad spend" ? "Spend" : t.label === "Click-through rate" ? "CTR" : t.label} value={t.value} spark={t.spark} delta={t.delta} />
          ))}
        </div>
      )}

      <PageGrid
        main={
          <>
            {daily.has ? (
              <ChartCard
                title="Spend and clicks per day"
                table={{ columns: ["Day", `Spend${currency ? `, ${currency}` : ""}`, "Clicks", "Impressions"], rows: daily.days.map((d) => [dayLabel(d.date), Math.round(d.spend), d.clicks, d.impressions]) }}
              >
                <span className="text-[16px]">Spend{currency ? `, ${currency}` : ""}</span>
                <ColumnChart data={daily.days.map((d) => ({ x: dayLabel(d.date), values: [d.spend] }))} series={[{ name: "Spend" }]} height={180} xEvery={xEvery} />
                <span className="pt-3 text-[16px]">Clicks</span>
                <LineChart x={daily.days.map((d) => dayLabel(d.date))} series={[{ name: "Clicks", values: daily.days.map((d) => d.clicks) }]} height={140} xEvery={xEvery} />
              </ChartCard>
            ) : paid.inScope && !paid.isSample && paid.connected.length === 0 ? (
              <ChartCard title="Spend and clicks per day">
                <SkeletonChart line="Connect an ad account to see every day's spend and clicks." action={<PillLink href={connect} size="sm">Connect</PillLink>} />
              </ChartCard>
            ) : null}

            {campaigns.length > 0 && (
              <ChartCard
                flush
                title="Campaigns"
                meta={<span className="font-brand-mono text-[12px] text-brand-ink">{paid.isSample ? `${campaigns.length} SAMPLE` : `${campaigns.filter((c) => c.live).length} LIVE`}</span>}
                table={{ columns: ["Campaign", "Spend", "Impressions", "Clicks", "CTR"], rows: campaigns.map((c) => [c.name, money(c.spend, currency), c.impressions, c.clicks, `${c.ctr}%`]) }}
              >
                <div className="@container/table">
                  <div className="grid grid-cols-[minmax(0,1fr)_96px_72px] gap-3 border-b border-brand-line px-6 py-3 text-[13px] text-brand-mute @min-[640px]/table:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_80px_64px_72px]">
                    <span>Campaign</span>
                    <span>Spend</span>
                    <span className="hidden @min-[640px]/table:block">Impressions</span>
                    <span className="hidden @min-[640px]/table:block">Clicks</span>
                    <span>CTR</span>
                  </div>
                  <ul className="m-0 list-none p-0">
                    {campaigns.map((c) => (
                      <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_96px_72px] items-center gap-3 border-b border-brand-line px-6 py-3.5 last:border-b-0 @min-[640px]/table:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_80px_64px_72px]">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[15px]">{c.name}</span>
                          <span className="truncate text-[12px] text-brand-mute">{c.sub}</span>
                        </span>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span aria-hidden className="hidden h-2 shrink-0 rounded-r-[4px] bg-brand-ink @min-[640px]/table:block" style={{ width: `${Math.max(4, (c.spend / maxSpend) * 72)}px` }} />
                          <span className="truncate text-[14px] tabular-nums">{money(c.spend, currency)}</span>
                        </span>
                        <span className="hidden text-[14px] tabular-nums @min-[640px]/table:block">{compact(c.impressions)}</span>
                        <span className="hidden text-[14px] tabular-nums @min-[640px]/table:block">{c.clicks.toLocaleString("en-GB")}</span>
                        <span className="flex items-center gap-1.5 text-[14px] tabular-nums">
                          {flagged(c.ctr) && <span aria-label="Far below average" className="size-2 rounded-full bg-brand-orange" />}
                          {pct(c.ctr)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {reference !== null && campaigns.some((c) => flagged(c.ctr)) && (
                    <p className="m-0 flex items-center gap-1.5 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">
                      <span aria-hidden className="size-2 rounded-full bg-brand-orange" />
                      Far below your {avg !== null ? "creative" : "account"} average ({pct(reference)})
                    </p>
                  )}
                </div>
              </ChartCard>
            )}

            <ChartCard
              id="creative"
              title="Creative effectiveness"
              meta={all.length > 0 ? <span className="font-brand-mono text-[12px] text-brand-ink">{all.length} ASSETS</span> : undefined}
              table={{ columns: ["Asset", "Format", "CTR"], rows: [...measured].sort((a, b) => b.ctr - a.ctr).map((a) => [a.title, a.format, `${a.ctr}%`]) }}
            >
              {measured.length > 0 ? (
                <>
                  <div className="flex flex-col">
                    <span className="text-[16px]">Click-through rate per asset, delivered work</span>
                    <span className="text-[14px] text-brand-mute">Ink = above your average · grey = below</span>
                  </div>
                  <BarList rows={[...measured].sort((a, b) => b.ctr - a.ctr).map((a) => ({ label: a.title, sub: a.format, value: a.ctr, display: `${a.ctr}%`, thumb: a.thumbnail, thumbColor: a.color }))} reference={avg !== null ? { value: avg, label: `Your average ${avg.toFixed(1)}%` } : undefined} labelWidth={190} />
                </>
              ) : (
                <SkeletonChart line="Delivered creative gets a CTR here once it has run." action={<PillLink href="/brief/new" size="sm">Start a brief</PillLink>} />
              )}
              {unmeasured.length > 0 && (
                <details className="pt-4 text-[13px] text-brand-ink-2">
                  <summary className="cursor-pointer list-none">
                    {unmeasured.length} asset{unmeasured.length === 1 ? "" : "s"} not measured yet · <span className="text-brand-ink underline underline-offset-2">show</span>
                  </summary>
                  <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                    {unmeasured.map((a) => (
                      <li key={a.id}>
                        {a.displayTitle} · {a.format}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </ChartCard>
          </>
        }
        side={
          <>
            <ChartCard flush title="What to do" meta={<span className="font-brand-mono text-[12px] text-brand-ink">BY THE PERFORMANCE AGENT</span>}>
              {actions.length > 0 ? (
                <>
                  <ol className="m-0 list-none p-0">
                    {actions.map((a, i) => (
                      <li key={a.headline} className="flex gap-3 border-b border-brand-line px-6 py-4">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-lime-pale text-[12px] tabular-nums">{i + 1}</span>
                        <span className="flex min-w-0 flex-1 flex-col gap-2">
                          <span className="text-[15px] leading-[1.4]">{a.headline}</span>
                          <span className="flex items-center gap-2">
                            {a.chip && <span className="rounded-full bg-brand-chip px-2.5 py-0.5 text-[12px] text-brand-ink-2">{a.chip}</span>}
                            <span className="flex-1" />
                            <WhySheet title={a.headline} reasoning={a.why} />
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="px-6 py-4">
                    <PillLink href={`/brief/new?${new URLSearchParams({ q: briefQ })}`} variant="primary" size="sm">
                      Make these a brief
                    </PillLink>
                  </div>
                </>
              ) : (
                <div className="px-6 py-5">
                  <SkeletonChart shape="matrix" line="The performance agent picks up to three things to do." action={<AgentButton action={generatePerformanceInsightsAction} label="Ask the agent" pendingLabel="Reading…" />} />
                </div>
              )}
            </ChartCard>

            <ChartCard title="Fatigue watch" table={{ columns: ["Campaign", "CTR, 23 days before", "CTR, last 7 days"], rows: fatigue.map((c) => [c.name, `${c.ctrTrailing}%`, `${c.ctrLast7}%`]) }}>
              {fatigue.length > 0 ? (
                <>
                  <span className="text-[14px] leading-[1.45] text-brand-ink-2">CTR, trailing average (grey) → this week (ink)</span>
                  <div className="flex flex-col">
                    {fatigue.map((c) => (
                      <DumbbellRow key={`${c.platform}:${c.campaignId}`} label={c.name} before={c.ctrTrailing} after={c.ctrLast7} format={{ kind: "pct" }} worse={c.change <= -0.2} note={c.ctrLast7 === 0 ? "Likely a delivery or tracking error" : undefined} />
                    ))}
                  </div>
                </>
              ) : (
                <SkeletonChart shape="line" line={paid.isSample ? "Fatigue needs daily numbers from a connected account." : "Needs a week of delivery to compare."} />
              )}
            </ChartCard>

            {formats.length > 0 && (
              <ChartCard title="CTR by format" table={{ columns: ["Format", "CTR", "Assets"], rows: formats.map((f) => [f.label, `${f.value}%`, f.count]) }}>
                <BarList rows={formats.map((f) => ({ label: f.label, value: f.value, display: `${f.value}%`, tone: avg !== null && f.value >= avg ? "ink" : "grey" }))} labelWidth={120} compact />
              </ChartCard>
            )}

            {paid.errors.map((e) => (
              <ChartCard key={e.platform} title={`Couldn't reach ${e.platform} Ads`}>
                <span className={cn("text-[13px] text-brand-ink-2")}>{e.message}</span>
              </ChartCard>
            ))}
          </>
        }
      />
    </div>
  );
}
