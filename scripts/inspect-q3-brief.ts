import { prisma } from "../src/lib/prisma";

async function main() {
  const project = await prisma.project.findFirstOrThrow({ where: { name: "Q3 App install campaign" }, include: { brief: { include: { revisions: true } } } });
  console.log("Current:", JSON.stringify({ goals: project.brief?.goals, targetAudience: project.brief?.targetAudience, successMetrics: project.brief?.successMetrics, references: project.brief?.references }, null, 2));
  console.log("Revisions:", JSON.stringify(project.brief?.revisions, null, 2));
}
main().finally(() => prisma.$disconnect());
