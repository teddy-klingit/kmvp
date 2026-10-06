import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { connectHref, dataSources, loadContentKpis, loadMeasuredAssets, loadPaidMedia, loadTakeaways, takeawayHref } from "@/lib/insights-data";
import { loadDaily, parseRange, sinceDays } from "@/lib/insights/daily";
import { paidTiles } from "@/lib/insights/tiles";
import { loadSignals, signalsPerWeek, weeksFor } from "@/lib/insights/signals";
import { jsonArray } from "@/lib/utils";
import { generatePerformanceInsightsAction } from "@/lib/actions/performance-actions";
import { PageGrid } from "@/components/ds/page-grid";
import { PillLink, monoLink } from "@/components/ds/pill-link";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { ChartCard, SkeletonChart, StatTile, Takeaway } from "@/components/insights/cards";
import { BarList, ColumnChart, Legend, MiniBars } from "@/components/insights/charts";
import { cn } from "@/lib/utils";

const STATE_LABEL = { live: "Live", sample: "Sample data", demo: "Demo" } as const;

/**
 * Insights → Overview (InsightsOverview.dc.html): four tiles, the performance agent's three takeaways, the
 * creative leaderboard and previews of Audience and SEO; on the side the data sources and the market pulse.
 * Every number is from stored data; a block without data is a grey skeleton with one line and one button.
 */
