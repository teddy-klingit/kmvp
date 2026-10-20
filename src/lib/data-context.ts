import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { loadRevenue } from "@/lib/revenue";
import { adCampaigns } from "@/lib/metrics";
import { outputNumbers } from "@/lib/output-library";
import { getSetting } from "@/lib/platform-settings";
import { confidenceFrom, type Confidence } from "@/lib/combined";
import { numbersIn, isGrounded } from "@/lib/insights/number-guard";

/**
 * Phase V: one context for the AI, per client: the data layer (aggregates only), the Planner, the Output library and
 * Brand OS. Never another client's rows (every read takes the client id; tested). The numbers in it are computed
 * here; a model only writes words around them, and anything it says is checked against this pool.
 */
export type DataContext = { lines: string[]; sources: string[]; size: string; pool: number[]; confidence: Confidence | null };

const DAYS = 90;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function clientDataContext(clientId: string, now = new Date()): Promise<DataContext> {
  const [client, revenue, campaigns, plan, work, measured, minimums, within] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true, brandSummary: true } }),
    loadRevenue(clientId, { days: DAYS, now }),
    adCampaigns(clientId, 30, now),
    prisma.clientCalendarItem.findMany({ where: { clientId, archivedAt: null, date: { gte: now, lte: new Date(now.getTime() + 60 * 86400000) } }, orderBy: { date: "asc" }, take: 12, select: { title: true, date: true, formats: true } }),
    outputNumbers(clientId, undefined, now),
    prisma.asset.findMany({ where: { clientId, performanceCtr: { not: null }, sentVersion: { not: null } }, select: { name: true, format: true, performanceCtr: true }, orderBy: { performanceCtr: "desc" }, take: 5 }),
    getSetting("confidenceMinimums"),
    getSetting("sourcesAgreeWithin"),
  ]);
  const lines: string[] = [];
  const sources = new Set<string>();
  const cur = revenue.currency;
  const r0 = (n: number) => Math.round(n);

  if (revenue.connected) {
    const t = revenue.tiles;
    revenue.based.forEach((s) => sources.add(s));
    lines.push(`REVENUE, last ${DAYS} days (shared credit, ${cur}):`);
    lines.push(`- Revenue from marketing ${r0(t.revenue.value)}${t.revenue.change !== null ? ` (${Math.round(t.revenue.change * 100)}% vs the previous ${DAYS} days)` : ""}; ad spend ${r0(t.roas.spend)}; return on ad spend ${t.roas.value?.toFixed(1) ?? "n/a"}`);
    if (t.perCustomer.online !== null) lines.push(`- Cost per new online customer ${r0(t.perCustomer.online)} (${r0(t.perCustomer.newOnline)} new customers)`);
    if (t.pipeline.openValue !== null) lines.push(`- Open pipeline ${r0(t.pipeline.openValue)} in ${t.pipeline.openDeals} open deals; ${r0(t.pipeline.won)} deals won`);
    for (const path of ["online", "retail"] as const) {
      const f = revenue.funnels[path];
      if (f.has) lines.push(`- ${path === "online" ? "Online" : "Retail"} funnel: ${f.steps.map((s) => `${s.label} ${r0(s.value)}${s.kept !== null ? ` (${s.kept.toFixed(1)}% kept)` : ""}`).join(", ")}; revenue ${r0(f.revenue)}`);
    }
    if (revenue.biggestDrop) lines.push(`- Biggest drop: ${revenue.biggestDrop.from} to ${revenue.biggestDrop.to} (${revenue.biggestDrop.path}) at ${revenue.biggestDrop.kept.toFixed(1)}% vs a usual ${revenue.biggestDrop.usual}%`);
    lines.push("- By channel: " + revenue.tables.channel.map((c) => `${c.name}: revenue ${r0(c.revenue)}${c.spend ? `, spend ${r0(c.spend)}, return ${c.return?.toFixed(1)}` : ""}${c.orders ? `, ${r0(c.orders)} orders` : ""}${c.deals ? `, ${r0(c.deals)} deals won` : ""}`).join("; "));
    if (revenue.blind.length) lines.push("- What we can't see: " + revenue.blind.map((b) => b.text).join(" "));
    lines.push("");
  } else {
    lines.push("REVENUE: no shop or CRM connected, so revenue, orders and deals can't be seen.", "");
  }

  if (campaigns.length) {
    campaigns.forEach((c) => sources.add(c.platform));
    lines.push("AD CAMPAIGNS, last 30 days:");
    campaigns.slice(0, 8).forEach((c) => lines.push(`- [${c.platform}] "${c.campaignName}": ${c.ctr}% CTR, ${c.impressions} impressions, ${c.clicks} clicks, ${c.spend} ${c.currency} spent`));
    lines.push("");
  }

  if (plan.length) {
    sources.add("Planner");
    lines.push("PLANNER, next 60 days:");
    plan.forEach((p) => lines.push(`- ${iso(p.date)} ${p.title}${jsonArray<string>(p.formats).length ? `: ${jsonArray<string>(p.formats).join(", ")}` : ""}`));
    lines.push("");
  }

  const top = [...work.entries()].filter(([, w]) => w.revenue > 0).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
  if (top.length || measured.length) {
    sources.add("Output library");
    const names = new Map((await prisma.asset.findMany({ where: { clientId, id: { in: top.map(([id]) => id) } }, select: { id: true, name: true } })).map((a) => [a.id, a.name]));
    lines.push("OUTPUT LIBRARY:");
    top.forEach(([id, w]) => lines.push(`- "${names.get(id) ?? "a piece"}": revenue ${r0(w.revenue)}${w.orders ? `, ${r0(w.orders)} orders` : ""}${w.won ? `, ${r0(w.won)} deals won` : ""}`));
    measured.forEach((m) => lines.push(`- "${m.name}" (${m.format}): ${m.performanceCtr}% CTR`));
    lines.push("");
  }

  if (client.brandSummary) lines.push(`BRAND OS: ${client.brandSummary}`, "");

  // How much data is behind it, and how far to trust it (rules, not the model).
  const orders = revenue.funnels.online.steps[3]?.value ?? 0;
  const deals = revenue.funnels.retail.steps[2]?.value ?? 0;
  const enough = orders >= minimums.orders || deals >= minimums.deals;
  const metaOrders = revenue.connected ? (await prisma.metricDaily.aggregate({ where: { clientId, source: "Meta", metric: "conversions", date: { gte: iso(new Date(now.getTime() - (DAYS - 1) * 86400000)) } }, _sum: { value: true } }))._sum.value : null;
  const shopifyMeta = revenue.tables.channel.find((c) => c.name === "Meta")?.orders ?? null;
  const agree = metaOrders && shopifyMeta ? Math.abs(metaOrders - shopifyMeta) / shopifyMeta <= within : null;
  let holds: boolean | null = null;
  if (revenue.connected) {
    const [first, last] = await Promise.all([loadRevenue(clientId, { days: DAYS, now, model: "first" }), loadRevenue(clientId, { days: DAYS, now, model: "last" })]);
    const topOf = (x: typeof first) => x.tables.channel.filter((c) => c.name !== "Unattributed")[0]?.name ?? null;
    holds = topOf(first) !== null && topOf(first) === topOf(last) ? true : topOf(first) === null ? null : false;
  }
  const size = [orders ? `${Math.round(orders).toLocaleString("en-GB")} orders` : null, deals ? `${Math.round(deals)} deals` : null, campaigns.length ? `${campaigns.length} ad campaigns` : null].filter(Boolean).join(" · ") + (revenue.connected ? ` · ${DAYS} days` : campaigns.length ? " · 30 days" : "");
  const text = lines.join("\n");
  return { lines, sources: [...sources], size: size || "No numbers yet", pool: numbersIn(text), confidence: confidenceFrom({ enough, agree, holds }) };
}

/**
 * Keeps only the sentences whose every number is in the data (or a ratio / % change between two of its numbers).
 * Returns the cleaned text and whether anything was dropped.
 */
export function groundedText(text: string, pool: number[]) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => numbersIn(s).every((n) => isGrounded(n, pool)));
  return { text: kept.join(" ").trim(), dropped: kept.length < sentences.length };
}
