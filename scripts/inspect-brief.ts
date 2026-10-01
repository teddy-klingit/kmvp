import { prisma } from "../src/lib/prisma";

async function main() {
  const projects = await prisma.project.findMany({
    where: { client: { slug: "klarna" } },
    include: { brief: true },
    orderBy: { createdAt: "asc" },
  });
  for (const p of projects) {
    console.log(`\n=== ${p.name} [${p.status}] ===`);
    if (!p.brief) {
      console.log("  NO BRIEF ROW");
      continue;
    }
    const b = p.brief;
    console.log(`  status=${b.status} goals=${b.goals ? "SET" : "null"} rawIntake=${b.rawIntake ? "SET" : "null"} pendingQuestions=${b.pendingQuestions ? "SET" : "null"}`);
  }
}
main().finally(() => prisma.$disconnect());
