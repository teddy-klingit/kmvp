import { prisma } from "../src/lib/prisma";

async function main() {
  const res = await prisma.comment.deleteMany({ where: { body: "xxx" } });
  console.log("Deleted:", res.count);
}
main().finally(() => prisma.$disconnect());
