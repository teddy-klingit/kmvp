/**
 * Seeds the ouhers demo client (prisma/demo/ouhers): `npm run seed:ouhers`. Replaces only that client.
 *   SEED_SHIFT=0 keeps the pack's own dates (today = 2026-10-06); by default every date moves so that day is today.
 *   DEMO_PASSWORD sets the shared password of the demo client users (default: the app's demo password).
 */
import { prisma } from "../src/lib/prisma";
import { seedOuhers } from "../src/lib/demo/ouhers";

async function main() {
  const report = await seedOuhers({ shift: process.env.SEED_SHIFT !== "0", log: (s) => console.log(s) });
  const off = report.checks.filter((c) => !c.match).length;
  console.log(`Done. ${report.checks.length - off} of ${report.checks.length} computed values match the pack's notes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
