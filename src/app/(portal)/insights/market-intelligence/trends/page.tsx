import Link from "next/link";
import { ExternalLink, Radio, Newspaper, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { formatDate, jsonArray } from "@/lib/utils";
import { getIndustryNews } from "@/lib/integrations/industry-news";
import { getSignalFrequency } from "@/lib/integrations/market-signals";
import { SignalFrequencyChart } from "@/components/portal/signal-frequency-chart";
import { GenerateMarketIntelligenceButton } from "@/components/portal/generate-market-intelligence-button";

type Theme = { theme: string; articleTitles: string[] };

export default async function MarketIntelligenceTrendsPage() {
  const viewer = await getPortalViewer();
  const newsQuery = viewer.client.industry ? `${viewer.client.industry} marketing` : viewer.client.name;

  const [news, trendBrief, frequency] = await Promise.all([
    getIndustryNews(newsQuery),
    prisma.trendBrief.findUnique({ where: { clientId: viewer.clientId } }),
    getSignalFrequency(viewer.clientId, { type: "TREND", weeks: 8 }),
  ]);

  const hasActivity = frequency.some((f) => f.count > 0);

  return (
    <>
      {!trendBrief ? (
        <Card className="flex flex-col items-start gap-3 border-l-4 border-l-accent p-5">
          <div>
            <p className="text-sm font-semibold">What's shaping the category</p>
            <p className="text-sm text-muted-foreground">
              Have the agent read the current headlines and group them into the themes actually driving the category, instead of a flat article list.
            </p>
          </div>
          <GenerateMarketIntelligenceButton label="Generate analysis" />
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 border-l-4 border-l-accent p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">What's shaping the category</p>
              <p className="mt-1 text-sm text-muted-foreground">{trendBrief.takeaway}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <GenerateMarketIntelligenceButton label="Refresh analysis" />
              <p className="text-[11px] text-muted-foreground">Generated {formatDate(trendBrief.generatedAt, { day: "2-digit", month: "short" })}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {jsonArray<Theme>(trendBrief.themes).map((t, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border bg-paper p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Sparkles className="size-3 text-ink" />
                  {t.theme}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {t.articleTitles.map((title, j) => (
                    <li key={j} className="text-[11px] text-muted-foreground">
                      "{title}"
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {hasActivity && (
        <Card className="flex flex-col gap-2 p-5">
          <div>
            <p className="text-sm font-semibold">News coverage volume, last 8 weeks</p>
            <p className="text-xs text-muted-foreground">
              How many new category headlines were spotted each week — a rough read on whether coverage is heating up or cooling off. Only counts
              from when tracking started, so early weeks will look sparse until more history builds up.
            </p>
          </div>
          <SignalFrequencyChart data={frequency} />
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <SectionLabel>Sources</SectionLabel>
          {news.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success-foreground">
              <Radio className="size-3" />
              Live · Google News
            </span>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {news.length === 0 && (
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">No recent coverage found for {viewer.client.industry ?? viewer.client.name}.</p>
            </Card>
          )}
          {news.map((item) => (
            <Link key={item.link} href={item.link} target="_blank" rel="noopener noreferrer">
              <Card className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-muted">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-ink">
                    <Newspaper className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.source ?? "Unknown source"}
                      {item.publishedAt && ` · ${formatDate(item.publishedAt, { day: "2-digit", month: "short" })}`}
                    </p>
                  </div>
                </div>
                <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
