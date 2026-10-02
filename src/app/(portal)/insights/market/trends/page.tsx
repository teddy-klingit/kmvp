import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { formatDate, jsonArray } from "@/lib/utils";
import { getIndustryNews } from "@/lib/integrations/industry-news";
import { getSignalFrequency } from "@/lib/integrations/market-signals";
import { generateMarketIntelligenceAction } from "@/lib/actions/market-intelligence-actions";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard, CardBody, CardNote, CardRows } from "@/components/ds/card";
import { SignalFrequencyChart } from "@/components/portal/signal-frequency-chart";
import { AgentButton } from "@/components/portal/insights/agent-button";

type Theme = { theme: string; articleTitles: string[] };

/** Market → Trends: the themes shaping the category (agent-grouped headlines), coverage volume and the live sources. */
export default async function MarketTrendsPage() {
  const viewer = await getPortalViewer();
  const newsQuery = viewer.client.industry ? `${viewer.client.industry} marketing` : viewer.client.name;
  const [news, trendBrief, frequency] = await Promise.all([
    getIndustryNews(newsQuery),
    prisma.trendBrief.findUnique({ where: { clientId: viewer.clientId } }),
    getSignalFrequency(viewer.clientId, { type: "TREND", weeks: 8 }),
  ]);
  const hasActivity = frequency.some((f) => f.count > 0);

  return (
    <PageGrid
      main={
        <>
          <SectionCard title="What's shaping the category" action={<AgentButton action={generateMarketIntelligenceAction} label={trendBrief ? "Refresh" : "Generate"} pendingLabel="Reading…" />}>
            {trendBrief ? (
              <>
                <p className="m-0 px-6 pt-5 text-[15px] leading-[1.55]">{trendBrief.takeaway}</p>
                <CardBody className="grid grid-cols-1 gap-3 @min-[600px]/col:grid-cols-2">
                  {jsonArray<Theme>(trendBrief.themes).map((t, i) => (
                    <div key={i} className="flex flex-col gap-1.5 rounded-[10px] bg-brand-chip p-4">
                      <span className="text-[15px]">{t.theme}</span>
                      <ul className="m-0 flex list-none flex-col gap-1 p-0">
                        {t.articleTitles.map((title, j) => (
                          <li key={j} className="text-[12px] leading-[1.5] text-brand-ink-2">
                            &ldquo;{title}&rdquo;
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </CardBody>
                <p className="m-0 border-t border-brand-line px-6 py-3 font-brand-mono text-[11px] text-brand-ink-2">GENERATED {formatDate(trendBrief.generatedAt, { day: "numeric", month: "short" }).toUpperCase()}</p>
              </>
            ) : (
              <CardNote>The agent reads the current headlines and groups them into the themes driving your category.</CardNote>
            )}
          </SectionCard>

          <SectionCard title="Sources" action={news.length > 0 ? <span className="font-brand-mono text-[12px] text-brand-ink-2">LIVE · GOOGLE NEWS</span> : undefined}>
            {news.length === 0 ? (
              <CardNote>No recent coverage found for {viewer.client.industry ?? viewer.client.name}.</CardNote>
            ) : (
              <CardRows>
                {news.map((item) => (
                  <li key={item.link}>
                    <Link href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 px-6 py-4 text-brand-ink no-underline hover:bg-brand-chip">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[15px]">{item.title}</span>
                        <span className="text-[12px] text-brand-ink-2">
                          {item.source ?? "Unknown source"}
                          {item.publishedAt && ` · ${formatDate(item.publishedAt, { day: "numeric", month: "short" })}`}
                        </span>
                      </span>
                      <ExternalLink className="size-4 shrink-0 text-brand-ink-2" />
                    </Link>
                  </li>
                ))}
              </CardRows>
            )}
          </SectionCard>
        </>
      }
      side={
        hasActivity ? (
          <SectionCard title="Coverage, last 8 weeks">
            <CardBody className="flex flex-col gap-2">
              <SignalFrequencyChart data={frequency} />
              <p className="m-0 text-[12px] leading-[1.5] text-brand-ink-2">New category headlines spotted each week. Counts start from when tracking began.</p>
            </CardBody>
          </SectionCard>
        ) : undefined
      }
    />
  );
}
