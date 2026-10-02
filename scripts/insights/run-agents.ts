/**
 * Runs the Insights agents for one client now, the same code the Generate / Run audit buttons call:
 *   npx tsx scripts/insights/run-agents.ts Klarna                      # performance, market, seo
 *   npx tsx scripts/insights/run-agents.ts Klarna market seo           # just these
 */
import { prisma } from "../../src/lib/prisma";
import { generatePerformanceBrief } from "../../src/lib/insights-brief";
import { runMarketIntelligence } from "../../src/lib/market-intelligence-run";
import { runSeoAudit } from "../../src/lib/seo-audit-run";

async function main() {
  const [name, ...which] = process.argv.slice(2);
  if (!name) throw new Error("Usage: run-agents.ts <client name> [performance] [market] [seo]");
  const client = await prisma.client.findFirstOrThrow({ where: { name } });
  const run = which.length ? which : ["performance", "market", "seo"];
  for (const agent of run) {
    const started = Date.now();
    let error: string | null;
    if (agent === "performance") {
      const r = await generatePerformanceBrief(client.id);
      error = r.ok ? null : r.error;
    } else if (agent === "market") error = (await runMarketIntelligence(client)).error;
    else if (agent === "seo") error = (await runSeoAudit(client)).error;
    else error = `unknown agent ${agent}`;
    console.log(`${client.name} · ${agent}: ${error ? `failed (${error})` : "done"} in ${Math.round((Date.now() - started) / 1000)}s`);
  }
}
main().finally(() => prisma.$disconnect());
