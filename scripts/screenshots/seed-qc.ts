/**
 * Demo data for the quality check screenshots (screens DB only):
 *   npx tsx scripts/screenshots/seed-qc.ts upload <dir>   # Sara uploads <concept>-<size>.png to the Q3 project; the real check runs
 *   npx tsx scripts/screenshots/seed-qc.ts send           # Teddy accepts what's open (with a reason) and sends the set to the client
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../src/lib/prisma";
import { saveUpload } from "../../src/lib/uploads";
import { acceptFlag, addAssetVersion, blockingFlags, loadQcSet, sendToClient } from "../../src/lib/qc/quality-check";
import { runBrandCheck } from "../../src/lib/qc/brand-check";

const FORMAT: Record<string, string> = { "9x16": "Story 9:16", "4x5": "Feed 4:5", "1x1": "Static 1:1", "191x1": "Link ad 1.91:1" };
const title = (slug: string) => slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

async function main() {
  const [mode, dir] = process.argv.slice(2);
  const project = await prisma.project.findFirstOrThrow({ where: { name: "Q3 App install campaign" } });
  if (mode === "upload") {
    const sara = await prisma.user.findUniqueOrThrow({ where: { email: "sara.n@klingit.com" } });
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".png")).sort()) {
      const [, concept, size] = file.match(/^(.+)-(\d+x\d+)\.png$/)!;
      const name = title(concept);
      const format = FORMAT[size];
      const existing = await prisma.asset.findFirst({ where: { projectId: project.id, name, format, status: { not: "ARCHIVED" } } });
      const data = readFileSync(path.join(dir, file));
      const saved = await saveUpload(project.id, new File([data], file, { type: "image/png" }));
      const v = await addAssetVersion({ projectId: project.id, clientId: project.clientId, assetId: existing?.id ?? null, name, format, file: saved, uploadedByUserId: sara.id });
      await runBrandCheck(v!.id);
      const done = await prisma.assetVersion.findUniqueOrThrow({ where: { id: v!.id }, include: { flags: true } });
      console.log(`${name} ${format} v${done.number}: ${done.flags.map((f) => f.label).join(", ") || "passed"}`);
    }
  } else if (mode === "send") {
    const teddy = await prisma.user.findUniqueOrThrow({ where: { email: "teddy@klingit.com" } });
    for (const v of await loadQcSet(project.id)) for (const f of blockingFlags(v)) await acceptFlag(f.id, teddy.id, "Fine for this round, fixed in the next version");
    console.log(await sendToClient(project.id, teddy.id));
  }
}
main().finally(() => prisma.$disconnect());
