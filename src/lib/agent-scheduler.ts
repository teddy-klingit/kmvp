import { prisma } from "@/lib/prisma";
import { refreshMarketSources } from "@/lib/integrations/market-refresh";
import { purgeDisconnectedSources } from "@/lib/metrics";
import { generatePerformanceBrief } from "@/lib/insights-brief";
import { loadTakeaways } from "@/lib/insights-data";
import { lastClosed, writeReport } from "@/lib/report-data";
import { syncDailyAdMetrics } from "@/lib/integrations/ad-daily";
import { logError } from "@/lib/secrets";
import { sendPlanReminders } from "@/lib/plan";
import { runWeeklyOpportunityScans } from "@/lib/opportunities";
import { refreshInsights } from "@/lib/insight-records";
import { advanceOpportunities } from "@/lib/opportunity-results";
import { applyAllDueChanges } from "@/lib/contracts";
import { ensureAllGrants } from "@/lib/team-ledger";
import { getSetting } from "@/lib/platform-settings";
import { collectReportBatches, submitReportBatch } from "@/lib/ai/batch";
import type { Period } from "@/lib/report-data";
import { generateDueInvoices, refreshOverdue } from "@/lib/invoicing";

/**
 * Scheduled agent work (replaces the old page-load runs): for every active client, this week's Insights
 * takeaways when they're missing or older than a week, and the latest closed week's and month's reports
 * when they haven't been written. Runs hourly inside the server (src/instrumentation.ts) and on demand
 * through POST /api/cron/agents. Each run is logged as an AgentRun by the agents themselves.
 */
const RETRY_AFTER_MS = 30 * 60 * 1000;

export async function runScheduledAgents(now = new Date()) {
  const batchReports = await getSetting("batchScheduledReports");
  const due: { clientId: string; period: Period }[] = [];
  if (batchReports) await collectReportBatches().catch(() => 0);
  // Demo accounts are seeded and stay as seeded: no scheduled agent ever writes to them.
  const clients = await prisma.client.findMany({ where: { status: { in: ["ACTIVE", "ONBOARDING"] }, isDemo: false }, select: { id: true, name: true } });
  const done: string[] = [];
  // Plan reminders: 7 and 2 days before a brief-by date, and on the day (each once).
  const reminded = await sendPlanReminders(now, clients.map((c) => c.id)).catch(() => 0);
  if (reminded) done.push(`plan reminders: ${reminded}`);
  // Disconnected sources: their synced numbers are deleted 30 days after (Phase V).
  const purged = await purgeDisconnectedSources(now).catch(() => 0);
  if (purged) done.push(`purged ${purged} disconnected source${purged === 1 ? "" : "s"}`);
  // Contracts: scheduled upgrades and downgrades, upgrade ends, renewals (every client, demo included).
  await applyAllDueChanges(now).catch(() => 0);
  // Team credits: the month's PM and creative grants, rollover expiry and fixed services (idempotent).
  await ensureAllGrants(now).catch(() => 0);
  // Invoices: drafts for periods that started (staff send them), and sent invoices past due become overdue.
  await generateDueInvoices(now).catch(() => []);
  await refreshOverdue(now).catch(() => 0);
  // Opportunities: one scan a week per client, on Klingit (no client credits). Mondays from 6, or when one is overdue.
  if (now.getDay() === 1 && now.getHours() >= 6) done.push(...(await runWeeklyOpportunityScans(clients.map((c) => c.id), now).catch(() => [])).map((d) => `opportunities ${d}`));
  for (const c of clients) {
    try {
      // Real per-day ad metrics first (every 6 hours), so the takeaways and charts read today's numbers.
      const daily = await syncDailyAdMetrics(c.id).catch((e: unknown) => ({ synced: [], skipped: e instanceof Error ? e.message : "failed" }));
      if (daily.synced.length) done.push(`${c.name}: daily ${daily.synced.join(", ")}`);
      // Market sources (news, ad libraries) for the Market tabs, stored at most every 6 hours (Phase V).
      const market = await refreshMarketSources(c.id, now).catch(() => ({ refreshed: false }));
      if (market.refreshed) done.push(`${c.name}: market`);
      // Findings as insight records (Phase W), with the market: at most every 6 hours.
      if (market.refreshed) await refreshInsights(c.id, now).catch(() => null);
      // Opportunities move on: Running when their work went live, measured (Beat / Met / Missed) when the window ends.
      const moved = await advanceOpportunities(c.id, now).catch(() => [] as string[]);
      if (moved.length) done.push(`${c.name}: ${moved.join("; ")}`);
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
        // Phase U: through the Batch API (half price) when that setting is on; collected on a later tick.
        if (batchReports) {
          due.push({ clientId: c.id, period });
          continue;
        }
        const r = await writeReport(c.id, period);
        done.push(`${c.name}: ${period.label} ${r.ok ? "written" : `skipped (${r.error})`}`);
      }
    } catch (err) {
      done.push(`${c.name}: failed (${err instanceof Error ? err.message : "unknown"})`);
    }
  }
  if (due.length) {
    const sent = await submitReportBatch(due).catch(() => 0);
    if (sent) done.push(`reports: ${sent} sent as one batch`);
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
