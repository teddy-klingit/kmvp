import { prisma } from "@/lib/prisma";
import type { AdLibraryResult } from "@/lib/integrations/meta-ad-library";
import type { LinkedInAdLibraryResult } from "@/lib/integrations/linkedin-ad-library";
import type { NewsItem } from "@/lib/integrations/industry-news";
import { notify } from "@/lib/notifier";

const SNAPSHOT_STALE_MS = 6 * 60 * 60 * 1000; // don't re-diff competitors more than once per 6h
const SPIKE_NOTIFY_THRESHOLD = 0.5; // notify the client when volume is up 50%+
const NEW_AD_NOTIFY_THRESHOLD = 3; // notify when 3+ new ads appear in one check
// One competitor alert per competitor per week, the same way performance alerts are deduped:
// a brand that keeps launching ads is one ongoing story, not a new alert every 6h check.
const COMPETITOR_DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function competitorAlertKey(brand: string) {
  return `competitor:${brand.trim().toLowerCase()}`;
}

/** True when this competitor already raised an alert in the last 7 days (archived alerts count too). */
async function competitorAlertedRecently(clientId: string, brand: string) {
  const recent = await prisma.marketSignal.findFirst({
    where: { clientId, dedupeKey: competitorAlertKey(brand), publishedAt: { gte: new Date(Date.now() - COMPETITOR_DEDUPE_WINDOW_MS) } },
    select: { id: true },
  });
  return Boolean(recent);
}

async function notifyClientOwner(clientId: string, title: string, body: string) {
  const owner = await prisma.clientUser.findFirst({ where: { clientId, permission: "OWNER" } });
  if (!owner) return;
  await notify({
      userId: owner.userId,
      clientId,
      type: "SYSTEM",
      title,
      body,
      actionUrl: "/insights/market/competitors",
      actionLabel: "View",
    });
}

/**
 * Records a fresh CompetitorSnapshot per brand+platform from data already
 * fetched for the page render (no extra API calls), and diffs against the
 * prior snapshot to log real MarketSignal rows + notify on meaningful spikes.
 * Skipped if the client's last snapshot is recent, so this only runs a
 * handful of times a day per client rather than on every page view.
 */
export async function recordCompetitorSnapshots(
  clientId: string,
  metaResults: AdLibraryResult[],
  linkedInResults: LinkedInAdLibraryResult[]
) {
  const latest = await prisma.competitorSnapshot.findFirst({
    where: { clientId },
    orderBy: { capturedAt: "desc" },
  });
  if (latest && Date.now() - latest.capturedAt.getTime() < SNAPSHOT_STALE_MS) return;

  const current: { brand: string; platform: string; totalAds: number | null; adIds: string[] }[] = [];

  for (const r of metaResults) {
    if (r.ok) current.push({ brand: r.brand, platform: "Meta", totalAds: null, adIds: r.ads.map((a) => a.id) });
  }
  for (const r of linkedInResults) {
    if (r.ok) current.push({ brand: r.brand, platform: "LinkedIn", totalAds: r.total, adIds: r.ads.map((a) => a.adUrl) });
  }

  for (const snap of current) {
    const previous = await prisma.competitorSnapshot.findFirst({
      where: { clientId, brand: snap.brand, platform: snap.platform },
      orderBy: { capturedAt: "desc" },
    });

    await prisma.competitorSnapshot.create({
      data: { clientId, brand: snap.brand, platform: snap.platform, totalAds: snap.totalAds, adIds: snap.adIds },
    });

    if (!previous) continue;

    const previousAdIds = new Set(Array.isArray(previous.adIds) ? (previous.adIds as string[]) : []);
    const newAdCount = snap.adIds.filter((id) => !previousAdIds.has(id)).length;

    if (newAdCount > 0 && !(await competitorAlertedRecently(clientId, snap.brand))) {
      await prisma.marketSignal.create({
        data: {
          clientId,
          dedupeKey: competitorAlertKey(snap.brand),
          type: "COMPETITOR",
          title: `${snap.brand} launched ${newAdCount} new ad${newAdCount === 1 ? "" : "s"} on ${snap.platform}`,
          summary: `Spotted in the ${snap.platform} Ad Library since the last check.`,
          source: snap.platform,
          relevance: newAdCount >= NEW_AD_NOTIFY_THRESHOLD ? "High relevance" : "Relevant",
          publishedAt: new Date(),
        },
      });
      if (newAdCount >= NEW_AD_NOTIFY_THRESHOLD) {
        await notifyClientOwner(
          clientId,
          "Competitor activity spike",
          `${snap.brand} launched ${newAdCount} new ads on ${snap.platform}.`
        );
      }
    }

    if (snap.totalAds !== null && previous.totalAds !== null && previous.totalAds >= 5) {
      const pctChange = (snap.totalAds - previous.totalAds) / previous.totalAds;
      if (pctChange >= 0.3 && !(await competitorAlertedRecently(clientId, snap.brand))) {
        const pct = Math.round(pctChange * 100);
        await prisma.marketSignal.create({
          data: {
            clientId,
            dedupeKey: competitorAlertKey(snap.brand),
            type: "COMPETITOR",
            title: `${snap.brand}'s ad volume up ${pct}% on ${snap.platform}`,
            summary: `${previous.totalAds} → ${snap.totalAds} live ads.`,
            source: snap.platform,
            relevance: pctChange >= SPIKE_NOTIFY_THRESHOLD ? "High relevance" : "Relevant",
            publishedAt: new Date(),
          },
        });
        if (pctChange >= SPIKE_NOTIFY_THRESHOLD) {
          await notifyClientOwner(
            clientId,
            "Competitor ad volume spike",
            `${snap.brand}'s ad volume on ${snap.platform} is up ${pct}% (${previous.totalAds} → ${snap.totalAds}).`
          );
        }
      }
    }
  }
}

