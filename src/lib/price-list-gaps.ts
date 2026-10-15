import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";

/**
 * Price List gaps (Phase T, Admin → To set up): this month's quotes for work that isn't on the Price List (items an
 * estimate couldn't match, and custom PM-quoted lines), grouped by simple word overlap (no AI). A group asked for
 * more than once is a suggested new item; "Add N items" makes drafts with the credits left blank.
 */

const STOP = new Set(["a", "an", "and", "the", "for", "of", "per", "x", "with", "to", "in", "on", "by", "from", "our", "your", "new", "set", "up", "variant", "variants", "option", "options"]);
const words = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-zåäöæø\s/-]/g, " ")
      .split(/[\s/-]+/)
      .map((w) => w.replace(/(ies)$/, "y").replace(/s$/, ""))
      .filter((w) => w.length > 1 && !STOP.has(w))
  );
// Two words match when they're equal or one starts the other ("copy" / "copywriting").
const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
const overlap = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((w) => [...b].some((x) => same(w, x))).length;
  return inter / Math.max(1, Math.min(a.size, b.size));
};

export type Gap = { name: string; count: number; examples: string[] };

export async function priceListGaps(now = new Date()) {
  const since = new Date(now.getFullYear(), now.getMonth(), 1);
  const [estimates, custom, items] = await Promise.all([
    prisma.estimate.findMany({ where: { OR: [{ createdAt: { gte: since } }, { sentAt: { gte: since } }], project: { client: { isDemo: false } } }, select: { unresolvedNeeds: true } }),
    prisma.estimateLineItem.findMany({ where: { isCustom: true, estimate: { OR: [{ createdAt: { gte: since } }, { sentAt: { gte: since } }], project: { client: { isDemo: false } } } }, select: { deliverable: true } }),
    prisma.priceListItem.findMany({ where: { archivedAt: null }, select: { deliverableType: true, displayName: true } }),
  ]);
  const quotes = [...estimates.flatMap((e) => jsonArray<{ description: string }>(e.unresolvedNeeds).map((n) => n.description)), ...custom.map((c) => c.deliverable)].filter(Boolean);
  const groups: { key: Set<string>; texts: string[] }[] = [];
  for (const q of quotes) {
    const w = words(q);
    if (!w.size) continue;
    const g = groups.find((x) => overlap(x.key, w) >= 0.5);
    if (g) {
      g.texts.push(q);
      for (const x of w) g.key.add(x);
    } else groups.push({ key: w, texts: [q] });
  }
  const existing = items.map((i) => words(i.displayName ?? i.deliverableType));
  const gaps: Gap[] = groups
    // A group that matches an item already on the list (e.g. a draft added earlier) isn't a gap any more.
    .filter((g) => {
      // Covered when an item has most of the words of the request itself (not just a shared word like "Meta").
      const ask = words([...g.texts].sort((x, y) => x.length - y.length)[0]);
      return !existing.some((e) => e.size && [...ask].filter((w) => [...e].some((x) => same(w, x))).length / Math.max(1, ask.size) >= 0.8);
    })
    .map((g) => {
      const name = [...g.texts].sort((a, b) => a.length - b.length)[0].replace(/\s*\([^)]*\)\s*/g, " ").trim();
      return { name: name.charAt(0).toUpperCase() + name.slice(1), count: g.texts.length, examples: [...new Set(g.texts)].slice(0, 4) };
    })
    .sort((a, b) => b.count - a.count);
  return { total: quotes.length, gaps, repeated: gaps.filter((g) => g.count >= 2) };
}
