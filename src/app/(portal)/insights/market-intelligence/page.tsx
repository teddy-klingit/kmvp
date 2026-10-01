import Link from "next/link";
import { Compass, Radio, Megaphone, Newspaper, TrendingUp, TrendingDown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, jsonArray } from "@/lib/utils";
import { getIndustryNews } from "@/lib/integrations/industry-news";
import { getCompetitorAdLibraryActivity } from "@/lib/integrations/meta-ad-library";
import { getLinkedInCompetitorAds } from "@/lib/integrations/linkedin-ad-library";
import { recordCompetitorSnapshots, recordNewsSignals, getRecentMarketSignals } from "@/lib/integrations/market-signals";
import { GenerateMarketIntelligenceButton } from "@/components/portal/generate-market-intelligence-button";

const SIGNAL_ICON = { COMPETITOR: Megaphone, TREND: TrendingUp, MARKET: Newspaper, PERFORMANCE: TrendingDown } as const;

export default async function MarketIntelligenceFeedPage() {
  const viewer = await getPortalViewer();
  const client = viewer.client;
  const competitorBrands = jsonArray<string>(client.competitorBrands);
  const newsQuery = client.industry ? `${client.industry} marketing` : client.name;

  const [news, adLibraryResults, linkedInAdResults, brief, ideaCounts] = await Promise.all([
    getIndustryNews(newsQuery),
    competitorBrands.length ? getCompetitorAdLibraryActivity(competitorBrands) : Promise.resolve([]),
    competitorBrands.length ? getLinkedInCompetitorAds(competitorBrands) : Promise.resolve([]),
    prisma.marketIntelligenceBrief.findUnique({ where: { clientId: viewer.clientId } }),
    prisma.marketIntelligenceIdea.groupBy({ by: ["status"], where: { clientId: viewer.clientId }, _count: true }),
  ]);

  await Promise.all([recordCompetitorSnapshots(client.id, adLibraryResults, linkedInAdResults), recordNewsSignals(client.id, news)]);
  const signals = await getRecentMarketSignals(client.id, { take: 20 });

  const newIdeaCount = ideaCounts.find((c) => c.status === "NEW")?._count ?? 0;

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold">What&apos;s new</h2>
        <p className="text-sm text-muted-foreground">Real signals as they happen — new competitor ads, category news, and your own performance shifts.</p>
      </div>

      {!brief ? (
        <Card className="flex flex-col items-start gap-3 border-l-4 border-l-accent p-5">
          <div>
            <p className="text-sm font-semibold">What this means for you</p>
            <p className="text-sm text-muted-foreground">
              Have the Market Intelligence agent read the news, competitor ads, and your own top-performing formats,
              and turn them into a few concrete ideas worth briefing.
            </p>
          </div>
          <GenerateMarketIntelligenceButton label="Generate analysis" />
        </Card>
      ) : (
        <Card className="flex flex-col gap-3 border-l-4 border-l-accent p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">What this means for you</p>
              <p className="mt-1 text-sm text-muted-foreground">{brief.summary}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <GenerateMarketIntelligenceButton label="Refresh analysis" />
              <p className="text-[11px] text-muted-foreground">Generated {formatDate(brief.generatedAt, { day: "2-digit", month: "short" })}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {jsonArray<string>(brief.assumptions).slice(0, 2).map((a, i) => (
              <span key={i} className="flex items-start gap-1.5 rounded-lg border border-border bg-paper px-3 py-2 text-xs text-muted-foreground">
                <Compass className="mt-0.5 size-3 shrink-0" />
                {a}
              </span>
            ))}
          </div>
          {newIdeaCount > 0 && (
            <Link href="/insights/market-intelligence/ideas" className="text-xs font-medium text-primary hover:underline">
              {newIdeaCount} idea{newIdeaCount === 1 ? "" : "s"} worth briefing →
            </Link>
          )}
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signal feed</p>
          <span className="flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success-foreground">
            <Radio className="size-3" />
            Live
          </span>
        </div>
        {signals.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">
              No signals logged yet — check back after your first competitor and news check runs (automatic on this page).
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {signals.map((signal) => {
              const Icon = SIGNAL_ICON[signal.type as keyof typeof SIGNAL_ICON] ?? Newspaper;
              return (
                <Card key={signal.id} className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-ink">
                    <Icon className="size-4" />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{signal.title}</p>
                      {signal.relevance === "High relevance" && (
                        <Badge tone="warning" className="text-[10px]">
                          High relevance
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{signal.summary}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(signal.publishedAt, { day: "2-digit", month: "short" })}</span>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
