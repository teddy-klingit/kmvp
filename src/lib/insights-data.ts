import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getMetaAdAccountInsights } from "@/lib/integrations/meta-ads";
import { getLinkedInAdInsights } from "@/lib/integrations/linkedin-ads";
import { getGoogleAdsAccountInsights } from "@/lib/integrations/google-ads";
import { buildSamplePlatformCampaigns } from "@/lib/integrations/sample-data";
import { recordPerformanceSnapshots } from "@/lib/integrations/performance-alerts";
import { buildPlatformCampaigns, type PlatformCampaign } from "@/lib/performance";
import { campaignMetricsForRange, weeklyPerformanceTrend } from "@/lib/campaign-history";
import { resolveDateRange } from "@/lib/report-filters";
import { computeContentKpis } from "@/lib/content-calendar-metrics";
import { assetTitle } from "@/lib/asset-display";
import { jsonArray } from "@/lib/utils";
import type { PerformanceAction, Takeaway } from "@/lib/ai/agents/performance-agent";
import { clientVisibleAsset } from "@/lib/qc/visibility";

/**
 * Data shared by the Insights header and tabs. Each loader is cached per request (React cache), so the
 * header's "META CONNECTED" and the Overview's numbers come from one fetch of each ad account.
 */

type ApiError = { platform: string; message: string };

export type PaidMedia = {
  /** False when the engagement is organic-only: no paid data is fetched or shown, not even a sample. */
  inScope: boolean;
  isSample: boolean;
  campaigns: PlatformCampaign[];
  /** Ad platforms that returned data. */
  connected: string[];
  /** Platforms that are set up but failed this time. */
  errors: ApiError[];
  trend: Awaited<ReturnType<typeof weeklyPerformanceTrend>> | null;
};

export const loadPaidMedia = cache(async (clientId: string, rangePreset?: string): Promise<PaidMedia> => {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { isSampleAccount: true, paidMediaInScope: true } });
  if (!client.paidMediaInScope) return { inScope: false, isSample: client.isSampleAccount, campaigns: [], connected: [], errors: [], trend: null };

  if (client.isSampleAccount) {
    const [{ campaigns }, trend] = await Promise.all([campaignMetricsForRange(clientId, resolveDateRange({ preset: rangePreset })), weeklyPerformanceTrend(clientId)]);
    const all = campaigns.length > 0 ? campaigns : await buildSamplePlatformCampaigns(clientId);
    return { inScope: true, isSample: true, campaigns: all, connected: [...new Set(all.map((c) => c.platform))], errors: [], trend };
  }

  const [meta, linkedIn, google] = await Promise.all([getMetaAdAccountInsights(), getLinkedInAdInsights(), getGoogleAdsAccountInsights()]);
  const campaigns = buildPlatformCampaigns(meta, linkedIn, google);
  await recordPerformanceSnapshots(clientId, campaigns);
  const results = [
    { platform: "Meta", r: meta },
    { platform: "LinkedIn", r: linkedIn },
    { platform: "Google", r: google },
  ];
  return {
    inScope: true,
    isSample: false,
    campaigns,
    connected: results.filter((x) => x.r.ok).map((x) => x.platform),
    errors: results.flatMap((x) => (!x.r.ok && x.r.reason === "api_error" ? [{ platform: x.platform, message: x.r.message ?? "Unknown error" }] : [])),
    trend: null,
  };
});

export const loadContentKpis = cache((clientId: string) => computeContentKpis(clientId));

export const loadAudienceData = cache(async (clientId: string) => {
  const [community, escalations, website] = await Promise.all([
    prisma.communityManagementSnapshot.findMany({ where: { clientId }, orderBy: { periodEnd: "asc" } }),
    prisma.communityEscalation.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
    prisma.websiteAnalyticsSnapshot.findMany({ where: { clientId }, orderBy: { periodEnd: "asc" } }),
  ]);
  return { community, escalations, website };
});

