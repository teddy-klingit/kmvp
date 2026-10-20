import { prisma } from "@/lib/prisma";
import { adCampaigns, adFreshness, recordSync, writeAdDays } from "@/lib/metrics";
import { recordPerformanceSnapshots } from "@/lib/integrations/performance-alerts";
import { getMetaDailyInsights, type DailyResult } from "@/lib/integrations/meta-ads";
import { getLinkedInDailyInsights } from "@/lib/integrations/linkedin-ads";
import { getGoogleAdsDailyInsights } from "@/lib/integrations/google-ads";

/**
 * Real per-day ad metrics for a client: fetched day by day from every connected platform and stored in the data
 * layer (MetricDaily, Phase V; one number per campaign per day). Refreshed at most every 6 hours; the last 90 days are re-read
 * each time, because platforms keep adjusting recent days. Sample accounts and organic-only clients have none.
 */
export const DAILY_WINDOW_DAYS = 90;
const STALE_MS = 6 * 60 * 60 * 1000;

export async function dailyMetricsFreshness(clientId: string) {
  return adFreshness(clientId, STALE_MS);
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
  const since = new Date(Date.now() - (DAILY_WINDOW_DAYS - 1) * 86400000).toISOString().slice(0, 10);
  for (const [platform, r] of results) {
    if (!r.ok) {
      // A platform that's set up but failed is recorded (and shown with Reconnect); one that isn't set up is skipped.
      if (r.reason === "api_error") await recordSync(clientId, platform, { ok: false, error: r.message ?? "The platform didn't answer." });
      continue;
    }
    await writeAdDays(clientId, platform, { name: r.accountName, currency: r.currency }, since, r.rows);
    await recordSync(clientId, platform, { ok: true, account: r.accountName });
    synced.push(platform);
  }
  // Performance alerts compare snapshots over time; they're taken here, by the sync, never on a page load.
  if (synced.length) await recordPerformanceSnapshots(clientId, await adCampaigns(clientId, 30));
  return { synced, skipped: null };
}
