import { prisma } from "../src/lib/prisma";
async function main() {
  const assets = await prisma.asset.findMany({ include: { project: true } });
  console.log(assets.map(a => ({ id: a.id, name: a.name, format: a.format, project: a.project.name, ctr: a.performanceCtr })));
}
main().finally(() => prisma.$disconnect());
