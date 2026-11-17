/**
 * Adds only the Phase X Insights data to the ouhers demo client, on top of what's there: no users, passwords or
 * other pages are touched, so logins and anyone's changes elsewhere stay. Run once after the full ouhers seed:
 *   npx tsx scripts/seed-ouhers-phase-x.ts
 * Refuses unless ouhers is a demo client.
 */
import { prisma } from "../src/lib/prisma";
import { OUHERS_CLIENT_ID } from "../src/lib/demo/ouhers";
import { seedPhaseX } from "../src/lib/demo/ouhers-phase-x";

async function main() {
  const client = await prisma.client.findUnique({ where: { id: OUHERS_CLIENT_ID }, select: { name: true, isDemo: true } });
  if (!client) throw new Error("ouhers isn't in this database; run the full ouhers seed first.");
  if (!client.isDemo) throw new Error("ouhers isn't marked as a demo client; stopping.");
  const teddy = await prisma.user.findFirst({ where: { email: { startsWith: "teddy@" } }, select: { id: true } });
  const d = new Date();
  const now = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10));
  const n = await seedPhaseX({ clientId: OUHERS_CLIENT_ID, now, teddyUserId: teddy?.id ?? null });
  console.log(`Phase X · insights · ${n} numbers for ${client.name}, today ${now.toISOString().slice(0, 10)}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
