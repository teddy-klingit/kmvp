import { prisma } from "@/lib/prisma";
import type { PlatformCampaign } from "@/lib/performance";
import { sampleImageUrl } from "@/lib/sample-image";
import { formatDate } from "@/lib/utils";

/**
 * Aggregates PerformanceSnapshot rows (each one a period's activity, not a
 * lifetime cumulative total) into the same PlatformCampaign shape the
 * "current" 30-day view uses — so a date-range-filtered report can reuse
 * every campaign-grid/chart component unchanged. Real (non-sample) accounts
 * only get spend/conversions here where they were actually seeded/recorded;
 * where the range has no snapshots at all, the campaign is simply absent
 * from the result — the caller should treat an empty result as "no
 * historical data for this window" rather than "zero performance".
 */
export async function campaignMetricsForRange(
  clientId: string,
  range: { from: Date; to: Date },
  platform?: string
): Promise<{ campaigns: PlatformCampaign[]; hasHistory: boolean }> {
  const snapshots = await prisma.performanceSnapshot.findMany({
    where: { clientId, capturedAt: { gte: range.from, lte: range.to }, ...(platform ? { platform } : {}) },
    orderBy: { capturedAt: "asc" },
  });

  const anySnapshots = await prisma.performanceSnapshot.count({ where: { clientId } });

  const byCampaign = new Map<
    string,
    { platform: string; campaignId: string; campaignName: string; impressions: number; clicks: number; spend: number; conversions: number }
  >();
  for (const s of snapshots) {
    const entry = byCampaign.get(s.campaignId) ?? { platform: s.platform, campaignId: s.campaignId, campaignName: s.campaignName, impressions: 0, clicks: 0, spend: 0, conversions: 0 };
    entry.impressions += s.impressions;
    entry.clicks += s.clicks;
    entry.spend += s.spend ?? 0;
    entry.conversions += s.conversions ?? 0;
    byCampaign.set(s.campaignId, entry);
  }

  const campaigns: PlatformCampaign[] = Array.from(byCampaign.values()).map((c) => ({
    platform: c.platform,
    accountName: c.platform,
    currency: "USD",
    campaignId: c.campaignId,
    campaignName: c.campaignName,
    impressions: c.impressions,
    clicks: c.clicks,
    ctr: c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 1000) / 10 : 0,
    spend: Math.round(c.spend * 100) / 100,
    conversions: Math.round(c.conversions),
    costPerConversion: c.conversions > 0 ? Math.round((c.spend / c.conversions) * 100) / 100 : null,
    thumbnailUrl: sampleImageUrl(c.campaignId),
  }));

  return { campaigns, hasHistory: anySnapshots > 0 };
}

/**
 * Weekly spend + impressions trend per platform, for the "more graphs"
 * charts on the Performance tab — reuses FollowerGrowthChart's wide-format
 * shape ({date, [platform]: value}[]) so no new chart component is needed.
 * Buckets by week-index relative to now (not exact capturedAt equality):
 * snapshots for different campaigns in the same seeded "week" land a few
 * seconds apart, so grouping by literal timestamp would scatter them into
 * near-duplicate weeks.
 */
export async function weeklyPerformanceTrend(clientId: string, platform?: string) {
  const snapshots = await prisma.performanceSnapshot.findMany({
    where: { clientId, ...(platform ? { platform } : {}) },
  });
  if (snapshots.length === 0) return { spendData: [], impressionsData: [], platforms: [] as string[] };

  const now = Date.now();
  const platformsSet = new Set<string>();
  const byWeek = new Map<number, { spend: Record<string, number>; impressions: Record<string, number>; sampleDate: Date }>();
  for (const s of snapshots) {
    const weekIndex = Math.round((now - s.capturedAt.getTime()) / (7 * 86400000));
    platformsSet.add(s.platform);
    const entry = byWeek.get(weekIndex) ?? { spend: {}, impressions: {}, sampleDate: s.capturedAt };
    entry.spend[s.platform] = (entry.spend[s.platform] ?? 0) + (s.spend ?? 0);
    entry.impressions[s.platform] = (entry.impressions[s.platform] ?? 0) + s.impressions;
    if (s.capturedAt < entry.sampleDate) entry.sampleDate = s.capturedAt;
    byWeek.set(weekIndex, entry);
  }
  const weekIndices = Array.from(byWeek.keys()).sort((a, b) => b - a);
  const platforms = Array.from(platformsSet);

  const spendData = weekIndices.map((idx) => {
    const entry = byWeek.get(idx)!;
    const row: Record<string, string | number> = { date: formatDate(entry.sampleDate) };
    for (const p of platforms) row[p] = Math.round((entry.spend[p] ?? 0) * 100) / 100;
    return row;
  });
  const impressionsData = weekIndices.map((idx) => {
    const entry = byWeek.get(idx)!;
    const row: Record<string, string | number> = { date: formatDate(entry.sampleDate) };
    for (const p of platforms) row[p] = Math.round(entry.impressions[p] ?? 0);
    return row;
  });

  return { spendData, impressionsData, platforms };
}
