import { prisma } from "../src/lib/prisma";

const KEEP = new Set([
  "cmt3ypa1y001gs9txixv4zoht", // Q3 App install campaign
  "cmt3ypa2b002cs9txbcoh7kc5", // Summer social pack
  "cmt3ypa2g0032s9txskxinc6w", // Autumn brand refresh
  "cmt3ypa2j003gs9txynwh12hc", // Spring product launch
  "cmt40ki6i0001s9nev2n7w44c", // Q4 holiday push
  "cmt70hpoe0001s98c13w7ok6i", // Board deck — Q3 investor update
]);

async function main() {
  const all = await prisma.project.findMany({
    where: { client: { slug: "klarna" } },
    select: { id: true, name: true },
  });
  const toDelete = all.filter((p) => !KEEP.has(p.id));

  for (const p of toDelete) {
    await prisma.project.delete({ where: { id: p.id } });
    console.log("Deleted:", p.name, p.id);
  }

  console.log(`\nDeleted ${toDelete.length}, kept ${all.length - toDelete.length}`);
}

main().finally(() => prisma.$disconnect());
