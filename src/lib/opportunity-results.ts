import type { Opportunity, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { notifyMany } from "@/lib/notifier";
import { marketingPm } from "@/lib/contact-person";
import type { Combined } from "@/lib/combined";
import { clientVisible } from "@/lib/opportunities";
import { formatAmount, opportunityViews, predictionOf, rangeText, type Prediction, type Result } from "@/lib/opportunity-view";

/**
 * Phase W: the learning loop. When an opportunity's work goes live it becomes Running and its prediction is stored
 * (metric, expected range, window, baseline). When the window ends the actual result is computed from the data layer
 * and set to Beat (above the range), Met (in it) or Missed (below); one without an estimate is just Measured. The
 * client and the PM are told, and a miss gets a "what we learned" draft for staff to approve.
 */

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const family = (format: string | null | undefined) => (/story|9:16|reel/i.test(format ?? "") ? "Story" : null);

/** Shared credit: the average of first and last touch. */
const shared = (rows: { model: string; value: number }[]) => rows.filter((r) => r.model === "first" || r.model === "last").reduce((a, r) => a + r.value, 0) / 2;

/** The pieces of work an opportunity made: its plan items' published assets and its projects' assets. */
async function outputsOf(o: Pick<Opportunity, "id" | "clientId">) {
  const [items, routes] = await Promise.all([
    prisma.clientCalendarItem.findMany({ where: { clientId: o.clientId, opportunityId: o.id }, select: { publishedAssetId: true, projectId: true } }),
    prisma.opportunityRoute.findMany({ where: { opportunityId: o.id, projectId: { not: null } }, select: { projectId: true } }),
  ]);
  const projects = [...new Set([...items.flatMap((i) => (i.projectId ? [i.projectId] : [])), ...routes.flatMap((r) => (r.projectId ? [r.projectId] : []))])];
  const assets = projects.length ? await prisma.asset.findMany({ where: { clientId: o.clientId, projectId: { in: projects } }, select: { id: true } }) : [];
  return [...new Set([...items.flatMap((i) => (i.publishedAssetId ? [i.publishedAssetId] : [])), ...assets.map((a) => a.id)])];
}

/** What a prediction's metric came to over a window (shared credit), from the data layer. */
export async function measureMetric(clientId: string, p: Pick<Prediction, "metric" | "windowStart" | "windowEnd">, outputs: string[]) {
  const date = { gte: p.windowStart, lte: p.windowEnd };
  if (p.metric === "story_revenue") {
    const rows = await prisma.metricDaily.findMany({ where: { clientId, source: "Shopify", channel: "Meta", metric: "revenue", outputId: { not: null }, date }, select: { outputId: true, model: true, value: true } });
    const formats = new Map((await prisma.asset.findMany({ where: { clientId, id: { in: [...new Set(rows.map((r) => r.outputId!))] } }, select: { id: true, format: true } })).map((a) => [a.id, a.format]));
    return shared(rows.filter((r) => family(formats.get(r.outputId!)) === "Story"));
  }
  if (!outputs.length) return 0;
  const rows = await prisma.metricDaily.findMany({ where: { clientId, metric: { in: ["revenue", "won_value"] }, outputId: { in: outputs }, date }, select: { model: true, value: true } });
  return shared(rows);
}

/** The prediction stored when it starts running: from its estimate, over the window from the day its work went live. */
export async function buildPrediction(o: Opportunity & Parameters<typeof opportunityViews>[1][number], live: Date): Promise<Prediction> {
  const v = (await opportunityViews(o.clientId, [o], live)).get(o.id)!;
  const combined = o.combined as unknown as Combined | null;
  const days = v.estimate.days ?? 30;
  const start = iso(live);
  const end = iso(new Date(live.getTime() + (days - 1) * DAY));
  const metric = combined ? "story_revenue" : "work_revenue";
  // The budget move is measured as Story revenue above the same number of days before it; new work starts from 0.
  const baseline = combined ? await measureMetric(o.clientId, { metric, windowStart: iso(new Date(live.getTime() - days * DAY)), windowEnd: iso(new Date(live.getTime() - DAY)) }, []) : 0;
  const currency = v.estimate.currency;
  return {
    metric,
    unit: "money",
    low: v.estimate.low,
    high: v.estimate.high,
    currency,
    label: combined ? "Story revenue" : "revenue from the work",
    windowStart: start,
    windowEnd: end,
    baseline: Math.round(baseline),
    text: v.estimate.low !== null && v.estimate.high !== null ? rangeText(v.estimate.low, v.estimate.high, "money", currency) : "not estimated",
  };
}

/** Beat (above the range), Met (in it), Missed (below); Measured when there was no range to compare against. */
export function outcomeOf(p: Pick<Prediction, "low" | "high">, actual: number): Result["outcome"] {
  if (p.low === null || p.high === null) return "measured";
  return actual > p.high ? "beat" : actual >= p.low ? "met" : "missed";
}

/** The "what we learned" draft for a miss, from the numbers (staff edit and approve it). */
export function learningDraft(o: Pick<Opportunity, "kind">, p: Prediction, r: Result) {
  const short = p.high !== null && r.actual < p.high / 2;
  return `We expected ${p.text} and got ${r.text}.${short ? ` ${o.kind ? `${o.kind[0].toUpperCase()}${o.kind.slice(1)}` : "These"} suggestions now need more of your own data before we estimate them.` : ""}`;
}

/**
 * Moves the client's opportunities on: In plan → Running when their work went live (a plan item reached its date
 * and is ready or published; the budget move on its date), and Running → Result when the window ended.
 */
export async function advanceOpportunities(clientId: string, now = new Date()) {
  const include = { routes: { orderBy: { sortOrder: "asc" as const } }, insights: { include: { insight: true } } };
  const done: string[] = [];
  const inPlan = await prisma.opportunity.findMany({ where: { ...clientVisible(clientId), status: "in_plan" }, include });
  for (const o of inPlan) {
    const combined = o.combined as unknown as Combined | null;
    const items = await prisma.clientCalendarItem.findMany({ where: { clientId, archivedAt: null, OR: [{ opportunityId: o.id }, ...(combined?.actions.addToPlan ? [{ id: combined.actions.addToPlan.planItemId }] : [])] }, orderBy: { date: "asc" }, select: { date: true, status: true } });
    const live = items.find((i) => i.date.getTime() <= now.getTime() && (combined || ["ready", "published"].includes(i.status)));
    if (!live) continue;
    const prediction = await buildPrediction(o, live.date);
    await prisma.opportunity.update({ where: { id: o.id }, data: { status: "running", runningAt: now, prediction: prediction as unknown as Prisma.InputJsonValue } });
    done.push(`${o.title}: running`);
  }

  const running = await prisma.opportunity.findMany({ where: { ...clientVisible(clientId), status: "running" } });
  for (const o of running) {
    const p = predictionOf(o);
    if (!p || new Date(`${p.windowEnd}T23:59:59Z`).getTime() > now.getTime()) continue;
    const gross = await measureMetric(clientId, p, await outputsOf(o));
    const actual = Math.round(gross - p.baseline);
    const outcome = outcomeOf(p, actual);
    const result: Result = { outcome, actual, unit: "money", currency: p.currency, label: p.label, text: `${actual >= 0 ? "+" : "−"}${formatAmount(Math.abs(actual), "money", p.currency)}` };
    await prisma.opportunity.update({ where: { id: o.id }, data: { status: "result", result: result as unknown as Prisma.InputJsonValue, resultAt: now, ...(outcome === "missed" ? { learning: learningDraft(o, p, result), learningStatus: "draft" } : {}) } });
    await tellResult(clientId, o, p, result);
    done.push(`${o.title}: ${outcome}`);
  }
  return done;
}

const VERDICT: Record<Result["outcome"], string> = { beat: "beat our estimate", met: "met our estimate", missed: "missed our estimate", measured: "is measured" };

/** The result goes to the client's owners and to the Marketing PM. */
async function tellResult(clientId: string, o: Pick<Opportunity, "id" | "title">, p: Prediction, r: Result) {
  const [owners, pm] = await Promise.all([prisma.clientUser.findMany({ where: { clientId, permission: "OWNER" }, select: { userId: true } }), marketingPm(clientId)]);
  const body = `Expected ${p.text}, got ${r.text}.`;
  await notifyMany([
    ...owners.map((u) => ({ userId: u.userId, clientId, type: "SYSTEM" as const, title: `“${o.title}” ${VERDICT[r.outcome]}`, body, actionUrl: `/opportunities/${o.id}`, actionLabel: "See the result" })),
    ...(pm ? [{ userId: pm.userId, clientId, type: "SYSTEM" as const, title: `Result: “${o.title}” ${VERDICT[r.outcome]}`, body: r.outcome === "missed" ? `${body} A “what we learned” draft is waiting for you.` : body, actionUrl: `/ops/clients/${clientId}/opportunities`, actionLabel: "Open" }] : []),
  ]);
}
