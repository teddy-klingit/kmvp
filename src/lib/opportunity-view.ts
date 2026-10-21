import type { Insight, Opportunity, OpportunityRoute } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { confidenceFrom, type Combined, type Confidence } from "@/lib/combined";
import { clientVisible, costRange, kindOf, opportunityBriefBy, type Kind } from "@/lib/opportunities";
import { insightSources } from "@/lib/insight-records";

/**
 * Phase W: how an opportunity reads on the Opportunities page and its own page. Everything here is computed in code:
 *  - confidence by the Phase V rules (enough data, sources agree, holds across credit models), one step lower when a
 *    source it needs is disconnected;
 *  - the expected effect as a range: the budget move's own maths (Phase V), or else what this client's finished
 *    opportunities of the same kind brought. Without either it says what's missing, never a made-up number;
 *  - cost, decide-by, and the impact × urgency score the list sorts by.
 */

const DAY = 86400000;
/** Phase W: a prediction and a result, as stored when an opportunity starts running and when it's measured. */
export type Prediction = { metric: string; unit: "money" | "count"; low: number | null; high: number | null; currency?: string; label?: string; windowStart: string; windowEnd: string; baseline: number; text: string };
export type Result = { outcome: "beat" | "met" | "missed" | "measured"; actual: number; unit: "money" | "count"; currency?: string; label?: string; text: string };

export type Estimate = { text: string; low: number | null; high: number | null; unit: "money" | "count" | null; currency: string; days: number | null; unclear: string | null; maths: string[] };
export type OppView = {
  kind: Kind;
  tag: string;
  insights: Insight[];
  confidence: Confidence | null;
  estimate: Estimate;
  cost: string | null;
  decideBy: Date | null;
  warning: string | null;
  missing: string[];
  checks: { ok: boolean; text: string }[];
  score: number;
};

type Row = Opportunity & { routes: OpportunityRoute[]; insights: { insight: Insight; sortOrder: number }[] };

/** The channels a route runs on, as the data source that would report its results. */
const SOURCE_OF_CHANNEL: Record<string, string> = { TikTok: "TikTok", Instagram: "Meta", Facebook: "Meta", Newsletter: "Klaviyo", LinkedIn: "LinkedIn" };
const BAD = ["needs_reconnect", "error", "disconnected"];
const STATE: Record<string, string> = { needs_reconnect: "disconnected", error: "not syncing", disconnected: "disconnected" };
const sym = (c: string) => (c === "EUR" ? "€" : c === "USD" ? "$" : c === "GBP" ? "£" : `${c} `);
const k = (n: number, c: string) => `${sym(c)}${Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : Math.round(n)}`;
const lower = (c: Confidence | null): Confidence | null => (c === "high" ? "medium" : c === "medium" ? "low" : c);

export const resultOf = (o: Pick<Opportunity, "result">) => (o.result as Result | null) ?? null;
export const predictionOf = (o: Pick<Opportunity, "prediction">) => (o.prediction as Prediction | null) ?? null;
export const formatAmount = (n: number, unit: "money" | "count", currency = "EUR", label?: string) => (unit === "money" ? k(n, currency) : `${Math.round(n).toLocaleString("en-GB")}${label ? ` ${label}` : ""}`);
/** A range as the design writes it: "+€8–12k", "+€400–600", "+400–600 sign-ups". */
export function rangeText(low: number, high: number, unit: "money" | "count", currency = "EUR", label?: string) {
  if (unit === "count") return `+${Math.round(low).toLocaleString("en-GB")}–${Math.round(high).toLocaleString("en-GB")}${label ? ` ${label}` : ""}`;
  const thousands = low >= 1000 && high >= 1000;
  const f = (n: number) => (thousands ? (n / 1000).toFixed(1).replace(/\.0$/, "") : String(Math.round(n)));
  return `+${sym(currency)}${f(low)}–${f(high)}${thousands ? "k" : ""}`;
}

