/**
 * A small Klarna content plan for screenshot runs (the base seed has none): SOW volume targets
 * (Instagram 2 a week + LinkedIn 1 a week = 12 a month), three planned posts and one own item this month.
 * Idempotent. The agent's suggestions are written separately by write-takeaways.ts (a real agent run).
 *
 *   DATABASE_URL="file:./prisma/screens.db" npx tsx scripts/screenshots/seed-content-plan.ts
 */
import { PrismaClient } from "../../src/generated/prisma";

export async function seedContentPlan(prisma: PrismaClient) {
  const klarna = await prisma.client.findFirstOrThrow({ where: { name: "Klarna" } });
  if (await prisma.contentPlanTarget.count({ where: { clientId: klarna.id } })) return;
  const at = (days: number) => {
    const d = new Date(Date.now() + days * 86400000);
    d.setHours(10, 0, 0, 0);
    return d;
  };
  await prisma.contentPlanTarget.createMany({
    data: [
      { clientId: klarna.id, platform: "Instagram", weeklyVolume: 2 },
      { clientId: klarna.id, platform: "LinkedIn", weeklyVolume: 1 },
    ],
  });
  await prisma.contentPost.createMany({
    data: [
      { clientId: klarna.id, platform: "LinkedIn", channelType: "ORGANIC", contentType: "Feed post", title: "LinkedIn post", status: "PLANNED", scheduledDate: at(5) },
      { clientId: klarna.id, platform: "Instagram", channelType: "ORGANIC", contentType: "Reel", title: "Instagram reel", status: "PLANNED", scheduledDate: at(19) },
      { clientId: klarna.id, platform: "LinkedIn", channelType: "ORGANIC", contentType: "Feed post", title: "Customer story", status: "PLANNED", scheduledDate: at(23) },
    ],
  });
  await prisma.clientCalendarItem.create({ data: { clientId: klarna.id, title: "Newsletter", date: at(12), channel: "Email" } });
}

if (require.main === module) {
  if (!process.env.DATABASE_URL?.includes("screens.db")) throw new Error("Refusing to run: point DATABASE_URL at the local screens.db screenshot database.");
  const prisma = new PrismaClient();
  seedContentPlan(prisma).finally(() => prisma.$disconnect());
}
