import { prisma } from "@/lib/prisma";
import { performancePrompt, synthesizePerformanceInsights, type CampaignFacts, type Takeaway, type PerformanceAction } from "@/lib/ai/agents/performance-agent";
import { getRecentMarketSignals } from "@/lib/integrations/market-signals";
import { loadMeasuredAssets, loadPaidMedia } from "@/lib/insights-data";
import { loadDaily } from "@/lib/insights/daily";
import { isGrounded, numbersIn, textGrounded } from "@/lib/insights/number-guard";

/**
 * The performance agent's read of the client's real data: up to 3 takeaways (Overview) and up to 3 actions
 * ("What to do", Performance). Grounded only in what's passed in: the last 30 days of daily campaign data (or
 * the sample account's campaigns), delivered assets' measured CTR and the last 7 days of market signals. Any
 * number the agent uses that isn't in that data is dropped before it's stored.
 */
export async function generatePerformanceBrief(clientId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, name: true } });
  const [paid, daily, { measured }, signals] = await Promise.all([loadPaidMedia(clientId), loadDaily(clientId, 30), loadMeasuredAssets(clientId), getRecentMarketSignals(clientId, { take: 12 })]);

  const formatMap = new Map<string, { total: number; count: number }>();
  for (const a of measured) {
    const entry = formatMap.get(a.format) ?? { total: 0, count: 0 };
    entry.total += a.ctr;
    entry.count += 1;
    formatMap.set(a.format, entry);
  }
  const ownFormatBreakdown = [...formatMap].map(([format, { total, count }]) => ({ format, ctr: Math.round((total / count) * 10) / 10, assetCount: count }));

  const campaigns: CampaignFacts[] = daily.has
    ? daily.campaigns.map((c) => ({ platform: c.platform, accountName: c.accountName, currency: daily.currency ?? "", campaignName: c.name, impressions: c.impressions, clicks: c.clicks, ctr: c.ctr, spend: Math.round(c.spend), ctrLast7: c.ctrLast7, ctrTrailing: c.ctrTrailing }))
    : paid.campaigns;
  if (campaigns.length === 0 && ownFormatBreakdown.length === 0) {
    return { ok: false, error: "No performance data available yet — connect an ad account or wait for delivered assets to have measured CTR." };
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const prompt = performancePrompt({
    clientName: client.name,
    platformCampaigns: campaigns,
    ownFormatBreakdown,
    assets: measured.map((a) => ({ name: a.title, project: a.project, format: a.format, ctr: a.ctr })),
    marketSignals: signals.filter((s) => s.publishedAt.getTime() >= weekAgo),
  });
  const result = await synthesizePerformanceInsights({ clientId: client.id, prompt });
  if (!result.ok) return { ok: false, error: result.error };

  const pool = numbersIn(prompt);
  const takeaways = result.data.takeaways.map((t) => groundTakeaway(t, pool)).filter((t): t is Takeaway => Boolean(t)).slice(0, 3);
  const actions = result.data.actions.map((a) => groundAction(a, pool)).slice(0, 3);
  const data = {
    summary: result.data.summary,
    // The older readers (reports) still read title/detail.
    recommendations: actions.map((a) => ({ title: a.headline, detail: a.why })),
    takeaways,
    actions,
    generatedAt: new Date(),
  };
  await prisma.performanceBrief.upsert({ where: { clientId }, update: data, create: { clientId, ...data } });
  return { ok: true };
}

/** Keeps only the numbers the data supports: ungrounded comparison bars go, and an ungrounded big number falls back to the first bar. */
export function groundTakeaway(t: Takeaway, pool: number[]): Takeaway | null {
  const compare = t.compare.filter((c) => isGrounded(c.value, pool));
  const metric = textGrounded(t.metric, pool) ? t.metric : compare[0]?.display ?? "";
  if (!metric && compare.length === 0) return null;
  return { ...t, metric, compare };
}

export function groundAction(a: PerformanceAction, pool: number[]): PerformanceAction {
  return { ...a, chip: textGrounded(a.chip, pool) ? a.chip : "" };
}
