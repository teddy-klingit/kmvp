/**
 * One agent build under way for Klarna (screenshot database only), so "Being built for you" has something to show:
 * "Seasonal content agent", staffed, its first test version due in two business days. Idempotent.
 *
 *   DATABASE_URL="file:./prisma/screens.db" npx tsx scripts/screenshots/seed-agent-build.ts
 */
import { PrismaClient } from "../../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const klarna = await prisma.client.findFirstOrThrow({ where: { name: "Klarna" } });
  if (await prisma.project.count({ where: { clientId: klarna.id, agentBuild: true } })) return console.log("Already there.");
  const now = new Date();
  const p = await prisma.project.create({
    data: { clientId: klarna.id, name: "Seasonal content agent", type: "OTHER", status: "IN_PRODUCTION", agentBuild: true, startedAt: now, activatedAt: now },
  });
  await prisma.brief.create({ data: { projectId: p.id, status: "ACCEPTED", rawIntake: "Drafts seasonal briefs 6 weeks ahead.", acceptedAt: now } });
  await prisma.estimate.create({ data: { projectId: p.id, status: "APPROVED", totalCredits: 24, sentAt: now, respondedAt: now } });
  await prisma.team.create({ data: { projectId: p.id, confirmed: true, confirmedAt: now } });
  console.log("Seeded the Seasonal content agent build.");
}
main().finally(() => prisma.$disconnect());
