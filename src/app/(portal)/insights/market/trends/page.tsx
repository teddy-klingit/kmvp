import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { generateMarketIntelligenceAction } from "@/lib/actions/market-intelligence-actions";
import { parseRange } from "@/lib/insights/daily";
import { loadSignals, signalSource, signalsPerWeek, weeksFor } from "@/lib/insights/signals";
import { PageGrid } from "@/components/ds/page-grid";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { ChartCard, SkeletonChart } from "@/components/insights/cards";
import { ColumnChart, StackBar } from "@/components/insights/charts";
import { INK } from "@/components/insights/tokens";

type Theme = { theme: string; articleTitles: string[]; relevance?: "High" | "Medium" | "Low" };
const LEVELS = [
  { key: "High", color: INK },
  { key: "Medium", color: "#8A8A8A" },
  { key: "Low", color: "#DCD6C8" },
] as const;

/**
 * Market → Trends (InsightsTrends.dc.html): the agent's themes as ranked bars (each opens to its headlines),
 * new category headlines per week, and how relevant the themes are for you.
 */
export default async function MarketTrendsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = parseRange((await searchParams).range);
  const viewer = await getPortalViewer();
  const weeks = weeksFor(days);
  const [brief, signals, allTrends] = await Promise.all([
    prisma.trendBrief.findUnique({ where: { clientId: viewer.clientId } }),
    loadSignals(viewer.clientId, weeks),
    prisma.marketSignal.findMany({ where: { clientId: viewer.clientId, type: "TREND" }, select: { title: true, summary: true, source: true, type: true } }),
  ]);
  const themes = jsonArray<Theme>(brief?.themes).sort((a, b) => b.articleTitles.length - a.articleTitles.length);
  const bySignal = new Map(allTrends.map((s) => [s.title, s]));
  const max = Math.max(...themes.map((t) => t.articleTitles.length), 1);
  const headlines = new Set(themes.flatMap((t) => t.articleTitles)).size;
  const perWeek = signalsPerWeek(signals.filter((s) => s.type === "TREND"), weeks);
  const rated = themes.filter((t) => t.relevance);
  const watch = rated.find((t) => t.relevance === "High");

  return (
    <PageGrid
      main={
        <ChartCard
          flush
          title="Themes in the news"
          meta={<span className="font-brand-mono text-[12px] text-brand-ink">HEADLINES</span>}
          action={brief ? <AgentButton action={generateMarketIntelligenceAction} label="Refresh" pendingLabel="Reading…" /> : undefined}
          table={{ columns: ["Theme", "Headlines", "Relevance"], rows: themes.map((t) => [t.theme, t.articleTitles.length, t.relevance ?? ""]) }}
        >
          {themes.length > 0 ? (
            <>
              <ul className="m-0 list-none p-0">
                {themes.map((t) => {
                  const sources = [...new Set(t.articleTitles.map((a) => (bySignal.get(a) ? signalSource(bySignal.get(a)!) : null)).filter(Boolean))];
                  return (
                    <li key={t.theme} className="border-b border-brand-line last:border-b-0">
                      <details className="group">
                        <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] items-center gap-4 px-6 py-4 hover:bg-[#FBF9F4]">
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[15px]">{t.theme}</span>
                            {sources.length > 0 && <span className="truncate text-[13px] text-brand-mute">{sources.join(" · ")}</span>}
                          </span>
                          <span className="h-3.5">
                            <span className="block h-full rounded-r-[4px] bg-brand-ink" style={{ width: `${(t.articleTitles.length / max) * 70}%` }} />
                          </span>
                          <span className="text-right text-[15px] tabular-nums">{t.articleTitles.length}</span>
                        </summary>
                        <ul className="m-0 flex list-none flex-col gap-1.5 px-6 pb-4 pl-6">
                          {t.articleTitles.map((a) => {
                            const s = bySignal.get(a);
                            return (
                              <li key={a} className="text-[13px] leading-[1.5] text-brand-ink-2">
                                &ldquo;{a}&rdquo;{s ? ` · ${signalSource(s)}` : ""}
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    </li>
                  );
                })}
              </ul>
              <p className="m-0 px-6 pb-5 pt-3 text-[13px] text-brand-mute">Grouped by the market agent from {headlines} headline{headlines === 1 ? "" : "s"} · click a theme to read them</p>
            </>
          ) : (
            <div className="px-6 py-5">
              <SkeletonChart line="The market agent groups category headlines into the themes shaping it." action={<AgentButton action={generateMarketIntelligenceAction} label="Generate" pendingLabel="Reading…" />} />
            </div>
          )}
        </ChartCard>
      }
      side={
        <>
          <ChartCard title="Category coverage" table={{ columns: ["Week of", "New headlines"], rows: perWeek.data.map((d) => [d.x, d.values[0] ?? 0]) }}>
            {perWeek.total > 0 ? (
              <>
                <span className="text-[16px]">New headlines per week</span>
                <ColumnChart data={perWeek.data.map((d) => ({ x: d.x, values: [d.values[0] ?? 0] }))} series={[{ name: "Headlines", color: INK }]} height={170} xEvery={weeks > 6 ? 3 : 1} />
              </>
            ) : (
              <SkeletonChart line={`No new category headlines in the last ${weeks} weeks.`} />
            )}
          </ChartCard>

          <ChartCard title="Relevance for you" table={{ columns: ["Relevance", "Themes"], rows: LEVELS.map((l) => [l.key, rated.filter((t) => t.relevance === l.key).length]) }}>
            {rated.length > 0 ? (
              <>
                <StackBar segments={LEVELS.map((l) => ({ label: l.key, value: rated.filter((t) => t.relevance === l.key).length, color: l.color }))} />
                {watch && <span className="text-[15px]">{watch.theme} is the one to watch.</span>}
              </>
            ) : (
              <SkeletonChart line="Refresh the themes to rate how much each matters for you." action={<AgentButton action={generateMarketIntelligenceAction} label={brief ? "Refresh" : "Generate"} pendingLabel="Reading…" />} />
            )}
          </ChartCard>
        </>
      }
    />
  );
}
