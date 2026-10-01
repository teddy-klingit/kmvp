import { prisma } from "../src/lib/prisma";

async function main() {
  const summer = await prisma.project.findFirstOrThrow({ where: { name: "Summer social pack" } });
  const spring = await prisma.project.findFirstOrThrow({ where: { name: "Spring product launch" } });

  await prisma.brief.update({
    where: { projectId: summer.id },
    data: {
      goals: "A lightweight summer social pack to keep Klarna visible through the quiet summer months — stories, a carousel, and static posts built around lifestyle moments.",
      targetAudience: "Existing Klarna app users across Sweden and Norway, 22-38, mobile-first shoppers.",
      successMetrics: "CTR > 4%, at least 3 of 6 assets rated top-performer by end of campaign.",
      references: "Previous spring campaign key visuals; Klarna Instagram grid for tone consistency.",
      status: "ACCEPTED",
      submittedAt: new Date("2026-08-05T09:00:00Z"),
      acceptedAt: new Date("2026-08-06T10:00:00Z"),
    },
  });

  await prisma.brief.update({
    where: { projectId: spring.id },
    data: {
      goals: "Launch push for the spring product line — hero visuals and a short cutdown to drive awareness ahead of the seasonal sale window.",
      targetAudience: "Fashion and lifestyle shoppers, 20-35, previously engaged with Klarna seasonal campaigns.",
      successMetrics: "CPI < EUR 2.50, campaign delivered ahead of the spring sale start date.",
      references: "Brand Kit spring palette; prior seasonal launch assets for pacing reference.",
      status: "ACCEPTED",
      submittedAt: new Date("2026-05-20T09:00:00Z"),
      acceptedAt: new Date("2026-05-21T10:00:00Z"),
    },
  });

  console.log("Backfilled briefs for Summer social pack and Spring product launch");
}

main().finally(() => prisma.$disconnect());
