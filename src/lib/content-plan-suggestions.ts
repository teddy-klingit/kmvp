import { prisma } from "@/lib/prisma";
import { generateContentPlanSuggestions } from "@/lib/ai/agents/content-plan-agent";

/**
 * The content plan agent's suggestions for a client, each with a proposed day and a short reason, from
 * the real plan targets, post performance, follower trend and business outcomes. Used by "Suggest content"
 * and by the screenshot setup (scripts/screenshots/write-takeaways.ts).
 */
export async function writePlanSuggestions(viewer: { clientId: string; client: { name: string } }): Promise<{ error?: string | null }> {

  const [planTargets, recentPosts, followerSnapshots, businessOutcomes] = await Promise.all([
    prisma.contentPlanTarget.findMany({ where: { clientId: viewer.clientId } }),
    prisma.contentPost.findMany({
      where: { clientId: viewer.clientId, status: "PUBLISHED" },
      orderBy: { publishedDate: "desc" },
      take: 25,
    }),
    prisma.followerSnapshot.findMany({ where: { clientId: viewer.clientId }, orderBy: { capturedAt: "desc" }, take: 20 }),
    prisma.clientBusinessOutcome.findMany({ where: { clientId: viewer.clientId }, orderBy: { periodStart: "desc" }, take: 6 }),
  ]);

  const planned = await prisma.contentPost.findMany({
    where: { clientId: viewer.clientId, status: "PLANNED", scheduledDate: { gte: new Date() } },
    select: { scheduledDate: true },
  });
  const result = await generateContentPlanSuggestions({
    today: new Date().toISOString().slice(0, 10),
    plannedDays: [...new Set(planned.flatMap((p) => (p.scheduledDate ? [p.scheduledDate.toISOString().slice(0, 10)] : [])))],
    clientId: viewer.clientId,
    clientName: viewer.client.name,
    planTargets: planTargets.map((t) => ({ platform: t.platform, weeklyVolume: t.weeklyVolume })),
    recentPosts: recentPosts.map((p) => ({
      platform: p.platform,
      contentType: p.contentType,
      engagementRate: p.engagementRate,
      videoViews: p.videoViews,
      impressions: p.impressions,
    })),
    followerTrend: followerSnapshots.map((f) => ({ platform: f.platform, followerCount: f.followerCount, capturedAt: f.capturedAt.toISOString().slice(0, 10) })),
    businessOutcomes: businessOutcomes.map((o) => ({
      periodStart: o.periodStart.toISOString().slice(0, 10),
      periodEnd: o.periodEnd.toISOString().slice(0, 10),
      revenue: o.revenue,
      leadsGenerated: o.leadsGenerated,
    })),
  });

  if (!result.ok) return { error: result.error };

  await prisma.contentPlanSuggestion.createMany({
    data: result.data.suggestions.map((s) => ({
      clientId: viewer.clientId,
      title: s.title,
      rationale: s.rationale,
      platform: s.platform,
      suggestedVolumeChange: s.suggestedVolumeChange,
      sourceCadence: s.sourceCadence,
      proposedDate: proposedDay(s.proposedDate),
      reason: s.reason.slice(0, 60),
      stage: "IN_REVIEW",
    })),
  });

  return {};
}

/** The agent's YYYY-MM-DD, kept only if it's a real day between today and 60 days out (10:00, so it never slips a day across time zones). */
function proposedDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 10);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today && d.getTime() - today.getTime() <= 60 * 86400000 ? d : null;
}

