import Link from "next/link";
import { ChartColumn, Newspaper, Shield, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { getIndustryNews } from "@/lib/integrations/industry-news";
import { getCompetitorAdLibraryActivity } from "@/lib/integrations/meta-ad-library";
import { getLinkedInCompetitorAds } from "@/lib/integrations/linkedin-ad-library";
import { recordCompetitorSnapshots, recordNewsSignals } from "@/lib/integrations/market-signals";
import { generateMarketIntelligenceAction } from "@/lib/actions/market-intelligence-actions";
import { parseRange, sinceDays } from "@/lib/insights/daily";
import { loadSignals, perfChange, signalSource, signalsPerWeek, SIGNAL_TYPES, weeksFor } from "@/lib/insights/signals";
import { PageGrid } from "@/components/ds/page-grid";
import { PillLink, monoLink } from "@/components/ds/pill-link";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { ChartCard, SkeletonChart } from "@/components/insights/cards";
import { ColumnChart, Legend, StackBar } from "@/components/insights/charts";
import { ORANGE, INK } from "@/components/insights/tokens";
import type { MarketSignal } from "@/generated/prisma";

const ICON = {
  PERFORMANCE: { icon: ChartColumn, bg: "bg-brand-pink-pale" },
  COMPETITOR: { icon: Shield, bg: "bg-brand-lime-pale" },
  TREND: { icon: TrendingUp, bg: "bg-brand-lavender-pale" },
  MARKET: { icon: Newspaper, bg: "bg-brand-peach-pale" },
} as const;
const BAR = { competitor: "bg-[#8D9E47]", trend: "bg-[#3B6FB6]", performance: "bg-[#B455B6]" } as const;
const WORTH_KNOWING_SHOWN = 4;

type Implication = { text: string; type: keyof typeof BAR; actionLabel: string | null };

/**
 * Market → Feed (InsightsMarket.dc.html): signals per week, then "Needs a look" (high relevance) and "Worth
 * knowing" as one-line rows; on the side the market agent's "What this means" (≤2 lines + one action) and the
 * signal mix. Opening the page runs the competitor and news checks, as before.
 */
export default async function MarketFeedPage({ searchParams }: { searchParams: Promise<{ range?: string; all?: string }> }) {
  const { range, all } = await searchParams;
  const days = parseRange(range);
  const viewer = await getPortalViewer();
  const client = viewer.client;
  const competitorBrands = jsonArray<string>(client.competitorBrands);
  const newsQuery = client.industry ? `${client.industry} marketing` : client.name;

  // A demo account's signals are seeded: no live news or ad-library checks.
  const live = !client.isDemo;
  const [news, adLibraryResults, linkedInAdResults, brief] = await Promise.all([
    live ? getIndustryNews(newsQuery) : Promise.resolve([]),
    live && competitorBrands.length ? getCompetitorAdLibraryActivity(competitorBrands) : Promise.resolve([]),
    live && competitorBrands.length ? getLinkedInCompetitorAds(competitorBrands) : Promise.resolve([]),
    prisma.marketIntelligenceBrief.findUnique({ where: { clientId: viewer.clientId } }),
  ]);
  if (live) await Promise.all([recordCompetitorSnapshots(client.id, adLibraryResults, linkedInAdResults), recordNewsSignals(client.id, news)]);
  const weeks = weeksFor(days);
  const signals = await loadSignals(client.id, weeks);
  const perWeek = signalsPerWeek(signals, weeks);
  const inRange = signals.filter((s) => s.publishedAt.getTime() >= sinceDays(days));
  const needs = inRange.filter((s) => s.relevance === "High relevance");
  const worth = inRange.filter((s) => s.relevance !== "High relevance");
  const shownWorth = all ? worth : worth.slice(0, WORTH_KNOWING_SHOWN);
  const points = jsonArray<Implication>(brief?.points).slice(0, 2);
  const action = points.find((p) => p.actionLabel);
  const allHref = `/insights/market?${new URLSearchParams({ ...(range ? { range } : {}), all: "1" })}`;

  return (
    <PageGrid
      main={
        <>
          <ChartCard
            title="Signals per week"
            meta={<span className="font-brand-mono text-[12px] text-brand-ink">{perWeek.total} SIGNALS</span>}
            table={{ columns: ["Week of", ...perWeek.series.map((s) => s.name)], rows: perWeek.data.map((d) => [d.x, ...d.values]) }}
          >
            {perWeek.total > 0 ? (
              <>
                <Legend items={perWeek.series.map((s) => ({ label: s.name, color: s.color }))} />
                <ColumnChart data={perWeek.data} series={perWeek.series} height={190} xEvery={weeks > 8 ? 3 : 1} />
              </>
            ) : (
              <SkeletonChart line="No signals yet. Add competitors and they're checked every time you open Market." action={<PillLink href="/account" size="sm">Add competitors</PillLink>} />
            )}
          </ChartCard>

          {needs.length > 0 && (
            <ChartCard flush title="Needs a look" meta={<span className="font-brand-mono text-[12px] text-brand-ink">{needs.length}</span>}>
              <SignalRows signals={needs} />
            </ChartCard>
          )}

          {worth.length > 0 && (
            <ChartCard
              flush
              title="Worth knowing"
              meta={
                !all && worth.length > WORTH_KNOWING_SHOWN ? (
                  <Link href={allHref} scroll={false} className={monoLink}>
                    ALL {worth.length}
                  </Link>
                ) : undefined
              }
            >
              <SignalRows signals={shownWorth} />
            </ChartCard>
          )}
        </>
      }
      side={
        <>
          <ChartCard title="What this means for you" action={brief ? <AgentButton action={generateMarketIntelligenceAction} label="Refresh" pendingLabel="Reading…" /> : undefined}>
            {points.length > 0 ? (
              <>
                {points.map((p) => (
                  <div key={p.text} className="flex gap-3">
                    <span aria-hidden className={`w-1 shrink-0 rounded-full ${BAR[p.type] ?? "bg-brand-ink"}`} />
                    <span className="text-[15px] leading-[1.45]">{p.text}</span>
                  </div>
                ))}
                {action && (
                  <PillLink href={`/brief/new?${new URLSearchParams({ q: action.text })}`} variant="primary" size="sm" className="mt-1 self-start">
                    {action.actionLabel}
                  </PillLink>
                )}
              </>
            ) : (
              <SkeletonChart shape="matrix" line="The market agent turns these signals into what they mean for you." action={<AgentButton action={generateMarketIntelligenceAction} label={brief ? "Refresh" : "Generate"} pendingLabel="Reading…" />} />
            )}
          </ChartCard>

          {perWeek.total > 0 && (
            <ChartCard title="Signal mix" meta={<span className="font-brand-mono text-[12px] text-brand-ink">LAST {weeks} WEEKS</span>} table={{ columns: ["Type", "Signals"], rows: perWeek.totals.map((t) => [t.label, t.value]) }}>
              <StackBar segments={perWeek.totals.map((t) => ({ label: t.label, value: t.value, color: t.color }))} />
            </ChartCard>
          )}
        </>
      }
    />
  );
}

const short = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);

