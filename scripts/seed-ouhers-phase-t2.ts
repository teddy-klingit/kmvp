/**
 * Adds only the Phase T2 demo data to the ouhers demo client (notes, profile, check-ins, 6 months of credit
 * history), on top of what's there: no users, passwords or other pages are touched. Refuses unless ouhers is a demo
 * client. npx tsx scripts/seed-ouhers-phase-t2.ts
 */
import { prisma } from "../src/lib/prisma";
import { OUHERS_CLIENT_ID } from "../src/lib/demo/ouhers";
import { seedPhaseT2 } from "../src/lib/demo/ouhers-phase-t2";

async function main() {
  const client = await prisma.client.findUnique({ where: { id: OUHERS_CLIENT_ID }, select: { name: true, isDemo: true } });
  if (!client) throw new Error("ouhers isn't in this database; run the full ouhers seed first.");
  if (!client.isDemo) throw new Error("ouhers isn't marked as a demo client; stopping.");
  const r = await seedPhaseT2({ clientId: OUHERS_CLIENT_ID, now: new Date() });
  console.log(`Phase T2 · client page · ${r.notes} notes, the profile, check-ins and 6 months of credits for ${client.name}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