/** Everything the views need, for a set of one client's opportunities (one round of reads). */
export async function opportunityViews(clientId: string, rows: Row[], now = new Date()): Promise<Map<string, OppView>> {
  const [sources, finished, items] = await Promise.all([
    prisma.dataSource.findMany({ where: { clientId }, select: { source: true, status: true } }),
    prisma.opportunity.findMany({ where: { clientId, status: "result" }, select: { kind: true, sources: true, origin: true, result: true, prediction: true, resultAt: true }, orderBy: { resultAt: "desc" }, take: 40 }),
    prisma.clientCalendarItem.findMany({ where: { clientId, id: { in: rows.flatMap((r) => { const c = r.combined as unknown as Combined | null; return c?.actions.addToPlan ? [c.actions.addToPlan.planItemId] : []; }) } }, select: { id: true, title: true } }),
  ]);
  const status = new Map(sources.map((s) => [s.source, s.status]));
  const itemTitle = new Map(items.map((i) => [i.id, i.title]));
  const out = new Map<string, OppView>();

  for (const o of rows) {
    const kind = kindOf(o);
    const insights = [...o.insights].sort((a, b) => a.sortOrder - b.sortOrder).map((l) => l.insight);
    const combined = o.combined as unknown as Combined | null;
    // What's missing: a source one of its insights came from, or every channel the first route runs on (then its
    // result couldn't be measured).
    const bad = (s: string) => BAD.includes(status.get(s) ?? "");
    const routeSources = [...new Set(jsonArray<string>(o.routes[0]?.channels).map((c) => SOURCE_OF_CHANNEL[c]).filter(Boolean))];
    const missing = [...new Set([...insights.flatMap(insightSources).filter(bad), ...(routeSources.length && routeSources.every(bad) ? routeSources : [])])];
    const warning = missing.length ? `${missing.map((m) => `${m} ${STATE[status.get(m)!] ?? "disconnected"}`).join(", ")}, so we can't check this against your results. Reconnect to raise confidence.` : null;

    // Confidence: the budget move has its own (Phase V); otherwise enough data, and two or more sources that agree.
    let confidence: Confidence | null;
    let checks: { ok: boolean; text: string }[];
    if (combined) {
      confidence = (o.confidence as Confidence | null) ?? null;
      checks = [...combined.checks, ...combined.blind.map((text) => ({ ok: false, text }))];
    } else {
      const measured = insights.filter((i) => i.kind === "data" || i.kind === "market");
      const independent = [...new Set(measured.flatMap(insightSources).filter((s) => !["Planner", "Key moments"].includes(s)))];
      confidence = confidenceFrom({ enough: measured.length > 0, agree: independent.length >= 2, holds: null });
      checks = [
        measured.length ? { ok: true, text: `Enough data: ${measured.length} finding${measured.length === 1 ? "" : "s"} from your data and the market` } : { ok: false, text: "Not enough data yet: no finding from your data or the market" },
        independent.length >= 2 ? { ok: true, text: `Sources agree: ${independent.join(", ")} point the same way` } : { ok: false, text: independent.length ? `Only one source so far (${independent[0]}), so nothing to check it against` : "No source to check it against yet" },
      ];
    }
    if (missing.length) checks.push({ ok: false, text: `${missing.join(", ")} disconnected: its results can't be checked` });
    if (missing.length) confidence = lower(confidence) ?? null;

    // Expected effect.
    let estimate: Estimate;
    if (combined) {
      estimate = { text: combined.effect.text.replace(/^≈ /, "").replace(" revenue over ", " in "), low: combined.effect.low, high: combined.effect.high, unit: "money", currency: combined.effect.currency, days: combined.effect.days, unclear: null, maths: combined.maths.map((m) => `${m.label}: ${m.text}`) };
    } else {
      const same = finished.filter((f) => kindOf({ kind: f.kind, sources: f.sources, origin: f.origin }) === kind).map((f) => ({ r: resultOf(f), p: predictionOf(f) })).filter((x) => x.r?.unit === "money" && x.p);
      if (missing.length) estimate = { text: `Unclear: no ${missing.join(" or ")} data`, low: null, high: null, unit: null, currency: "EUR", days: null, unclear: `no ${missing.join(" or ")} data`, maths: [] };
      else if (same.length >= 2) {
        const vals = same.map((x) => x.r!.actual).sort((a, b) => a - b);
        const q = (p: number) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(p * (vals.length - 1))))];
        const currency = same[0].r!.currency ?? "EUR";
        const days = Math.round(same.map((x) => (new Date(x.p!.windowEnd).getTime() - new Date(x.p!.windowStart).getTime()) / DAY).sort((a, b) => a - b)[Math.floor(same.length / 2)]);
        const [lo, hi] = [Math.floor(q(0.25) / 1000), Math.max(Math.floor(q(0.25) / 1000) + 1, Math.round(q(0.75) / 1000))];
        estimate = {
          text: `+${sym(currency)}${lo}–${hi}k in ${days} days`,
          low: lo * 1000,
          high: hi * 1000,
          unit: "money",
          currency,
          days,
          unclear: null,
          maths: [`Your last ${same.length} ${kind} opportunities brought ${same.slice(0, 5).map((x) => `+${k(x.r!.actual, currency)}`).join(", ")} in about ${days} days. We expect the middle half of that: +${sym(currency)}${lo}–${hi}k.`],
        };
      } else estimate = { text: `Unclear: no results yet for ${kind} opportunities`, low: null, high: null, unit: null, currency: "EUR", days: null, unclear: `no results yet for ${kind} opportunities`, maths: [] };
    }

    // Cost and decide-by.
    const route = o.routes[0] ?? null;
    const cost = combined ? combined.cost.text : costRange(o.routes);
    const decideBy = combined?.decideBy ? new Date(combined.decideBy) : o.windowStart || o.windowEnd ? await opportunityBriefBy(o, route) : null;

    // Tag: what it's about, after the kind.
    const moment = insights.find((i) => i.kind === "moment");
    const tag = combined?.actions.addToPlan ? (itemTitle.get(combined.actions.addToPlan.planItemId) ?? "") : kind === "seasonal" ? (moment?.title ?? "") : kind === "competitor" ? "Respond" : kind === "trend" ? "Test" : "Make more";

    // Impact × urgency: the middle of the range per day left to decide (no range: after the ones with one).
    const mid = estimate.low !== null && estimate.high !== null ? (estimate.low + estimate.high) / 2 : 0;
    const days = decideBy ? Math.max(1, Math.ceil((decideBy.getTime() - now.getTime()) / DAY)) : 60;
    out.set(o.id, { kind, tag, insights, confidence, estimate, cost, decideBy, warning, missing, checks, score: mid ? mid / days : -days });
  }
  return out;
}

