import { prisma } from "@/lib/prisma";
import type { PlatformCampaign } from "@/lib/performance";

const SNAPSHOT_STALE_MS = 6 * 60 * 60 * 1000; // don't re-check more than once per 6h
const BASELINE_MIN_AGE_MS = 4 * 24 * 60 * 60 * 1000; // only compare against snapshots at least 4 days old
const BASELINE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // ...and no more than 14 days old ("trailing week" window)
const CTR_DROP_THRESHOLD = 0.3; // alert when CTR is down 30%+ vs. its own trailing average
const MIN_IMPRESSIONS = 500; // ignore campaigns too small to have a meaningful CTR
// A drop that persists is one alert, not one per check: suppress repeats for
// the same campaign for as long as the baseline window it was measured against.
const ALERT_DEDUPE_WINDOW_MS = BASELINE_MAX_AGE_MS;

export function performanceAlertKey(platform: string, campaignId: string) {
  return `perf:${platform}:${campaignId}`;
}

async function notifyClientOwner(clientId: string, title: string, body: string) {
  const owner = await prisma.clientUser.findFirst({ where: { clientId, permission: "OWNER" } });
  if (!owner) return;
  await prisma.notification.create({
    data: { userId: owner.userId, clientId, type: "SYSTEM", title, body, actionUrl: "/insights", actionLabel: "View" },
  });
}

/**
 * Records a PerformanceSnapshot per live campaign from data already fetched
 * for the page render, then compares each campaign's current CTR against the
 * average of its own snapshots from 4-14 days ago (a trailing-week baseline).
 * A real drop notifies the client the same way competitor spikes do. Skipped
 * if the client's last check is recent, so this runs a few times a day, not
 * on every page view.
 */
export async function recordPerformanceSnapshots(clientId: string, campaigns: PlatformCampaign[]) {
  const latest = await prisma.performanceSnapshot.findFirst({
    where: { clientId },
    orderBy: { capturedAt: "desc" },
  });
  if (latest && Date.now() - latest.capturedAt.getTime() < SNAPSHOT_STALE_MS) return;

  const now = Date.now();
  const baselineFrom = new Date(now - BASELINE_MAX_AGE_MS);
  const baselineTo = new Date(now - BASELINE_MIN_AGE_MS);

  for (const c of campaigns) {
    if (c.impressions < MIN_IMPRESSIONS) continue;

    const baseline = await prisma.performanceSnapshot.findMany({
      where: { clientId, platform: c.platform, campaignId: c.campaignId, capturedAt: { gte: baselineFrom, lte: baselineTo } },
      select: { ctr: true },
    });

    await prisma.performanceSnapshot.create({
      data: {
        clientId,
        platform: c.platform,
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        ctr: c.ctr,
        impressions: c.impressions,
        clicks: c.clicks,
      },
    });

    if (baseline.length === 0) continue; // no trailing history yet — nothing to compare against

    const avgCtr = baseline.reduce((sum, b) => sum + b.ctr, 0) / baseline.length;
    if (avgCtr <= 0) continue;

    const pctChange = (c.ctr - avgCtr) / avgCtr;
    if (pctChange <= -CTR_DROP_THRESHOLD) {
      const dedupeKey = performanceAlertKey(c.platform, c.campaignId);
      // Archived alerts still count — archiving a repeat must not let it regenerate.
      const alreadyAlerted = await prisma.marketSignal.findFirst({
        where: { clientId, dedupeKey, publishedAt: { gte: new Date(now - ALERT_DEDUPE_WINDOW_MS) } },
        select: { id: true },
      });
      if (alreadyAlerted) continue;

      const pct = Math.round(Math.abs(pctChange) * 100);
      await prisma.marketSignal.create({
        data: {
          clientId,
          dedupeKey,
          type: "PERFORMANCE",
          title: `"${c.campaignName}" CTR down ${pct}% vs its trailing average`,
          summary: `${c.platform}: ${avgCtr.toFixed(2)}% → ${c.ctr}% CTR.`,
          source: c.platform,
          relevance: pctChange <= -0.5 ? "High relevance" : "Relevant",
          publishedAt: new Date(),
        },
      });
      await notifyClientOwner(
        clientId,
        "Performance drop detected",
        `"${c.campaignName}" on ${c.platform} is down ${pct}% CTR vs its trailing average (${avgCtr.toFixed(2)}% → ${c.ctr}%).`
      );
    }
  }
}
