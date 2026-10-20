import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { getIndustryNews } from "@/lib/integrations/industry-news";
import { getCompetitorAdLibraryActivity } from "@/lib/integrations/meta-ad-library";
import { getLinkedInCompetitorAds } from "@/lib/integrations/linkedin-ad-library";
import { recordCompetitorSnapshots, recordNewsSignals } from "@/lib/integrations/market-signals";
import { recordSync } from "@/lib/metrics";

/**
 * Phase V: the Market tabs' outside sources (industry news, the Meta and LinkedIn ad libraries) are read by the
 * scheduler, at most every 6 hours, and stored as signals and competitor checks. The pages read what's stored,
 * never the sources on a page load. Demo accounts keep their seeded signals.
 */
const STALE_MS = 6 * 60 * 60 * 1000;

export async function refreshMarketSources(clientId: string, now = new Date(), opts: { force?: boolean } = {}) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, name: true, industry: true, competitorBrands: true, isDemo: true } });
  if (client.isDemo) return { refreshed: false, skipped: "demo account" };
  const last = await prisma.dataSource.findUnique({ where: { clientId_source: { clientId, source: "Market" } }, select: { lastSyncAt: true } });
  if (!opts.force && last?.lastSyncAt && now.getTime() - last.lastSyncAt.getTime() < STALE_MS) return { refreshed: false, skipped: "fresh" };
  const brands = jsonArray<string>(client.competitorBrands);
  const [news, meta, linkedIn] = await Promise.all([
    getIndustryNews(client.industry ? `${client.industry} marketing` : client.name).catch(() => []),
    brands.length ? getCompetitorAdLibraryActivity(brands).catch(() => []) : Promise.resolve([]),
    brands.length ? getLinkedInCompetitorAds(brands).catch(() => []) : Promise.resolve([]),
  ]);
  await Promise.all([recordCompetitorSnapshots(clientId, meta, linkedIn), recordNewsSignals(clientId, news)]);
  await recordSync(clientId, "Market", { ok: true }, now);
  return { refreshed: true, skipped: null };
}

/** The latest stored check per competitor and platform: example ads, and which libraries answered (last 7 days). */
export async function latestCompetitorChecks(clientId: string, now = new Date()) {
  const snaps = await prisma.competitorSnapshot.findMany({ where: { clientId, capturedAt: { gte: new Date(now.getTime() - 7 * 86400000) } }, orderBy: { capturedAt: "desc" }, select: { brand: true, platform: true, ads: true } });
  const out = new Map<string, { ads: { href: string; label: string }[]; checked: string[] }>();
  for (const s of snaps) {
    const b = out.get(s.brand) ?? { ads: [], checked: [] };
    if (b.checked.includes(s.platform)) continue;
    b.checked.push(s.platform);
    b.ads.push(...jsonArray<{ href: string; label: string }>(s.ads));
    out.set(s.brand, b);
  }
  return out;
}
