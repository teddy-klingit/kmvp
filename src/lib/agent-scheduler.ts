import { prisma } from "@/lib/prisma";
import { generatePerformanceBrief } from "@/lib/insights-brief";
import { loadTakeaways } from "@/lib/insights-data";
import { lastClosed, writeReport } from "@/lib/report-data";
import { syncDailyAdMetrics } from "@/lib/integrations/ad-daily";
import { logError } from "@/lib/secrets";
import { sendPlanReminders } from "@/lib/plan";
import { runWeeklyOpportunityScans } from "@/lib/opportunities";

/**
 * Scheduled agent work (replaces the old page-load runs): for every active client, this week's Insights
 * takeaways when they're missing or older than a week, and the latest closed week's and month's reports
 * when they haven't been written. Runs hourly inside the server (src/instrumentation.ts) and on demand
 * through POST /api/cron/agents. Each run is logged as an AgentRun by the agents themselves.
 */
const RETRY_AFTER_MS = 30 * 60 * 1000;

export async function runScheduledAgents(now = new Date()) {
  // Demo accounts are seeded and stay as seeded: no scheduled agent ever writes to them.
  const clients = await prisma.client.findMany({ where: { status: { in: ["ACTIVE", "ONBOARDING"] }, isDemo: false }, select: { id: true, name: true } });
  const done: string[] = [];
  // Plan reminders: 7 and 2 days before a brief-by date, and on the day (each once).
  const reminded = await sendPlanReminders(now, clients.map((c) => c.id)).catch(() => 0);
  if (reminded) done.push(`plan reminders: ${reminded}`);
  // Opportunities: one scan a week per client, on Klingit (no client credits). Mondays from 6, or when one is overdue.
  if (now.getDay() === 1 && now.getHours() >= 6) done.push(...(await runWeeklyOpportunityScans(clients.map((c) => c.id), now).catch(() => [])).map((d) => `opportunities ${d}`));
  for (const c of clients) {
    try {
      // Real per-day ad metrics first (every 6 hours), so the takeaways and charts read today's numbers.
      const daily = await syncDailyAdMetrics(c.id).catch((e: unknown) => ({ synced: [], skipped: e instanceof Error ? e.message : "failed" }));
      if (daily.synced.length) done.push(`${c.name}: daily ${daily.synced.join(", ")}`);
      // Don't pile up runs: skip a client whose performance agent ran in the last half hour.
      const recent = await prisma.agentRun.findFirst({ where: { clientId: c.id, agent: { key: "performance_agent" }, createdAt: { gte: new Date(now.getTime() - RETRY_AFTER_MS) } }, select: { id: true } });
      if (recent) continue;
      const { stale } = await loadTakeaways(c.id, now);
      if (stale) {
        const r = await generatePerformanceBrief(c.id);
        done.push(`${c.name}: takeaways ${r.ok ? "written" : `skipped (${r.error})`}`);
      }
      for (const kind of ["WEEKLY", "MONTHLY"] as const) {
        const period = lastClosed(kind, now);
        const exists = await prisma.generatedReport.findUnique({ where: { clientId_kind_periodStart: { clientId: c.id, kind, periodStart: period.start } }, select: { id: true } });
        if (exists) continue;
        const r = await writeReport(c.id, period);
        done.push(`${c.name}: ${period.label} ${r.ok ? "written" : `skipped (${r.error})`}`);
      }
    } catch (err) {
      done.push(`${c.name}: failed (${err instanceof Error ? err.message : "unknown"})`);
    }
  }
  return done;
}

const HOUR = 60 * 60 * 1000;
const g = globalThis as unknown as { __klingitScheduler?: NodeJS.Timeout };

/** Starts the hourly tick once per server process (first run a few minutes after boot). */
export function startAgentScheduler() {
  if (g.__klingitScheduler) return;
  const tick = () =>
    runScheduledAgents()
      .then((done) => done.length && console.log("[agents] scheduled:", done.join("; ")))
      .catch((err) => logError("[agents] scheduled run failed", err));
  setTimeout(tick, 3 * 60 * 1000);
  g.__klingitScheduler = setInterval(tick, HOUR);
}
