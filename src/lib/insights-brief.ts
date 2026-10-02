import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { synthesizePerformanceInsights } from "@/lib/ai/agents/performance-agent";
import { getRecentMarketSignals } from "@/lib/integrations/market-signals";
import { loadMeasuredAssets, loadPaidMedia } from "@/lib/insights-data";

/**
 * The performance agent's read of the client's real data: summary + recommendations (Performance tab)
 * and up to 3 takeaways (Insights Overview). Grounded only in what's passed in: live or sample campaigns,
 * delivered assets' measured CTR, and the last 7 days of market signals.
 */
export async function generatePerformanceBrief(clientId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, name: true } });
  const [paid, { measured }, signals] = await Promise.all([loadPaidMedia(clientId), loadMeasuredAssets(clientId), getRecentMarketSignals(clientId, { take: 12 })]);

  const formatMap = new Map<string, { total: number; count: number }>();
  for (const a of measured) {
    const entry = formatMap.get(a.format) ?? { total: 0, count: 0 };
    entry.total += a.ctr;
    entry.count += 1;
    formatMap.set(a.format, entry);
  }
  const ownFormatBreakdown = [...formatMap].map(([format, { total, count }]) => ({ format, ctr: Math.round((total / count) * 10) / 10, assetCount: count }));

  if (paid.campaigns.length === 0 && ownFormatBreakdown.length === 0) {
    return { ok: false, error: "No performance data available yet — connect an ad account or wait for delivered assets to have measured CTR." };
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const result = await synthesizePerformanceInsights({
    clientId: client.id,
    clientName: client.name,
    platformCampaigns: paid.campaigns,
    ownFormatBreakdown,
    assets: measured.map((a) => ({ name: a.title, project: a.project, format: a.format, ctr: a.ctr })),
    marketSignals: signals.filter((s) => s.publishedAt.getTime() >= weekAgo),
  });
  if (!result.ok) return { ok: false, error: result.error };

  const data = { summary: result.data.summary, recommendations: result.data.recommendations, takeaways: result.data.takeaways.slice(0, 3), generatedAt: new Date() };
  await prisma.performanceBrief.upsert({ where: { clientId }, update: data, create: { clientId, ...data } });
  return { ok: true };
}

/** Clients whose takeaways are being written right now, so parallel page loads don't start a second run. */
const inFlight = new Set<string>();
/** After a run (success or failure), wait this long before a page load may start another. */
const RETRY_AFTER_MS = 30 * 60 * 1000;

/**
 * Writes this week's takeaways after the response is sent, when they're missing or older than a week.
 * Screenshot runs set INSIGHTS_AGENT_ON_PAGE_LOAD=0 so captures stay deterministic. TODO: move to a cron.
 */
export function scheduleTakeaways(clientId: string) {
  if (process.env.INSIGHTS_AGENT_ON_PAGE_LOAD === "0" || inFlight.has(clientId)) return;
  try {
    after(async () => {
      if (inFlight.has(clientId)) return;
      inFlight.add(clientId);
      try {
        const recent = await prisma.agentRun.findFirst({
          where: { clientId, agent: { key: "performance_agent" }, createdAt: { gte: new Date(Date.now() - RETRY_AFTER_MS) } },
          select: { id: true },
        });
        if (!recent) await generatePerformanceBrief(clientId);
      } catch (err) {
        console.error("takeaways run failed", err);
      } finally {
        inFlight.delete(clientId);
      }
    });
  } catch {
    // No request scope (e.g. a test render).
  }
}
