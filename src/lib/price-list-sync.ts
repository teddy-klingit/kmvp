import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

/**
 * The Price List's source: data/pricing/klingit-price-list-credits-2026.csv (exported from Klingit's
 * "WIP_Klingit_value_pricing" sheet). The migration seeded it; this re-syncs a database from the file: new items are
 * added, existing ones (by key) keep staff edits unless `overwrite`. Legacy items are hidden from clients.
 */
export const PRICE_LIST_CSV = path.join(process.cwd(), "data/pricing/klingit-price-list-credits-2026.csv");

export const priceListKey = (item: string) => item.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);

/** A small RFC 4180 reader: quoted fields may hold commas. */
export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])) as Record<string, string>);
}

export async function syncPriceListFromCsv(opts: { file?: string; overwrite?: boolean } = {}) {
  const rows = parseCsv(readFileSync(opts.file ?? PRICE_LIST_CSV, "utf8"));
  let added = 0;
  for (const [i, r] of rows.entries()) {
    const key = priceListKey(r.item);
    const data = {
      deliverableType: r.item,
      displayName: r.item,
      category: r.category || null,
      squad: r.squad || null,
      unit: r.unit || null,
      creditCost: r.credits === "" ? null : Number(r.credits),
      status: r.status || "fixed",
      monthly: r.unit === "per month",
      notes: r.notes || null,
      visibleToClients: r.status !== "legacy",
      sortOrder: i,
    };
    const existing = await prisma.priceListItem.findUnique({ where: { sourceKey: key } });
    if (!existing) {
      await prisma.priceListItem.create({ data: { ...data, sourceKey: key } });
      added++;
    } else if (opts.overwrite) await prisma.priceListItem.update({ where: { id: existing.id }, data });
  }
  return { rows: rows.length, added };
}
