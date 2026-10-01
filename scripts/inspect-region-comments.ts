import { prisma } from "../src/lib/prisma";
async function main() {
  const comments = await prisma.comment.findMany({
    where: { asset: { name: "Story 9:16 — hero" } },
    orderBy: { createdAt: "asc" },
  });
  for (const c of comments) {
    console.log(`x=${c.xPercent} y=${c.yPercent} w=${c.widthPercent} h=${c.heightPercent} body="${c.body}"`);
  }
  console.log("Total:", comments.length);
}
main().finally(() => prisma.$disconnect());