export default async function InsightsOverviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = parseRange((await searchParams).range);
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [paid, daily, { all, measured }, { takeaways }, sources, signals, connect, kpis, audits, mi] = await Promise.all([
    loadPaidMedia(clientId),
    loadDaily(clientId, days),
    loadMeasuredAssets(clientId),
    loadTakeaways(clientId),
    dataSources(clientId),
    loadSignals(clientId, weeksFor(days)),
    connectHref(clientId),
    loadContentKpis(clientId),
    prisma.siteAudit.findMany({ where: { clientId }, orderBy: { subject: "asc" } }),
    prisma.marketIntelligenceBrief.findUnique({ where: { clientId } }),
  ]);

  const source = daily.has ? daily.platforms.join(" + ") : paid.isSample ? "sample data" : paid.connected.join(" + ");
  const tiles = paid.inScope ? paidTiles(daily, paid.campaigns, days, source).filter((t) => t.key !== "impressions").slice(0, 4) : [];

  const avg = measured.length ? measured.reduce((a, m) => a + m.ctr, 0) / measured.length : 0;
  const leaders = [...measured].sort((a, b) => b.ctr - a.ctr).slice(0, 6);
  const pulse = signalsPerWeek(signals, weeksFor(days));
  const lines = jsonArray<{ text: string }>(mi?.points).slice(0, 2).map((p) => p.text);
  const week = signals.filter((s) => s.publishedAt.getTime() >= sinceDays(7));
  const pulseLines = lines.length
    ? lines
    : [
        week.filter((s) => s.type === "COMPETITOR").length > 0 && `${week.filter((s) => s.type === "COMPETITOR").length} competitor moves this week`,
        week.filter((s) => s.type === "TREND").length > 0 && `${week.filter((s) => s.type === "TREND").length} new category trends this week`,
      ].filter((x): x is string => Boolean(x));

  const followers = kpis.followerGrowth.filter((f) => f.followerCount !== null);
  const own = audits.find((a) => a.subject === "Own site");
  const seoRows = audits.filter((a) => a.seoScore !== null);
  // A demo account's connections are all demo ones: they count as connected there (and say "Demo").
  const connectedCount = sources.filter((s) => s.state === "live" || s.state === "sample" || (viewer.client.isDemo && s.state === "demo")).length;
  const firstBrief = takeaways.findIndex((t) => t.action.kind === "brief");

  return (
    <div className="flex flex-col gap-6">
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-4 min-[1000px]:grid-cols-4">
          {tiles.map((t) => (
            <StatTile key={t.key} icon={t.icon} label={t.label} value={t.value} context={t.context} spark={t.spark} />
          ))}
        </div>
      )}

      {takeaways.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 min-[800px]:grid-cols-3">
          {takeaways.map((t, i) => (
            <Takeaway
              key={t.headline}
              tag={t.tag}
              number={t.metric || null}
              headline={t.headline}
              chart={t.compare.length > 0 ? <MiniBars rows={t.compare.map((c, j) => ({ label: c.label, value: c.value, display: c.display, tone: j === 0 ? "ink" : "grey" }))} /> : null}
              action={{ label: t.action.label, href: takeawayHref(t) }}
              why={t.why}
              primary={i === firstBrief}
            />
          ))}
        </div>
      ) : (
        <ChartCard title="This week's takeaways">
          <SkeletonChart line="The performance agent writes three takeaways from your numbers every week." action={<AgentButton action={generatePerformanceInsightsAction} label="Write takeaways" pendingLabel="Reading the numbers…" />} />
        </ChartCard>
      )}

      <PageGrid
        main={
          <>
            <ChartCard
              title="Creative leaderboard"
              meta={
                all.length > 0 ? (
                  <Link href="/insights/performance#creative" className={monoLink}>
                    ALL {all.length}
                  </Link>
                ) : undefined
              }
              table={{ columns: ["Asset", "Format", "CTR"], rows: leaders.map((a) => [a.title, a.format, `${a.ctr}%`]) }}
            >
              {leaders.length > 0 ? (
                <>
                  <div className="flex flex-col">
                    <span className="text-[16px]">Click-through rate per asset</span>
                    <span className="text-[14px] text-brand-mute">Ink = above your average</span>
                  </div>
                  <BarList rows={leaders.map((a) => ({ label: a.title, sub: a.format, value: a.ctr, display: `${a.ctr}%`, thumb: a.thumbnail, thumbColor: a.color }))} reference={{ value: avg, label: `Your average ${avg.toFixed(1)}%` }} labelWidth={200} />
                </>
              ) : (
                <SkeletonChart line="Delivered creative gets a CTR here once it has run." action={<PillLink href="/brief/new" size="sm">Start a brief</PillLink>} />
              )}
            </ChartCard>

            <div className="grid grid-cols-1 gap-6 @min-[600px]/col:grid-cols-2">
              <ChartCard title="Audience" meta={followers.length > 0 ? <Link href="/insights/audience" className={monoLink}>OPEN</Link> : undefined}>
                {followers.length > 0 ? (
                  <>
                    <span className="text-[14px] text-brand-ink-2">Followers by platform{sources.some((s) => s.state === "demo") ? " · demo" : ""}</span>
                    <MiniBars rows={followers.map((f, i) => ({ label: f.platform, value: f.followerCount, display: f.followerCount.toLocaleString("en-GB"), tone: i === 0 ? "ink" : "grey" }))} />
                  </>
                ) : (
                  <SkeletonChart line="Connect LinkedIn and Google Analytics" action={<PillLink href={connect} size="sm">Connect</PillLink>} />
                )}
              </ChartCard>
              <ChartCard title="SEO & AI visibility" meta={own ? <Link href="/insights/seo" className={monoLink}>OPEN</Link> : undefined}>
                {seoRows.length > 0 ? (
                  <>
                    <span className="text-[14px] text-brand-ink-2">SEO health score</span>
                    <MiniBars rows={seoRows.sort((a, b) => (a.subject === "Own site" ? -1 : b.subject === "Own site" ? 1 : 0)).slice(0, 4).map((a) => ({ label: a.subject === "Own site" ? viewer.client.name : a.subject, value: a.seoScore!, display: String(a.seoScore), tone: a.subject === "Own site" ? "ink" : "grey" }))} />
                  </>
                ) : (
                  <SkeletonChart line={own ? "The audit has no SEO score yet" : "No audit yet"} action={<PillLink href="/insights/seo" size="sm">Run audit</PillLink>} />
                )}
              </ChartCard>
            </div>
          </>
        }
        side={
          <>
            <ChartCard flush title="Data sources" meta={<span className="font-brand-mono text-[12px] text-brand-ink">{connectedCount} OF {sources.length}</span>}>
              <ul className="m-0 list-none p-0">
                {sources.map((s) => (
                  <li key={s.name} className="flex min-h-14 items-center gap-3 border-t border-brand-line px-6 py-2.5 first:border-t-0">
                    <span aria-hidden className={cn("size-2 rounded-full", s.state === "live" ? "bg-[#8D9E47]" : s.state === "connect" ? "bg-[#C2C3C5]" : "bg-[#D08A2E]")} />
                    <span className="min-w-0 flex-1 text-[15px]">{s.name}</span>
                    {s.state === "connect" ? (
                      <PillLink href={connect} size="sm">
                        Connect
                      </PillLink>
                    ) : (
                      <span className="text-[13px] text-brand-mute">{STATE_LABEL[s.state]}</span>
                    )}
                  </li>
                ))}
              </ul>
            </ChartCard>

            <ChartCard
              title="Market pulse"
              meta={
                <Link href="/insights/market" className={monoLink}>
                  OPEN
                </Link>
              }
              table={{ columns: ["Week", ...pulse.series.map((s) => s.name)], rows: pulse.data.map((d) => [d.x, ...d.values]) }}
            >
              {pulse.total > 0 ? (
                <>
                  <span className="text-[16px]">Signals per week</span>
                  <Legend items={pulse.series.map((s) => ({ label: s.name, color: s.color }))} />
                  <ColumnChart data={pulse.data} series={pulse.series} height={150} />
                  {pulseLines.map((l) => (
                    <span key={l} className="text-[14px]">
                      {l}
                    </span>
                  ))}
                </>
              ) : (
                <SkeletonChart line="No signals yet. Competitor and news checks run when you open Market." action={<PillLink href="/insights/market" size="sm">Open Market</PillLink>} />
              )}
            </ChartCard>
          </>
        }
      />
    </div>
  );
}