/**
 * Logs genuinely new news headlines as TREND-type MarketSignal rows, deduped
 * by title against what's already logged for this client — safe to call on
 * every page view since it only ever inserts items it hasn't seen before.
 */
export async function recordNewsSignals(clientId: string, news: NewsItem[]) {
  if (news.length === 0) return;

  const existing = await prisma.marketSignal.findMany({
    where: { clientId, type: "TREND" },
    select: { title: true },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
  const seenTitles = new Set(existing.map((s) => s.title.toLowerCase()));

  const unseen = news.filter((n) => !seenTitles.has(n.title.toLowerCase())).slice(0, 3);
  if (unseen.length === 0) return;

  await prisma.marketSignal.createMany({
    data: unseen.map((n) => ({
      clientId,
      type: "TREND" as const,
      title: n.title,
      summary: n.source ? `Covered by ${n.source}.` : "Recent category coverage.",
      source: n.source,
      relevance: "Watch",
      publishedAt: n.publishedAt ?? new Date(),
    })),
  });
}

export async function getRecentMarketSignals(clientId: string, opts?: { type?: "COMPETITOR" | "TREND" | "MARKET"; take?: number }) {
  return prisma.marketSignal.findMany({
    where: { clientId, archivedAt: null, ...(opts?.type ? { type: opts.type } : {}) },
    orderBy: { publishedAt: "desc" },
    take: opts?.take ?? 20,
  });
}

/** Signal counts bucketed by week, oldest-first, for a simple activity-over-time chart. */
export async function getSignalFrequency(clientId: string, opts?: { type?: "COMPETITOR" | "TREND" | "MARKET"; weeks?: number }) {
  const weeks = opts?.weeks ?? 8;
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

  const signals = await prisma.marketSignal.findMany({
    where: { clientId, archivedAt: null, publishedAt: { gte: since }, ...(opts?.type ? { type: opts.type } : {}) },
    select: { publishedAt: true },
  });

  const buckets = new Map<string, number>();
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
    const label = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(weekStart);
    buckets.set(label, 0);
  }
  const labels = Array.from(buckets.keys());

  for (const signal of signals) {
    const weeksAgo = Math.floor((Date.now() - signal.publishedAt.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const index = weeks - 1 - weeksAgo;
    if (index >= 0 && index < labels.length) {
      const label = labels[index];
      buckets.set(label, (buckets.get(label) ?? 0) + 1);
    }
  }

  return labels.map((label) => ({ week: label, count: buckets.get(label) ?? 0 }));
}