/** "Pay later awareness · NO" CTR down 61% vs its trailing average → "Pay later awareness · NO is tiring". */
function rowTitle(s: MarketSignal) {
  if (s.type !== "PERFORMANCE") return s.title;
  const name = s.title.match(/^"(.+?)"/)?.[1];
  const change = perfChange(s);
  if (!name || !change) return s.title;
  return change.after === 0 ? `${name} CTR dropped to 0%` : `${name} is tiring`;
}

function SignalRows({ signals }: { signals: MarketSignal[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {signals.map((s) => {
        const { icon: Icon, bg } = ICON[s.type as keyof typeof ICON] ?? ICON.MARKET;
        const change = perfChange(s);
        const kind = SIGNAL_TYPES.find((t) => t.type === s.type)?.label ?? s.type;
        return (
          <li key={s.id} className="flex items-center gap-4 border-b border-brand-line px-6 py-3.5 last:border-b-0">
            <span aria-label={kind} className={`flex size-8 shrink-0 items-center justify-center rounded-[8px] ${bg}`}>
              <Icon className="size-4 text-brand-ink-2" strokeWidth={1.75} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px]">{rowTitle(s)}</span>
              <span className="truncate text-[13px] text-brand-mute">
                {signalSource(s)} · {short(s.publishedAt)}
              </span>
            </span>
            {change ? (
              <span className="flex shrink-0 items-center gap-2 text-[14px] tabular-nums" title={`CTR ${change.before}% → ${change.after}%`}>
                {change.before}%
                <svg viewBox="0 0 40 12" className="h-3 w-10" aria-hidden>
                  <line x1={2} y1={change.after < change.before ? 3 : 9} x2={38} y2={change.after < change.before ? 9 : 3} stroke={change.after < change.before ? ORANGE : INK} strokeWidth={2} strokeLinecap="round" />
                </svg>
                {change.after}%
              </span>
            ) : s.type === "COMPETITOR" ? (
              <PillLink href="/insights/market/competitors" size="sm" className="shrink-0">
                See ads
              </PillLink>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
