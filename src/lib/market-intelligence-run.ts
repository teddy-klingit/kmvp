import type { Client } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { loadMeasuredAssets } from "@/lib/insights-data";
import { loadDaily } from "@/lib/insights/daily";
import { isGrounded, numbersIn, textGrounded } from "@/lib/insights/number-guard";
import { jsonArray } from "@/lib/utils";
import { getIndustryNews } from "@/lib/integrations/industry-news";
import { getCompetitorAdLibraryActivity } from "@/lib/integrations/meta-ad-library";
import { getLinkedInCompetitorAds } from "@/lib/integrations/linkedin-ad-library";
import { getRecentMarketSignals } from "@/lib/integrations/market-signals";
import {
  synthesizeMarketIntelligence,
  synthesizeCompetitorProfiles,
  synthesizeTrendBrief,
  estimateCategoryBenchmark,
} from "@/lib/ai/agents/market-intelligence-agent";
import { clientVisibleAsset } from "@/lib/qc/visibility";

export async function findOwnTopFormat(clientId: string) {
  const topAsset = await prisma.asset.findFirst({
    where: { clientId, performanceCtr: { not: null }, ...clientVisibleAsset },
    orderBy: { performanceCtr: "desc" },
  });
  return topAsset && topAsset.performanceCtr !== null
    ? { format: topAsset.format, platform: topAsset.platform ?? "Unspecified", ctr: topAsset.performanceCtr }
    : null;
}

/** The client's own numbers an idea can point to: CTR by delivered format, campaigns tiring, signals by type. */
async function ownMarketFacts(clientId: string) {
  const [{ measured }, daily, signals] = await Promise.all([loadMeasuredAssets(clientId), loadDaily(clientId, 30), prisma.marketSignal.groupBy({ by: ["type"], where: { clientId, archivedAt: null, publishedAt: { gte: new Date(Date.now() - 30 * 86400000) } }, _count: true })]);
  const byFormat = new Map<string, number[]>();
  for (const a of measured) byFormat.set(a.format, [...(byFormat.get(a.format) ?? []), a.ctr]);
  return [
    ...[...byFormat].map(([f, v]) => `${f}: ${Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10}% average CTR (delivered creative)`),
    ...daily.campaigns.filter((c) => c.ctrLast7 !== null && c.ctrTrailing !== null).map((c) => `${c.platform} "${c.name}": CTR ${c.ctrTrailing}% the 23 days before → ${c.ctrLast7}% the last 7 days`),
    ...signals.map((s) => `${s._count} ${s.type.toLowerCase()} signal(s) in the last 30 days`),
  ];
}

/**
 * One run of the market agent for a client: reads the news, competitor ads and the client's own numbers, and
 * stores the brief ("What this means": ≤2 one-line implications), ideas (with their evidence chart, grounded by
 * the number guard), competitor profiles, the trend brief and the category benchmark. Called by the Generate
 * buttons (market-intelligence-actions.ts) and scripts; never exported from a "use server" file.
 */
