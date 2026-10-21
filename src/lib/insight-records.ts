import type { Insight, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { loadMeasuredAssets } from "@/lib/insights-data";
import { loadDaily } from "@/lib/insights/daily";
import { loadRevenue } from "@/lib/revenue";

/**
 * Phase W: findings as records. Each one is a number computed in code (the data layer, the Market feed, key moments,
 * the Planner), with what it compares, its period, sources and a mini chart. Insights Overview shows them as "What we
 * found", and an opportunity is built from them: Opportunity ↔ Insight is many-to-many, and an opportunity without a
 * linked insight never reaches the client.
 *
 * A finding has a stable key per client, so a refresh updates it instead of repeating it; one that's no longer true
 * is archived (kept, and still shown on the opportunities that used it). Every read here is scoped to one client.
 */

const DAY = 86400000;
const CRMS = ["HubSpot", "Salesforce", "Pipedrive", "Microsoft Dynamics 365"];
const SHOPS = ["Shopify"];

export type InsightKind = "data" | "market" | "moment" | "plan";
export type InsightChart = { bars: { label: string; value: number; highlight?: boolean }[] };
export type InsightInput = {
  key: string;
  kind: InsightKind;
  title: string;
  value: string;
  comparison?: string | null;
  period?: string | null;
  sources: string[];
  dataSize?: string | null;
  chart?: InsightChart | null;
  href?: string | null;
  origin?: string;
  foundAt?: Date;
};

export const insightSources = (i: Pick<Insight, "sources">) => jsonArray<string>(i.sources);
export const insightChart = (i: Pick<Insight, "chart">): InsightChart | null => {
  const c = i.chart as InsightChart | null;
  return c && Array.isArray(c.bars) && c.bars.length ? c : null;
};

/** Create or update one finding by its key. A changed number counts as found again (today). */
export async function upsertInsight(clientId: string, input: InsightInput, opts: { isDemo?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const data = {
    kind: input.kind,
    title: input.title,
    value: input.value,
    comparison: input.comparison ?? null,
    period: input.period ?? null,
    sources: input.sources as Prisma.InputJsonValue,
    dataSize: input.dataSize ?? null,
    chart: (input.chart ?? undefined) as Prisma.InputJsonValue | undefined,
    href: input.href ?? null,
    origin: input.origin ?? "detector",
    status: "active",
  };
  const existing = await prisma.insight.findUnique({ where: { clientId_key: { clientId, key: input.key } } });
  if (existing) return prisma.insight.update({ where: { id: existing.id }, data: { ...data, ...(existing.value !== input.value || existing.status !== "active" ? { foundAt: input.foundAt ?? now } : {}) } });
  return prisma.insight.create({ data: { clientId, key: input.key, ...data, isDemo: Boolean(opts.isDemo), foundAt: input.foundAt ?? now } });
}

/** Link insights to an opportunity, in order (only the opportunity's own client's insights). */
export async function linkInsights(clientId: string, opportunityId: string, insightIds: string[]) {
  const own = await prisma.insight.findMany({ where: { clientId, id: { in: insightIds } }, select: { id: true } });
  const ok = new Set(own.map((i) => i.id));
  const ids = [...new Set(insightIds)].filter((id) => ok.has(id));
  for (const [i, insightId] of ids.entries())
    await prisma.opportunityInsight.upsert({ where: { opportunityId_insightId: { opportunityId, insightId } }, create: { opportunityId, insightId, sortOrder: i }, update: { sortOrder: i } });
  return ids.length;
}

/** The insights an opportunity is built from, in order. */
export async function insightsOf(clientId: string, opportunityId: string) {
  const links = await prisma.opportunityInsight.findMany({ where: { opportunityId, insight: { clientId }, opportunity: { clientId } }, include: { insight: true }, orderBy: { sortOrder: "asc" } });
  return links.map((l) => l.insight);
}

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;
const sym = (c: string) => (c === "EUR" ? "€" : c === "USD" ? "$" : c === "GBP" ? "£" : `${c} `);
const money = (n: number, c: string) => (Math.abs(n) >= 1000 ? `${sym(c)}${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${sym(c)}${Math.round(n)}`);

/**
 * What the client's own data says right now, as findings. Only numbers that exist; a detector without data finds
 * nothing. Demo clients are seeded and never refreshed here.
 */
export async function detectInsights(clientId: string, now = new Date()): Promise<InsightInput[]> {
  const [moments, { measured }, daily, signals, revenue] = await Promise.all([
    prisma.keyMoment.findMany({ where: { date: { gte: now, lt: new Date(now.getTime() + 70 * DAY) } }, orderBy: { date: "asc" } }),
    loadMeasuredAssets(clientId),
    loadDaily(clientId, 30).catch(() => ({ campaigns: [] as { platform: string; name: string; ctrLast7: number | null; ctrTrailing: number | null }[] })),
    prisma.marketSignal.findMany({ where: { clientId, archivedAt: null, publishedAt: { gte: new Date(now.getTime() - 45 * DAY) } }, orderBy: { publishedAt: "desc" }, take: 15 }),
    loadRevenue(clientId, { days: 90, now }).catch(() => null),
  ]);
  const out: InsightInput[] = [];

  // Key moments ahead (Planner context, not an Insights card).
  for (const m of moments) out.push({ key: `moment:${m.id}`, kind: "moment", title: m.name, value: day(m.date), comparison: jsonArray<string>(m.markets).join(", ") || null, sources: ["Key moments"], href: "/planner", origin: "moment" });

  // CTR by delivered format, against the client's average.
  const avg = measured.length ? measured.reduce((a, m) => a + m.ctr, 0) / measured.length : null;
  const byFormat = new Map<string, number[]>();
  for (const a of measured) byFormat.set(a.format, [...(byFormat.get(a.format) ?? []), a.ctr]);
  if (avg && byFormat.size > 1) {
    const rows = [...byFormat].map(([f, v]) => ({ f, n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => b.mean - a.mean);
    const top = rows[0];
    if (top.mean / avg >= 1.2)
      out.push({
        key: `ctr-format:${top.f.toLowerCase()}`,
        kind: "data",
        title: `${top.f} beats your other formats`,
        value: `${pct1(top.mean)} vs ${pct1(avg)}`,
        comparison: `Average click-through, ${top.f} vs all your measured work`,
        period: "delivered work",
        sources: ["Output library"],
        dataSize: `${measured.length} measured pieces`,
        chart: { bars: [{ label: "Average", value: avg }, { label: top.f, value: top.mean, highlight: true }] },
        href: "/insights/performance",
      });
  }

  // Campaigns that are tiring: CTR of the last 7 days below the 23 before.
  for (const c of daily.campaigns.filter((c) => c.ctrLast7 !== null && c.ctrTrailing !== null && c.ctrLast7 < c.ctrTrailing * 0.85))
    out.push({
      key: `fatigue:${c.platform}:${c.name}`.toLowerCase().slice(0, 120),
      kind: "data",
      title: `“${c.name}” is tiring`,
      value: `${c.ctrTrailing}% → ${c.ctrLast7}%`,
      comparison: "Click-through, the 23 days before vs the last 7",
      period: "30 days",
      sources: [c.platform],
      chart: { bars: [{ label: "Before", value: c.ctrTrailing! }, { label: "Last 7 days", value: c.ctrLast7!, highlight: true }] },
      href: "/insights/performance",
    });

  // The Market feed: each signal of the last six weeks.
  for (const s of signals) {
    const d = (s.data ?? {}) as { before?: number; after?: number };
    out.push({
      key: `signal:${s.id}`,
      kind: "market",
      title: s.title,
      value: d.before != null && d.after != null ? `${d.before} → ${d.after}` : day(s.publishedAt),
      comparison: s.summary.slice(0, 160),
      sources: [s.source ?? "Market feed"],
      href: "/insights/market",
      origin: "signal",
      foundAt: s.publishedAt,
    });
  }

  // Revenue (Phase V data layer): a paid channel that doesn't pay back.
  if (revenue?.connected) {
    const cur = revenue.currency;
    const worst = revenue.tables.channel.filter((c) => c.spend && c.spend >= 1000 && c.return !== null && c.return < 1).sort((a, b) => (a.return ?? 0) - (b.return ?? 0))[0];
    if (worst)
      out.push({
        key: `channel-return:${worst.name.toLowerCase()}`,
        kind: "data",
        title: `${worst.name} doesn't pay back`,
        value: `${worst.return!.toFixed(1)}× return`,
        comparison: `${money(worst.spend!, cur)} spent, ${money(worst.revenue, cur)} revenue`,
        period: "90 days",
        // Where its revenue was counted: the CRM for retail deals, the shop for online orders.
        sources: revenue.based.filter((s) => (worst.deals ? CRMS : SHOPS).includes(s)).slice(0, 1),
        chart: { bars: [{ label: "Revenue", value: worst.revenue, highlight: true }, { label: "Spend", value: worst.spend! }] },
        href: "/insights/revenue",
      });
  }
  return out;
}

/** Writes today's findings and archives the detector findings that are no longer true. Real clients only. */
export async function refreshInsights(clientId: string, now = new Date()) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { isDemo: true } });
  if (!client || client.isDemo) return { written: 0, archived: 0 };
  const found = await detectInsights(clientId, now);
  for (const f of found) await upsertInsight(clientId, f, { now });
  const keys = found.map((f) => f.key);
  const { count } = await prisma.insight.updateMany({ where: { clientId, origin: { in: ["detector", "signal", "moment"] }, status: "active", key: { notIn: keys } }, data: { status: "archived" } });
  return { written: found.length, archived: count };
}

/**
 * An opportunity's saved evidence as linked insight records (what the Phase W migration did for every opportunity
 * then). A Market-feed signal or key moment shared by several opportunities is one insight.
 */
export async function insightsFromEvidence(clientId: string, opportunityId: string) {
  const o = await prisma.opportunity.findFirst({ where: { id: opportunityId, clientId }, select: { evidence: true, isDemo: true, createdAt: true } });
  if (!o) return 0;
  type Ev = { value: string; text: string; source: string; kind: string; ref?: string | null };
  const ids: string[] = [];
  for (const [n, e] of jsonArray<Ev>(o.evidence).entries()) {
    const shared = e.ref && /^(signal|moment):/.test(e.ref) ? e.ref : null;
    const kind: InsightKind = e.kind === "moment" ? "moment" : e.kind === "market" ? "market" : "data";
    const i = await upsertInsight(
      clientId,
      { key: shared ?? `evidence:${opportunityId}:${n}`, kind, title: e.text, value: e.value, sources: [e.source], href: e.ref?.startsWith("/") ? e.ref : kind === "market" ? "/insights/market" : kind === "moment" ? "/planner" : null, origin: shared ? shared.split(":")[0] : "evidence", foundAt: o.createdAt },
      { isDemo: o.isDemo }
    );
    ids.push(i.id);
  }
  return linkInsights(clientId, opportunityId, ids);
}

/**
 * Insights Overview, "What we found this month" (design InsightsLinked): the latest findings from the client's data
 * and the market (last 31 days), each with the opportunities it's used in, and the bridge line above them.
 */
export async function recentFindings(clientId: string, now = new Date(), take = 6) {
  const where: Prisma.InsightWhereInput = { clientId, status: "active", kind: { in: ["data", "market"] }, foundAt: { gte: new Date(now.getTime() - 31 * DAY) } };
  const [rows, total] = await Promise.all([prisma.insight.findMany({ where, orderBy: { foundAt: "desc" }, take }), prisma.insight.count({ where })]);
  // Only opportunities the client can see (not hidden, not set aside).
  const links = await prisma.opportunityInsight.findMany({ where: { insightId: { in: rows.map((r) => r.id) }, opportunity: { clientId, hiddenAt: null, status: { not: "dismissed" } } }, include: { opportunity: { select: { id: true, title: true, status: true, combined: true } } } });
  const findings = rows.map((insight) => ({ insight, used: links.filter((l) => l.insightId === insight.id).map((l) => ({ id: l.opportunity.id, title: shortTitle(l.opportunity), done: l.opportunity.status === "result" })) }));
  const feeding = findings.filter((f) => f.used.some((u) => !u.done));
  const open = new Set(feeding.flatMap((f) => f.used.filter((u) => !u.done).map((u) => u.id)));
  return { findings, total, bridge: { feeding: feeding.length, open: open.size, unused: findings.filter((f) => f.used.length === 0).length } };
}

/** An opportunity's name on a chip: the budget move by its plan item ("Black Friday Stories"), else its title up to a colon. */
export function shortTitle(o: { title: string; combined: Prisma.JsonValue | null }) {
  const plan = (o.combined as { actions?: { addToPlan?: { label?: string } | null } } | null)?.actions?.addToPlan?.label;
  if (plan) return `${plan.replace(/^Add to /, "").replace(/ plan$/, "")} Stories`;
  return o.title.split(":")[0].trim();
}