/** Sort: impact × urgency, highest first (the ones without a range after, soonest decide-by first). */
export const byScore = (views: Map<string, OppView>) => (a: { id: string }, b: { id: string }) => (views.get(b.id)?.score ?? -1e9) - (views.get(a.id)?.score ?? -1e9);

/** The track record strip (last 6 months) and the latest results, from stored predictions and results. */
export async function trackRecord(clientId: string, now = new Date()) {
  const since = new Date(now.getTime() - 183 * DAY);
  const rows = await prisma.opportunity.findMany({ where: { ...clientVisible(clientId), createdAt: { gte: since } }, select: { status: true, result: true } });
  const results = await prisma.opportunity.findMany({ where: { ...clientVisible(clientId), status: "result", resultAt: { not: null } }, orderBy: { resultAt: "desc" }, select: { id: true, title: true, prediction: true, result: true, resultAt: true, learning: true, learningStatus: true } });
  const measured = rows.map(resultOf).filter((r): r is Result => Boolean(r));
  const money = measured.filter((r) => r.unit === "money");
  const learned = results.find((r) => resultOf(r)?.outcome === "missed" && r.learningStatus === "approved" && r.learning);
  return {
    suggested: rows.length,
    actedOn: rows.filter((r) => ["in_plan", "running", "result"].includes(r.status)).length,
    metOrBeat: measured.filter((r) => r.outcome === "beat" || r.outcome === "met").length,
    // Only results with an estimate to compare against count here.
    measured: measured.filter((r) => r.outcome !== "measured").length,
    revenue: money.length ? { value: money.reduce((a, r) => a + r.actual, 0), currency: money[0].currency ?? "EUR" } : null,
    recent: results.slice(0, 3).map((r) => ({ id: r.id, title: r.title, prediction: predictionOf(r), result: resultOf(r)! })),
    results: results.length,
    learning: learned?.learning ?? null,
  };
}

const short = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
const wday = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);

/**
 * "How we'll measure it": the metric, the window and when the result is ready. Once it's running, the stored
 * prediction says it; before that it's worked out from the estimate and the date its work goes live.
 */
export async function measurementPlan(o: Pick<Opportunity, "id" | "clientId" | "combined" | "prediction" | "windowStart" | "windowEnd">, v: OppView) {
  const stored = predictionOf(o);
  const combined = o.combined as unknown as Combined | null;
  let start: Date | null = stored ? new Date(stored.windowStart) : null;
  let end: Date | null = stored ? new Date(stored.windowEnd) : null;
  if (!start) {
    const item = await prisma.clientCalendarItem.findFirst({ where: { clientId: o.clientId, archivedAt: null, OR: [{ opportunityId: o.id }, ...(combined?.actions.addToPlan ? [{ id: combined.actions.addToPlan.planItemId }] : [])] }, orderBy: { date: "asc" }, select: { date: true } });
    start = item?.date ?? o.windowStart ?? o.windowEnd ?? null;
    end = start ? new Date(start.getTime() + (v.estimate.days ?? 30) * DAY) : null;
  }
  const metric = combined ? "Story revenue" : "the revenue from the work it makes (through its UTM tags)";
  const ready = end ? new Date(end.getTime() + 2 * DAY) : null;
  if (v.missing.length) return { text: `We'll measure ${metric} once ${v.missing.join(" and ")} is reconnected. Without it there's nothing to compare against.`, ready: null };
  if (!start || !end) return { text: `We'll measure ${metric} for ${v.estimate.days ?? 30} days from when its work goes live.`, ready: null };
  const against = stored ? stored.text : v.estimate.low !== null ? v.estimate.text.replace(/ in \d+ days$/, "") : null;
  return {
    text: `We compare ${metric} ${short(start)} – ${short(end)}${against ? ` against the ${against} we expect, and show the result here and in your track record` : ", and show what it brought here and in your track record (there's no estimate to beat yet)"}.`,
    ready: ready ? `Result ready: ${wday(ready)}` : null,
  };
}
