import { prisma } from "@/lib/prisma";
import { getMetaDailyInsights, type DailyResult } from "@/lib/integrations/meta-ads";
import { getLinkedInDailyInsights } from "@/lib/integrations/linkedin-ads";
import { getGoogleAdsDailyInsights } from "@/lib/integrations/google-ads";

/**
 * Real per-day ad metrics for a client: fetched day by day from every connected platform and stored in
 * AdDailyMetric (one row per campaign per day). Refreshed at most every 6 hours; the last 90 days are re-read
 * each time, because platforms keep adjusting recent days. Sample accounts and organic-only clients have none.
 */
export const DAILY_WINDOW_DAYS = 90;
const STALE_MS = 6 * 60 * 60 * 1000;

export async function dailyMetricsFreshness(clientId: string) {
  const latest = await prisma.adDailyMetric.findFirst({ where: { clientId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } });
  return { lastSynced: latest?.updatedAt ?? null, stale: !latest || Date.now() - latest.updatedAt.getTime() > STALE_MS };
}

/** Fetches and stores the daily rows. Returns which platforms answered. */
export async function syncDailyAdMetrics(clientId: string, opts: { force?: boolean } = {}) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { isSampleAccount: true, paidMediaInScope: true, isDemo: true } });
  if (client.isSampleAccount || !client.paidMediaInScope) return { synced: [] as string[], skipped: "no live ad accounts for this client" };
  // A demo account's days are seeded: never fill it from the platform's real ad accounts.
  if (client.isDemo) return { synced: [] as string[], skipped: "demo account" };
  if (!opts.force && !(await dailyMetricsFreshness(clientId)).stale) return { synced: [] as string[], skipped: "fresh" };

  const [meta, linkedIn, google] = await Promise.all([getMetaDailyInsights(clientId, DAILY_WINDOW_DAYS), getLinkedInDailyInsights(clientId, DAILY_WINDOW_DAYS), getGoogleAdsDailyInsights(clientId, DAILY_WINDOW_DAYS)]);
  const results: [string, DailyResult][] = [
    ["Meta", meta],
    ["LinkedIn", linkedIn],
    ["Google", google],
  ];
  const synced: string[] = [];
  for (const [platform, r] of results) {
    if (!r.ok) continue;
    // Upserts in chunks: a 90-day window is a few thousand rows at most.
    for (let i = 0; i < r.rows.length; i += 200) {
      await prisma.$transaction(
        r.rows.slice(i, i + 200).map((row) =>
          prisma.adDailyMetric.upsert({
            where: { clientId_platform_campaignId_date: { clientId, platform, campaignId: row.campaignId, date: row.date } },
            update: { campaignName: row.campaignName, accountName: r.accountName, currency: r.currency, impressions: row.impressions, clicks: row.clicks, spend: row.spend, conversions: row.conversions },
            create: { clientId, platform, accountName: r.accountName, currency: r.currency, ...row },
          })
        )
      );
    }
    synced.push(platform);
  }
  return { synced, skipped: null };
}
