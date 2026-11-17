/**
 * Read-only: exports ouhers' Output library (as the Railway app shows it) to JSON + CSV, so another app can import it.
 * `DATABASE_URL="file:./prisma/screens.db" npx tsx scripts/export-ouhers-library.ts <outDir>`
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { loadOutputLibrary } from "../src/lib/output-library";

const CLIENT = "client-ouhers";

async function main() {
  const out = process.argv[2];
  mkdirSync(out, { recursive: true });
  // The seed's "today": dates are shifted to it, so daysAgo lets an importer shift them to its own today.
  const seededAt = (await prisma.client.findUniqueOrThrow({ where: { id: CLIENT }, select: { updatedAt: true } })).updatedAt;
  const lib = await loadOutputLibrary(CLIENT, {}, seededAt);
  const assets = new Map((await prisma.asset.findMany({ where: { clientId: CLIENT }, include: { project: { select: { name: true, type: true } }, versions: { orderBy: { number: "desc" }, take: 1, select: { width: true, height: true, sentAt: true, posterKey: true } } } })).map((a) => [a.id, a]));
  const outputs = new Map((await prisma.skillOutput.findMany({ where: { clientId: CLIENT } })).map((o) => [o.id, o]));
  const rows = lib.items.map((i) => {
    const a = i.kind === "asset" ? assets.get(i.id) : undefined;
    const o = i.kind === "skill" ? outputs.get(i.id) : undefined;
    const files = ((a?.tags ?? {}) as { files?: string[] }).files ?? [];
    return {
      title: i.title,
      category: i.category,
      madeBy: i.madeBy === "skill" ? "A skill" : "Klingit team",
      source: i.source,
      projectType: a?.project.type ?? null,
      format: i.format,
      channel: i.channel,
      type: a?.type ?? (o?.mimeType?.startsWith("image/") ? "IMAGE" : "COPY"),
      status: a?.status ?? "SAVED",
      version: a?.version ?? null,
      width: a?.versions[0]?.width ?? null,
      height: a?.versions[0]?.height ?? null,
      date: i.date.toISOString().slice(0, 10),
      daysAgo: Math.round((seededAt.getTime() - i.date.getTime()) / 86400000),
      packFile: files.length ? files[files.length - 1] : null,
      thumbColor: files.length ? null : (a?.thumbnailColor ?? null),
      earlierVersions: files.slice(0, -1),
      text: o?.text ?? i.thumb.text ?? null,
      performance: i.metric?.label ?? null,
      howItDid: i.info.kind === "add" ? null : i.info.text,
      tags: i.tags,
    };
  });
  writeFileSync(path.join(out, "ouhers-output-library.json"), JSON.stringify(rows, null, 2));
  const cols = ["title", "category", "madeBy", "source", "format", "channel", "type", "status", "version", "width", "height", "daysAgo", "packFile", "thumbColor", "performance", "howItDid", "text"] as const;
  const esc = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  writeFileSync(path.join(out, "ouhers-output-library.csv"), [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n"));
  console.log(`${rows.length} items`, JSON.stringify(lib.categoryCounts));
}
main().finally(() => prisma.$disconnect());
