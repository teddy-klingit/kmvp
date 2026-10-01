import { prisma } from "../src/lib/prisma";
async function main() {
  const res = await prisma.comment.deleteMany({
    where: { asset: { name: "Story 9:16 — hero" }, body: "" },
  });
  console.log("Deleted empty phantom pins:", res.count);
  const all = await prisma.comment.findMany({ where: { asset: { name: "Story 9:16 — hero" } } });
  console.log("Remaining:", all.length);
}
main().finally(() => prisma.$disconnect());
