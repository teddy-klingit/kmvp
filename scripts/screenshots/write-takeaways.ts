/**
 * Has the performance agent write this week's takeaways for the demo clients, exactly as a page load
 * would (real agent call, real data in the target DB). Screenshot runs freeze page-load agents
 * (INSIGHTS_AGENT_ON_PAGE_LOAD=0), so run this first:
 *   DATABASE_URL=file:./prisma/screens.db npx tsx --env-file=.env scripts/screenshots/write-takeaways.ts [--suggestions]
 * --suggestions also has the content plan agent write dated calendar suggestions.
 */
import { prisma } from "../../src/lib/prisma";
import { generatePerformanceBrief } from "../../src/lib/insights-brief";
import { writePlanSuggestions } from "../../src/lib/content-plan-suggestions";

const args = process.argv.slice(2);

async function main() {
  const clients = await prisma.client.findMany({ where: { name: { in: ["Klarna"] } }, select: { id: true, name: true } });
  for (const c of clients) {
    const r = args.includes("--skip-brief") ? { ok: true as const } : await generatePerformanceBrief(c.id);
    const brief = await prisma.performanceBrief.findUnique({ where: { clientId: c.id } });
    console.log(c.name, r.ok ? "ok" : r.error);
    console.log(JSON.stringify(brief?.takeaways, null, 2));
    if (args.includes("--suggestions")) {
      const s = await writePlanSuggestions({ clientId: c.id, client: { name: c.name } });
      const rows = await prisma.contentPlanSuggestion.findMany({ where: { clientId: c.id, status: "PENDING" } });
      console.log("suggestions", s.error ?? "ok", rows.map((r) => [r.title, r.proposedDate?.toISOString().slice(0, 10), r.reason]));
    }
  }
}

main().finally(() => prisma.$disconnect());
