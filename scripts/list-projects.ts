import { prisma } from "../src/lib/prisma";

async function main() {
  const projects = await prisma.project.findMany({
    where: { client: { slug: "klarna" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, status: true, createdAt: true, dueDate: true, creditsQuoted: true },
  });
  for (const p of projects) {
    console.log(`${p.createdAt.toISOString()}  ${p.id}  [${p.status}]  ${p.name}  due=${p.dueDate?.toISOString().slice(0,10) ?? "-"}  credits=${p.creditsQuoted ?? "-"}`);
  }
  console.log("Total:", projects.length);
}
main().finally(() => prisma.$disconnect());
