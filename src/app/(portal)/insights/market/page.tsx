import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { formatDate, jsonArray } from "@/lib/utils";
import { getIndustryNews } from "@/lib/integrations/industry-news";
import { getCompetitorAdLibraryActivity } from "@/lib/integrations/meta-ad-library";
import { getLinkedInCompetitorAds } from "@/lib/integrations/linkedin-ad-library";
import { recordCompetitorSnapshots, recordNewsSignals, getRecentMarketSignals } from "@/lib/integrations/market-signals";
import { generateMarketIntelligenceAction } from "@/lib/actions/market-intelligence-actions";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard, CardNote, CardRows } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { monoLink } from "@/components/ds/pill-link";
import { AgentButton } from "@/components/portal/insights/agent-button";

const KIND: Record<string, string> = { COMPETITOR: "Competitor", TREND: "Trend", MARKET: "Industry news", PERFORMANCE: "Performance" };

/** Market → Feed: real signals as they happen (competitor ads, category news, your own performance shifts) and the agent's read. */
export default async function MarketFeedPage() {
  const viewer = await getPortalViewer();
  const client = viewer.client;
  const competitorBrands = jsonArray<string>(client.competitorBrands);
  const newsQuery = client.industry ? `${client.industry} marketing` : client.name;

  const [news, adLibraryResults, linkedInAdResults, brief, newIdeas] = await Promise.all([
    getIndustryNews(newsQuery),
    competitorBrands.length ? getCompetitorAdLibraryActivity(competitorBrands) : Promise.resolve([]),
    competitorBrands.length ? getLinkedInCompetitorAds(competitorBrands) : Promise.resolve([]),
    prisma.marketIntelligenceBrief.findUnique({ where: { clientId: viewer.clientId } }),
    prisma.marketIntelligenceIdea.count({ where: { clientId: viewer.clientId, status: "NEW" } }),
  ]);
  await Promise.all([recordCompetitorSnapshots(client.id, adLibraryResults, linkedInAdResults), recordNewsSignals(client.id, news)]);
  const signals = await getRecentMarketSignals(client.id, { take: 20 });

  return (
    <PageGrid
      main={
        <SectionCard title="What's new" action={<span className="font-brand-mono text-[12px] text-brand-ink-2">{signals.length} SIGNALS</span>}>
          {signals.length === 0 ? (
            <CardNote>No signals logged yet. Competitor and news checks run each time you open this page.</CardNote>
          ) : (
            <CardRows>
              {signals.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-6 py-4">
                  <span aria-hidden className="mt-[7px] size-2 shrink-0 bg-brand-lime-strong" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px]">{s.title}</span>
                      {s.relevance === "High relevance" && <StatusPill tone="watch">High relevance</StatusPill>}
                    </span>
                    <span className="text-[13px] leading-[1.5] text-brand-ink-2">{s.summary}</span>
                  </span>
                  <span className="shrink-0 font-brand-mono text-[11px] uppercase text-brand-ink-2">
                    {formatDate(s.publishedAt, { day: "numeric", month: "short" })} · {KIND[s.type] ?? s.type}
                  </span>
                </li>
              ))}
            </CardRows>
          )}
        </SectionCard>
      }
      side={
        <SectionCard title="What this means for you" action={<AgentButton action={generateMarketIntelligenceAction} label={brief ? "Refresh" : "Generate"} pendingLabel="Reading…" />}>
          {brief ? (
            <div className="flex flex-col gap-3 px-6 py-5">
              <p className="m-0 text-[14px] leading-[1.55]">{brief.summary}</p>
              {jsonArray<string>(brief.assumptions)
                .slice(0, 2)
                .map((a, i) => (
                  <p key={i} className="m-0 rounded-[8px] bg-brand-chip px-3 py-2 text-[12px] leading-[1.5] text-brand-ink-2">
                    {a}
                  </p>
                ))}
              {newIdeas > 0 && (
                <Link href="/insights/market/ideas" className={monoLink}>
                  {newIdeas} IDEA{newIdeas === 1 ? "" : "S"} WORTH BRIEFING
                </Link>
              )}
              <span className="font-brand-mono text-[11px] text-brand-ink-2">GENERATED {formatDate(brief.generatedAt, { day: "numeric", month: "short" }).toUpperCase()}</span>
            </div>
          ) : (
            <CardNote>The market agent reads the news, competitor ads and your own best formats, and turns them into a few ideas worth briefing.</CardNote>
          )}
        </SectionCard>
      }
    />
  );
}