/**
 * The asset's own image to show as a thumbnail, or null: never stock filler (sample-image.ts), and never the
 * download route of an asset with no stored file (that serves a labelled placeholder, see asset-files.ts).
 */
export function assetThumbnail(a: { fileUrl: string | null; mimeType: string | null; storageKey: string | null }) {
  if (!a.fileUrl || !a.mimeType?.startsWith("image/") || a.fileUrl.includes("picsum.photos")) return null;
  if (a.fileUrl.startsWith("/api/assets/") && !a.storageKey) return null;
  return a.fileUrl;
}

/** Delivered assets with a measured CTR, with display names. */
export const loadMeasuredAssets = cache(async (clientId: string) => {
  const assets = await prisma.asset.findMany({ where: { clientId, ...clientVisibleAsset }, include: { project: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  return {
    all: assets.map((a) => ({ ...a, displayTitle: assetTitle(a.name, a.format) })),
    measured: assets
      .filter((a) => a.performanceCtr !== null)
      .map((a) => ({ id: a.id, title: assetTitle(a.name, a.format), project: a.project.name, format: a.format, ctr: a.performanceCtr!, color: a.thumbnailColor, thumbnail: assetThumbnail(a) })),
  };
});

// ─── Sources ───────────────────────────────────────────────────────────────

export type MissingSource = { name: string; unlocks: string[] };

/**
 * What's connected, and which sources are missing *because a metric is hidden*. A metric with no data is
 * never shown as "—"; the gap is explained once, in the Connect accounts card.
 */
export const loadDemoSources = cache(async (clientId: string) => {
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { demoSources: true } });
  return jsonArray<string>(c?.demoSources);
});

export async function insightSources(clientId: string) {
  const [paid, kpis, audience, demo] = await Promise.all([loadPaidMedia(clientId), loadContentKpis(clientId), loadAudienceData(clientId), loadDemoSources(clientId)]);
  const hasFollowers = kpis.blendedFollowerGrowthPct !== null;
  const hasCommunity = audience.community.length > 0;
  const hasWebsite = audience.website.length > 0;

  const missing: MissingSource[] = [];
  const social = [!hasFollowers && "follower growth", !hasCommunity && "community"].filter((x): x is string => Boolean(x));
  if (social.length) missing.push({ name: "LinkedIn", unlocks: social });
  if (!hasWebsite) missing.push({ name: "Google Analytics", unlocks: ["website"] });

  // Sources filled with dummy data (Client.demoSources) are named as such, never as real connections.
  const connected = [
    ...paid.connected.map((p) => (p === "Google" ? "Google Ads" : p)),
    ...(hasWebsite && !demo.includes("Google Analytics") ? ["Google Analytics"] : []),
  ];
  return { connected, missing, demo };
}

/** "follower growth, website and community numbers" — in the design's order: social, then website. */
export function unlockSentence(missing: MissingSource[]) {
  const parts = missing.flatMap((m) => m.unlocks);
  const ordered = ["follower growth", "website", "community"].filter((p) => parts.includes(p));
  const list = ordered.length > 1 ? `${ordered.slice(0, -1).join(", ")} and ${ordered[ordered.length - 1]}` : ordered[0];
  return `${list} numbers`;
}

/** When the paid numbers were last read: the latest performance snapshot. */
export async function lastUpdated(clientId: string) {
  const s = await prisma.performanceSnapshot.findFirst({ where: { clientId }, orderBy: { capturedAt: "desc" }, select: { capturedAt: true } });
  return s?.capturedAt ?? null;
}

// ─── Takeaways ─────────────────────────────────────────────────────────────

export const TAKEAWAYS_MAX = 3;
/** "This week's": older takeaways are rewritten on the next visit. */
export const TAKEAWAYS_STALE_MS = 7 * 24 * 60 * 60 * 1000;

type OldTakeaway = { title: string; detail: string; action: Takeaway["action"] };

/** Takeaways written before Insights v2 (title + detail) read as the new shape, without a made-up number. */
function normalizeTakeaway(t: Takeaway | OldTakeaway): Takeaway {
  if ("headline" in t) return t;
  return { tag: "Performance", metric: "", headline: t.title, compare: [], action: t.action, why: t.detail };
}

export async function loadTakeaways(clientId: string) {
  const brief = await prisma.performanceBrief.findUnique({ where: { clientId } });
  const takeaways = brief?.takeaways ? jsonArray<Takeaway | OldTakeaway>(brief.takeaways).map(normalizeTakeaway).slice(0, TAKEAWAYS_MAX) : [];
  const actions = brief?.actions ? jsonArray<PerformanceAction>(brief.actions).slice(0, 3) : [];
  const stale = !brief?.takeaways || !brief.actions || Date.now() - brief.generatedAt.getTime() > TAKEAWAYS_STALE_MS;
  return { takeaways, actions, generatedAt: brief?.generatedAt ?? null, stale };
}

const VIEW_HREF: Record<NonNullable<Takeaway["action"]["view"]>, string> = {
  performance: "/insights/performance",
  creative: "/insights/performance#creative",
  market: "/insights/market",
  competitors: "/insights/market/competitors",
  trends: "/insights/market/trends",
  audience: "/insights/audience",
  seo: "/insights/seo",
};

/** A brief action starts a project with the takeaway as its idea; a view action opens the evidence. */
export function takeawayHref(t: Pick<Takeaway, "headline" | "why" | "action">) {
  if (t.action.kind === "brief" || !t.action.view) return `/brief/new?${new URLSearchParams({ q: `${t.headline}. ${t.why}` })}`;
  return VIEW_HREF[t.action.view] ?? "/insights/performance";
}

// ─── Insights v2 helpers ───────────────────────────────────────────────────

/** Connecting a source is done by the client's Klingit team: Connect opens that chat. */
export async function connectHref(clientId: string) {
  const p = await prisma.project.findFirst({ where: { clientId, status: { notIn: ["ARCHIVED", "DRAFT"] } }, orderBy: { updatedAt: "desc" }, select: { id: true } });
  return p ? `/projects/${p.id}?channel=klingit` : "/help";
}

export type SourceState = "live" | "sample" | "demo" | "connect";

/** Every source Insights reads, with its real state. Demo-filled sources say "Demo", never "Live". */
export async function dataSources(clientId: string) {
  const [paid, audience, demo, kpis] = await Promise.all([loadPaidMedia(clientId), loadAudienceData(clientId), loadDemoSources(clientId), loadContentKpis(clientId)]);
  const ad = (platform: string, name: string): { name: string; state: SourceState } => ({
    name,
    state: paid.connected.includes(platform) ? (paid.isSample ? "sample" : "live") : demo.includes(platform) ? "demo" : "connect",
  });
  const social = kpis.followerGrowth.some((f) => f.followerCount !== null);
  const sources: { name: string; state: SourceState }[] = [
    ...(paid.inScope ? [ad("Meta", "Meta Ads"), ad("LinkedIn", "LinkedIn"), ad("Google", "Google Ads")] : [{ name: "LinkedIn", state: (demo.includes("LinkedIn") ? "demo" : social ? "live" : "connect") as SourceState }]),
    { name: "Google Analytics", state: demo.includes("Google Analytics") ? "demo" : audience.website.length ? "live" : "connect" },
  ];
  return sources;
}

/** Delivered creative's average CTR per format ("Story 9:16", "Carousel"), best first. */
export function ctrByFormat(measured: { format: string; ctr: number }[]) {
  const groups = new Map<string, number[]>();
  for (const a of measured) {
    const key = a.format.split(" · ")[0];
    groups.set(key, [...(groups.get(key) ?? []), a.ctr]);
  }
  return [...groups].map(([label, v]) => ({ label, value: Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 10) / 10, count: v.length })).sort((a, b) => b.value - a.value);
}
