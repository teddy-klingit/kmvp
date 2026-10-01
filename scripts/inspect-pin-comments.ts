import { prisma } from "../src/lib/prisma";

async function main() {
  const comments = await prisma.comment.findMany({
    where: { project: { id: "cmt3ypa2b002cs9txbcoh7kc5" } },
    include: { asset: true, clientAuthor: { include: { user: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const c of comments) {
    console.log(
      `${c.createdAt.toISOString()}  asset=${c.asset?.name ?? "-"}  x=${c.xPercent}  y=${c.yPercent}  by=${c.clientAuthor?.user.name}  body="${c.body}"`
    );
  }
}
main().finally(() => prisma.$disconnect());
