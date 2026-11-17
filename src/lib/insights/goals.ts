import { prisma } from "@/lib/prisma";
import type { ClientGoal } from "@/generated/prisma";

/**
 * The client's goals on Insights → Overview (Phase X v2): progress against the target, where it should be by now
 * (the share of the goal's time that has passed), and On track / Behind. "online_sales_yoy" is measured from the
 * data layer: online sales since the start of the year against the same days last year, shared credit.
 */
const DAY = 86400000;
/** How far behind the line a goal can be and still be on track (share of the target). */
const SLACK = 0.1;

async function onlineSales(clientId: string, from: Date, to: Date) {
  const rows = await prisma.metricDaily.findMany({ where: { clientId, metric: "revenue", path: "online", page: "", date: { gte: from.toISOString().slice(0, 10), lte: to.toISOString().slice(0, 10) } }, select: { source: true, model: true, value: true } });
  // Shared credit: first and last touch averaged; a source that only reports last touch counts as-is.
  const lastOnly = new Set(rows.filter((r) => r.model === "last").map((r) => r.source));
  for (const r of rows) if (r.model === "first") lastOnly.delete(r.source);
  return rows.reduce((a, r) => a + r.value * (r.model === "" ? 1 : lastOnly.has(r.source) ? (r.model === "last" ? 1 : 0) : 0.5), 0);
}

export type GoalView = { id: string; title: string; progress: number | null; expected: number | null; status: "On track" | "Behind" | null; line: string | null };

export async function goalViews(clientId: string, now = new Date()): Promise<GoalView[]> {
  const goals = await prisma.clientGoal.findMany({ where: { clientId }, orderBy: { sortOrder: "asc" } });
  return Promise.all(goals.map((g) => goalView(clientId, g, now)));
}

export async function goalView(clientId: string, g: ClientGoal, now = new Date()): Promise<GoalView> {
  const start = g.startAt ?? new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const expected = g.dueAt && g.dueAt > start ? Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (g.dueAt.getTime() - start.getTime()))) : null;
  let progress: number | null = null;
  let line: string | null = g.note;
  if (g.measure === "online_sales_yoy") {
    const thisYear = await onlineSales(clientId, start, now);
    const lastYear = await onlineSales(clientId, new Date(start.getTime() - 365 * DAY), new Date(now.getTime() - 365 * DAY));
    if (lastYear > 0) {
      const growth = ((thisYear - lastYear) / lastYear) * 100;
      progress = g.target ? growth / g.target : null;
      line = [`${growth >= 0 ? "+" : "−"}${Math.abs(Math.round(growth))}% so far`, g.note].filter(Boolean).join(" · ");
    }
  } else if (g.current !== null) {
    progress = g.target ? g.current / g.target : null;
    // A milestone (no unit) shows its note only; "%" sits on the number.
    const amount = g.unit ? `${Math.round(g.current).toLocaleString("en-GB")}${g.unit.startsWith("%") ? g.unit : ` ${g.unit}`}` : null;
    line = [amount, g.note].filter(Boolean).join(" · ") || null;
  }
  const status = progress === null ? null : expected === null ? (progress >= 1 ? "On track" : null) : progress >= expected - SLACK ? "On track" : "Behind";
  return { id: g.id, title: g.title, progress: progress === null ? null : Math.max(0, progress), expected, status, line };
}
