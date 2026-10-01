"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { getIndustryNews } from "@/lib/integrations/industry-news";
import { getCompetitorAdLibraryActivity } from "@/lib/integrations/meta-ad-library";
import { getLinkedInCompetitorAds } from "@/lib/integrations/linkedin-ad-library";
import { getRecentMarketSignals } from "@/lib/integrations/market-signals";
import { getMetaAdAccountInsights } from "@/lib/integrations/meta-ads";
import { getLinkedInAdInsights } from "@/lib/integrations/linkedin-ads";
import { getGoogleAdsAccountInsights } from "@/lib/integrations/google-ads";
import { buildPlatformCampaigns } from "@/lib/performance";
import {
  synthesizeMarketIntelligence,
  answerMarketIntelligenceQuestion,
  synthesizeCompetitorProfiles,
  synthesizeTrendBrief,
  estimateCategoryBenchmark,
} from "@/lib/ai/agents/market-intelligence-agent";

const MARKET_INTEL_PATHS = [
  "/insights/market-intelligence",
  "/insights/market-intelligence/competitors",
  "/insights/market-intelligence/trends",
  "/insights/market-intelligence/ideas",
];

async function findOwnTopFormat(clientId: string) {
  const topAsset = await prisma.asset.findFirst({
    where: { clientId, performanceCtr: { not: null } },
    orderBy: { performanceCtr: "desc" },
  });
  return topAsset && topAsset.performanceCtr !== null
    ? { format: topAsset.format, platform: topAsset.platform ?? "Unspecified", ctr: topAsset.performanceCtr }
    : null;
}

function revalidateAllTabs() {
  MARKET_INTEL_PATHS.forEach((p) => revalidatePath(p));
}

export type GenerateMarketIntelligenceState = { error?: string | null };

export async function generateMarketIntelligenceAction(
  _prev: GenerateMarketIntelligenceState,
  _formData: FormData
): Promise<GenerateMarketIntelligenceState> {
  const viewer = await getPortalViewer();
  const client = viewer.client;
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

  await prisma.marketIntelligenceBrief.upsert({
    where: { clientId: client.id },
    update: { summary: mainResult.data.summary, assumptions: mainResult.data.assumptions, generatedAt: new Date() },
    create: { clientId: client.id, summary: mainResult.data.summary, assumptions: mainResult.data.assumptions },
  });

  const existingTitles = new Set(
    (await prisma.marketIntelligenceIdea.findMany({ where: { clientId: client.id }, select: { title: true } })).map((i) =>
      i.title.toLowerCase()
    )
  );
  const freshIdeas = mainResult.data.ideas.filter((idea) => !existingTitles.has(idea.title.toLowerCase()));
  if (freshIdeas.length) {
    await prisma.marketIntelligenceIdea.createMany({
      data: freshIdeas.map((idea) => ({ clientId: client.id, title: idea.title, detail: idea.detail })),
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

  revalidateAllTabs();
  return { error: null };
}

export async function updateIdeaStatusAction(formData: FormData) {
  await getPortalViewer();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["SAVED", "DISMISSED", "NEW"].includes(status)) return;

  await prisma.marketIntelligenceIdea.update({ where: { id }, data: { status: status as "SAVED" | "DISMISSED" | "NEW" } });
  revalidateAllTabs();
}

export async function startBriefFromIdeaAction(formData: FormData) {
  await getPortalViewer();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "");
  const detail = String(formData.get("detail") ?? "");

  await prisma.marketIntelligenceIdea.update({ where: { id }, data: { status: "BRIEFED" } });
  revalidateAllTabs();

  const params = new URLSearchParams({ idea: title, detail });
  redirect(`/projects/new?${params.toString()}`);
}

export type AskQuestionState = { error?: string | null };

export async function askMarketIntelligenceQuestionAction(
  _prev: AskQuestionState,
  formData: FormData
): Promise<AskQuestionState> {
  const viewer = await getPortalViewer();
  const client = viewer.client;
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { error: "Ask a question first." };

  const competitorBrands = jsonArray<string>(client.competitorBrands);
  const [signals, topFormat, metaInsights, linkedInInsights, googleInsights, seoBrief] = await Promise.all([
    getRecentMarketSignals(client.id, { take: 15 }),
    findOwnTopFormat(client.id),
    getMetaAdAccountInsights(),
    getLinkedInAdInsights(),
    getGoogleAdsAccountInsights(),
    prisma.seoBrief.findUnique({ where: { clientId: client.id } }),
  ]);

  const liveCampaigns = buildPlatformCampaigns(metaInsights, linkedInInsights, googleInsights).map((c) => ({
    platform: c.platform,
    campaignName: c.campaignName,
    ctr: c.ctr,
    impressions: c.impressions,
    spend: c.spend,
    currency: c.currency,
  }));

  const result = await answerMarketIntelligenceQuestion({
    clientId: client.id,
    clientName: client.name,
    industry: client.industry,
    competitorBrands,
    question,
    recentSignals: signals.map((s) => ({ title: s.title, summary: s.summary, type: s.type })),
    ownTopFormat: topFormat,
    liveCampaigns,
    seoSummary: seoBrief?.summary ?? null,
  });

  if (!result.ok) return { error: result.error };

  await prisma.marketIntelligenceQuestion.create({
    data: { clientId: client.id, question, answer: result.data.answer },
  });

  revalidateAllTabs();
  return { error: null };
}

export async function addSuggestedCompetitorAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");

  const current = jsonArray<string>(viewer.client.competitorBrands);
  if (!current.some((b) => b.toLowerCase() === name.toLowerCase())) {
    await prisma.client.update({ where: { id: viewer.clientId }, data: { competitorBrands: [...current, name] } });
  }
  await prisma.suggestedCompetitor.update({ where: { id }, data: { status: "ADDED" } });

  revalidateAllTabs();
}

export async function dismissSuggestedCompetitorAction(formData: FormData) {
  await getPortalViewer();
  const id = String(formData.get("id") ?? "");
  await prisma.suggestedCompetitor.update({ where: { id }, data: { status: "DISMISSED" } });
  revalidateAllTabs();
}
