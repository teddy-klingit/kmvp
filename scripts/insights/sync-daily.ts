/**
 * Fetches and stores real per-day ad metrics (AdDailyMetric) for every live client, now (the scheduler does it every
 * 6 hours anyway). Run on deploy to backfill the last 90 days:
 *   npx tsx scripts/insights/sync-daily.ts            # every eligible client
 *   npx tsx scripts/insights/sync-daily.ts Klarna     # one client by name
 */
import { prisma } from "../../src/lib/prisma";
import { syncDailyAdMetrics } from "../../src/lib/integrations/ad-daily";

async function main() {
  const name = process.argv[2];
  const clients = await prisma.client.findMany({ where: { isSampleAccount: false, paidMediaInScope: true, ...(name ? { name } : {}) }, select: { id: true, name: true } });
  for (const c of clients) {
    const r = await syncDailyAdMetrics(c.id, { force: true });
    const rows = await prisma.adDailyMetric.count({ where: { clientId: c.id } });
    console.log(`${c.name}: ${r.synced.join(", ") || `nothing (${r.skipped ?? "no platform answered"})`} · ${rows} daily rows`);
  }
}
main().finally(() => prisma.$disconnect());
