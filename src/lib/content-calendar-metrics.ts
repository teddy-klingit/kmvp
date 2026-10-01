import { prisma } from "@/lib/prisma";

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

/**
 * The SOW-Section-8-style KPI set — shared by the Performance tab (headline
 * tiles) and the Content Calendar tab (detailed breakdown), so the two
 * screens can never silently disagree on the same numbers.
 */
export async function computeContentKpis(clientId: string) {
  const [publishedPosts, planTargets, followerSnapshots] = await Promise.all([
    prisma.contentPost.findMany({ where: { clientId, status: "PUBLISHED" }, orderBy: { publishedDate: "desc" } }),
    prisma.contentPlanTarget.findMany({ where: { clientId }, orderBy: { platform: "asc" } }),
    prisma.followerSnapshot.findMany({ where: { clientId }, orderBy: { capturedAt: "asc" } }),
  ]);

  const byPlatform = new Map<string, typeof followerSnapshots>();
  for (const f of followerSnapshots) {
    const arr = byPlatform.get(f.platform) ?? [];
    arr.push(f);
    byPlatform.set(f.platform, arr);
  }
  const followerGrowth = Array.from(byPlatform.entries()).map(([platform, snaps]) => {
    const latest = snaps[snaps.length - 1];
    // "MoM" means ~30 days back, not just "the previous snapshot" — with
    // weekly-cadence data that would silently become week-over-week growth
    // under the same label. Find whichever earlier snapshot sits closest
    // to 30 days before the latest one.
    const targetDate = latest.capturedAt.getTime() - 30 * 86400000;
    const earlier = snaps.slice(0, -1);
    const previous =
      earlier.length > 0
        ? earlier.reduce((closest, s) => (Math.abs(s.capturedAt.getTime() - targetDate) < Math.abs(closest.capturedAt.getTime() - targetDate) ? s : closest))
        : null;
    const growthPct =
      previous && previous.followerCount > 0
        ? Math.round(((latest.followerCount - previous.followerCount) / previous.followerCount) * 1000) / 10
        : null;
    return { platform, followerCount: latest.followerCount, growthPct, series: snaps };
  });
  const trackedGrowthPcts = followerGrowth.map((f) => f.growthPct).filter((v): v is number => v !== null);
  const blendedFollowerGrowthPct = average(trackedGrowthPcts);

  const now = new Date();
  const thisMonthPosts = publishedPosts.filter(
    (p) => p.publishedDate && p.publishedDate.getMonth() === now.getMonth() && p.publishedDate.getFullYear() === now.getFullYear()
  );
  // Flat *4 (not *4.33) so a weekly target of e.g. 2 gives an exact monthly
  // minimum of 8 — matching how a client's SOW actually states volume
  // ("8 TikToks per month"), not a rounded weekly-rate approximation.
  const volumeByPlatform = planTargets.map((t) => {
    const published = thisMonthPosts.filter((p) => p.platform === t.platform).length;
    const target = t.weeklyVolume * 4;
    return { platform: t.platform, published, target };
  });
  const contentVolumeThisMonth = thisMonthPosts.length;
  const contentVolumeTarget = volumeByPlatform.reduce((s, v) => s + v.target, 0);

  const avgEngagementRate = average(publishedPosts.map((p) => p.engagementRate).filter((v): v is number => v !== null));
  const videoViewValues = publishedPosts.map((p) => p.videoViews).filter((v): v is number => v !== null);
  const avgVideoViews = videoViewValues.length ? Math.round(average(videoViewValues)!) : null;
  const totalWebsiteClicks = publishedPosts.reduce((s, p) => s + (p.websiteClicks ?? 0), 0);

  return {
    followerGrowth,
    blendedFollowerGrowthPct,
    volumeByPlatform,
    contentVolumeThisMonth,
    contentVolumeTarget,
    avgEngagementRate,
    avgVideoViews,
    totalWebsiteClicks,
    publishedPosts,
  };
}

/**
 * Average engagement rate per content type/format, from real published
 * posts — used in place of the "CTR by creative format" chart for sample
 * (pitch/demo) accounts, since those clients have no delivered-asset
 * history to power that chart yet, only organic content performance.
 */
export function contentFormatPerformance(publishedPosts: { contentType: string | null; engagementRate: number | null }[]) {
  const byFormat = new Map<string, { total: number; count: number }>();
  for (const p of publishedPosts) {
    if (!p.contentType || p.engagementRate === null) continue;
    const entry = byFormat.get(p.contentType) ?? { total: 0, count: 0 };
    entry.total += p.engagementRate;
    entry.count += 1;
    byFormat.set(p.contentType, entry);
  }
  return Array.from(byFormat.entries())
    .map(([format, { total, count }]) => ({ key: format, ctr: Math.round((total / count) * 10) / 10, count }))
    .sort((a, b) => b.ctr - a.ctr);
}