export async function runMarketIntelligence(client: Client): Promise<{ error: string | null }> {
  const competitorBrands = jsonArray<string>(client.competitorBrands);

  const [news, adLibraryResults, linkedInAdResults, topFormat] = await Promise.all([
    getIndustryNews(client.industry ? `${client.industry} marketing` : client.name),
    competitorBrands.length ? getCompetitorAdLibraryActivity(competitorBrands) : Promise.resolve([]),
    competitorBrands.length ? getLinkedInCompetitorAds(competitorBrands) : Promise.resolve([]),
    findOwnTopFormat(client.id),
  ]);

  const metaCompetitorAds = adLibraryResults
    .filter((r) => r.ok)
    .flatMap((r) => (r.ok ? r.ads.map((ad) => ({ brand: r.brand, platform: "Meta" as const, bodyText: ad.bodyText })) : []));

  const linkedInCompetitorAds = linkedInAdResults
    .filter((r) => r.ok)
    .flatMap((r) =>
      r.ok
        ? [{ brand: r.brand, platform: "LinkedIn" as const, bodyText: `${r.total} ads live, most recent from "${r.ads[0]?.advertiserName ?? r.brand}"` }]
        : []
    );

  const competitorAds = [...metaCompetitorAds, ...linkedInCompetitorAds];

  const adsByBrand = [
    ...adLibraryResults
      .filter((r) => r.ok)
      .flatMap((r) => (r.ok ? r.ads.map((ad) => ({ brand: r.brand, platform: "Meta" as const, bodyText: ad.bodyText, totalAds: null as number | null })) : [])),
    ...linkedInAdResults
      .filter((r) => r.ok)
      .flatMap((r) =>
        r.ok
          ? [{ brand: r.brand, platform: "LinkedIn" as const, bodyText: r.ads[0]?.advertiserName ?? null, totalAds: r.total as number | null }]
          : []
      ),
  ];
  const competitorSignals = await getRecentMarketSignals(client.id, { type: "COMPETITOR", take: 15 });

  const [mainResult, profilesResult, trendResult, benchmarkResult] = await Promise.all([
    synthesizeMarketIntelligence({
      clientId: client.id,
      clientName: client.name,
      industry: client.industry,
      competitorBrands,
      newsHeadlines: news.map((n) => ({ title: n.title, source: n.source })),
      competitorAds,
      ownTopFormat: topFormat,
      ownFacts: await ownMarketFacts(client.id),
    }),
    competitorBrands.length && adsByBrand.length
      ? synthesizeCompetitorProfiles({
          clientId: client.id,
          competitorBrands,
          adsByBrand,
          recentSignals: competitorSignals.map((s) => ({ title: s.title, summary: s.summary })),
        })
      : Promise.resolve(null),
    news.length
      ? synthesizeTrendBrief({
          clientId: client.id,
          clientName: client.name,
          industry: client.industry,
          newsHeadlines: news.map((n) => ({ title: n.title, source: n.source })),
        })
      : Promise.resolve(null),
    topFormat
      ? estimateCategoryBenchmark({
          clientId: client.id,
          industry: client.industry,
          competitorBrands,
          competitorContext: adsByBrand
            .filter((a) => a.totalAds !== null)
            .map((a) => `${a.brand}: ${a.totalAds} live ads on ${a.platform}`),
          ownFormat: topFormat.format,
          ownCtr: topFormat.ctr,
        })
      : Promise.resolve(null),
  ]);

  if (!mainResult.ok) return { error: mainResult.error };
  // No invented numbers: drop chart bars, chips and lines whose numbers aren't in what the agent was given.
  const pool = numbersIn(mainResult.prompt);
  const implications = mainResult.data.implications.filter((i) => textGrounded(i.text, pool)).slice(0, 2);

  await prisma.marketIntelligenceBrief.upsert({
    where: { clientId: client.id },
    update: { summary: mainResult.data.summary, assumptions: mainResult.data.assumptions, points: implications, generatedAt: new Date() },
    create: { clientId: client.id, summary: mainResult.data.summary, assumptions: mainResult.data.assumptions, points: implications },
  });

  const existingTitles = new Set(
    (await prisma.marketIntelligenceIdea.findMany({ where: { clientId: client.id }, select: { title: true } })).map((i) =>
      i.title.toLowerCase()
    )
  );
  const freshIdeas = mainResult.data.ideas.filter((idea) => !existingTitles.has(idea.title.toLowerCase()));
  if (freshIdeas.length) {
    await prisma.marketIntelligenceIdea.createMany({
      data: freshIdeas.map((idea) => ({
        clientId: client.id,
        title: idea.title,
        detail: idea.detail,
        why: textGrounded(idea.why, pool) ? idea.why : null,
        evidence: idea.evidence.filter((e) => textGrounded(e.label, pool)),
        chart: idea.chart.filter((c) => isGrounded(c.value, pool)),
        formats: idea.formats,
      })),
    });
  }

  if (mainResult.data.suggestedCompetitors.length) {
    const trackedLower = new Set(competitorBrands.map((b) => b.toLowerCase()));
    const fresh = mainResult.data.suggestedCompetitors.filter((s) => !trackedLower.has(s.name.toLowerCase()));
    if (fresh.length) {
      await Promise.all(
        fresh.map((s) =>
          prisma.suggestedCompetitor.upsert({
            where: { clientId_name: { clientId: client.id, name: s.name } },
            update: {},
            create: { clientId: client.id, name: s.name, evidence: s.evidence },
          })
        )
      );
    }
  }

  if (profilesResult?.ok) {
    await Promise.all(
      profilesResult.data.profiles.map((p) =>
        prisma.competitorProfile.upsert({
          where: { clientId_brand: { clientId: client.id, brand: p.brand } },
          update: { positioning: p.positioning, activityLevel: p.activityLevel, themes: p.themes, generatedAt: new Date() },
          create: { clientId: client.id, brand: p.brand, positioning: p.positioning, activityLevel: p.activityLevel, themes: p.themes },
        })
      )
    );
  }

  if (trendResult?.ok) {
    await prisma.trendBrief.upsert({
      where: { clientId: client.id },
      update: { takeaway: trendResult.data.takeaway, themes: trendResult.data.themes, generatedAt: new Date() },
      create: { clientId: client.id, takeaway: trendResult.data.takeaway, themes: trendResult.data.themes },
    });
  }

  if (benchmarkResult?.ok && topFormat) {
    await prisma.performanceBenchmark.upsert({
      where: { clientId: client.id },
      update: {
        ownFormat: topFormat.format,
        ownCtr: topFormat.ctr,
        estimatedLow: benchmarkResult.data.estimatedLow,
        estimatedHigh: benchmarkResult.data.estimatedHigh,
        rationale: benchmarkResult.data.rationale,
        generatedAt: new Date(),
      },
      create: {
        clientId: client.id,
        ownFormat: topFormat.format,
        ownCtr: topFormat.ctr,
        estimatedLow: benchmarkResult.data.estimatedLow,
        estimatedHigh: benchmarkResult.data.estimatedHigh,
        rationale: benchmarkResult.data.rationale,
      },
    });
  }

  return { error: null };
}
