import { prisma } from "@/lib/prisma";
import { adPlatformOf, changePct, loadLayer, type LayerRow } from "@/lib/insights/layer";

/**
 * Insights → Website & search (Phase X v2, design Ins4Website): do people find the client, and does the site turn
 * visits into sales. Visits and funnel steps from GA4 in the data layer, orders from the shop (same credit rule as
 * Sales), Google rankings for tracked keywords, page-level buy rates. Only the client's own site: how it compares
 * with competitors is on Competitors.
 */
export type TrafficGroup = "Google (organic)" | "Paid ads" | "Email" | "Instagram" | "TikTok" | "LinkedIn" | "AI assistants" | "Direct" | "Other";

export function trafficGroupOf(channel: string): TrafficGroup {
  if (/ai assistant|chatgpt|perplexity|claude|gemini|copilot/i.test(channel)) return "AI assistants";
  if (adPlatformOf(channel)) return "Paid ads";
  if (/google.*organic|organic search|^search|seo/i.test(channel)) return "Google (organic)";
  if (/klaviyo|email|newsletter/i.test(channel)) return "Email";
  if (/instagram/i.test(channel)) return "Instagram";
  if (/tiktok/i.test(channel)) return "TikTok";
  if (/linkedin/i.test(channel)) return "LinkedIn";
  if (/direct|unattributed/i.test(channel)) return "Direct";
  return "Other";
}

const online = (r: LayerRow) => r.path === "online";

export async function loadWebsiteTab(clientId: string, opts: { days: number; now?: Date }) {
  const L = await loadLayer(clientId, { days: opts.days, now: opts.now });
  const { cur, prev, sum } = L;
  const site = (r: LayerRow) => r.source === "GA4";
  const sessions = (xs: LayerRow[], where: (r: LayerRow) => boolean = () => true) => sum(xs, "sessions", (r) => site(r) && where(r));
  const orders = (xs: LayerRow[], where: (r: LayerRow) => boolean = () => true) => sum(xs, "orders", (r) => online(r) && where(r));
  const group = (g: TrafficGroup) => (r: LayerRow) => trafficGroupOf(r.channel) === g;
  const buyRate = (xs: LayerRow[]) => (sessions(xs) ? (orders(xs) / sessions(xs)) * 100 : null);
  const slices = L.slices();

  const visits = sessions(cur);
  const hasVisits = visits > 0;
  const numbers = {
    visits: { value: visits, change: L.coversPrev ? changePct(visits, sessions(prev)) : null, spark: slices.map((xs) => sessions(xs)) },
    buyRate: { value: buyRate(cur), previous: L.coversPrev ? buyRate(prev) : null, spark: slices.map((xs) => buyRate(xs) ?? 0) },
    google: { value: sessions(cur, group("Google (organic)")), change: L.coversPrev ? changePct(sessions(cur, group("Google (organic)")), sessions(prev, group("Google (organic)"))) : null, spark: slices.map((xs) => sessions(xs, group("Google (organic)"))) },
    ai: { value: sessions(cur, group("AI assistants")), change: L.coversPrev ? changePct(sessions(cur, group("AI assistants")), sessions(prev, group("AI assistants"))) : null, spark: slices.map((xs) => sessions(xs, group("AI assistants"))) },
  };

  // Where visitors drop off: visits → product page → cart → order. The biggest drop is the step that keeps the least.
  const steps = [
    { label: "Visited", value: visits },
    { label: "Viewed a product", value: sum(cur, "product_views", site) },
    { label: "Added to cart", value: sum(cur, "add_to_cart", site) },
    { label: "Bought", value: orders(cur) },
  ];
  const funnel = steps[1].value && steps[2].value ? steps.map((s, i) => ({ ...s, kept: i === 0 || !steps[i - 1].value ? null : s.value / steps[i - 1].value })) : null;
  const biggestDrop = funnel ? funnel.slice(1).reduce<{ from: string; to: string; kept: number } | null>((w, s, i) => (s.kept !== null && (!w || s.kept < w.kept) ? { from: funnel[i].label, to: s.label, kept: s.kept } : w), null) : null;

  // Where visitors come from, with each source's buy rate (orders credited to that channel ÷ its visits).
  const groups = [...new Set(cur.filter((r) => site(r) && r.metric === "sessions").map((r) => trafficGroupOf(r.channel)))];
  const sources = groups
    .map((g) => {
      const v = sessions(cur, group(g));
      const o = orders(cur, group(g));
      return { group: g, visits: v, buyRate: v ? (o / v) * 100 : null };
    })
    .filter((s) => s.visits > 0)
    .sort((a, b) => b.visits - a.visits);

  // Pages that sell: page-level visits and orders.
  const pageRows = L.pageRows;
  const pages = [...new Set(pageRows.map((r) => r.page))]
    .map((page) => {
      const v = pageRows.filter((r) => r.page === page && r.metric === "sessions").reduce((a, r) => a + r.value, 0);
      const o = pageRows.filter((r) => r.page === page && r.metric === "orders").reduce((a, r) => a + r.value * L.weight(r), 0);
      return { page, visits: v, buyRate: v ? (o / v) * 100 : null };
    })
    .filter((p) => p.visits > 0)
    .sort((a, b) => b.visits - a.visits);

  // Google rankings: the latest check per keyword.
  const rankingRows = await prisma.searchRanking.findMany({ where: { clientId }, orderBy: { capturedAt: "desc" }, take: 400 });
  // Oldest first, so each keyword's newest check overwrites its older ones.
  const rankings = [...new Map([...rankingRows].reverse().map((r) => [r.keyword.toLowerCase(), r])).values()];

  const [audit, ga4] = await Promise.all([
    prisma.siteAudit.findFirst({ where: { clientId, subject: "Own site" } }),
    prisma.dataSource.findUnique({ where: { clientId_source: { clientId, source: "GA4" } }, select: { status: true, updatedAt: true } }),
  ]);

  return { currency: L.currency, hasVisits, numbers, funnel, biggestDrop, sources, pages, rankings, audit, ga4, overallBuyRate: numbers.buyRate.value };
}
export type WebsiteTab = Awaited<ReturnType<typeof loadWebsiteTab>>;
