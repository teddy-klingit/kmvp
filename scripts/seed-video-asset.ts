import { prisma } from "../src/lib/prisma";

async function main() {
  const project = await prisma.project.findFirstOrThrow({ where: { name: "Q3 App install campaign" } });

  const video = await prisma.asset.create({
    data: {
      projectId: project.id,
      clientId: project.clientId,
      name: "App install — hero cutdown",
      format: "Story 9:16",
      platform: "TikTok",
      type: "VIDEO",
      thumbnailColor: "var(--avatar-5)",
      status: "IN_REVIEW",
      durationSeconds: 24,
    },
  });

  const client = await prisma.clientUser.findFirstOrThrow({ where: { user: { email: "jack.ross@klarna.com" } } });

  await prisma.comment.createMany({
    data: [
      {
        projectId: project.id,
        assetId: video.id,
        authorClientUserId: client.id,
        body: "Can we hold on the logo a beat longer here?",
        timestampSeconds: 4.5,
      },
      {
        projectId: project.id,
        assetId: video.id,
        authorClientUserId: client.id,
        body: "The CTA text feels a little small on mobile.",
        timestampSeconds: 18,
      },
    ],
  });

  console.log("Seeded video asset with timestamp comments:", video.id);
}

main().finally(() => prisma.$disconnect());
