import { prisma } from "@/lib/prisma";
import { aiCreditStatus, monthPeriod } from "@/lib/ai-credits";
import { creditSummary } from "@/lib/client-home";

/**
 * Settings → Usage (nav v3, 08): every number from the two ledgers (AiCreditLedger, CreditLedgerEntry). The
 * breakdowns always add up to the month's totals: rows with nobody or no project attributed get their own row.
 *
 * Forecast (AI credits): average daily use so far this month × the days left. Team credits: what's used plus what's
 * held for estimates you haven't approved yet.
 */

export const FORECAST_METHOD = "Average daily use so far this month × the days left until the reset.";

const DAY = 86400000;
const round = (n: number) => Math.round(n * 10) / 10;
type Row = { key: string; label: string; sub?: string; value: number; tone?: "skill" | "assistant" | "other" | "held" };

function groupSum<T>(rows: T[], key: (r: T) => string, value: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r));
  return m;
}

export async function loadUsage(clientId: string, now = new Date()) {
  const { start, end } = monthPeriod(now);
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / DAY);
  const today = Math.min(daysInMonth, Math.floor((now.getTime() - start.getTime()) / DAY) + 1);
  const lastStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const yearStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 11, 1));

  const [ai, team, aiRows, teamRows, held, members, history, teamHistory] = await Promise.all([
    aiCreditStatus(clientId, now),
    creditSummary(clientId, now),
    prisma.aiCreditLedger.findMany({ where: { clientId, kind: "USAGE", billedTo: "klingit", createdAt: { gte: start, lt: end } } }),
    prisma.creditLedgerEntry.findMany({ where: { clientId, type: "CONSUMPTION", createdAt: { gte: start, lt: end } }, include: { project: { select: { name: true, status: true } } } }),
    prisma.estimate.findMany({ where: { status: "SENT", project: { clientId, status: { notIn: ["ARCHIVED", "DRAFT"] } } }, include: { project: { select: { id: true, name: true } }, revisions: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1 } } }),
    prisma.clientUser.findMany({ where: { clientId }, include: { user: { select: { id: true, name: true } } } }),
    prisma.aiCreditLedger.findMany({ where: { clientId, kind: "USAGE", billedTo: "klingit", createdAt: { gte: yearStart, lt: end } }, select: { amount: true, createdAt: true } }),
    prisma.creditLedgerEntry.findMany({ where: { clientId, type: "CONSUMPTION", createdAt: { gte: yearStart, lt: end } }, select: { amount: true, createdAt: true } }),
  ]);
  const projects = new Map((await prisma.project.findMany({ where: { id: { in: aiRows.map((r) => r.projectId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  const people = new Map(members.map((m) => [m.user.id, { name: m.user.name, role: m.permission === "OWNER" ? "Admin" : "Member" }]));
  const used = (r: { amount: number }) => -r.amount;

  // ── AI credits per day, with the forecast for the days left ────────────────────────────────────────────────
  const byDay = Array.from({ length: daysInMonth }, () => 0);
  for (const r of aiRows) byDay[Math.floor((r.createdAt.getTime() - start.getTime()) / DAY)] += used(r);
  const aiUsed = round(byDay.reduce((a, b) => a + b, 0));
  const average = today > 0 ? aiUsed / today : 0;
  const forecastLeft = Math.round(average * (daysInMonth - today));
  let cumulative = 0;
  let reachedDay: number | null = null;
  for (let d = 0; d < daysInMonth; d++) {
    cumulative += d < today ? byDay[d] : average;
    if (reachedDay === null && ai.allowance > 0 && cumulative >= ai.allowance) reachedDay = d + 1;
  }
  const busiestIndex = byDay.indexOf(Math.max(...byDay));
  const busiestRows = aiRows.filter((r) => Math.floor((r.createdAt.getTime() - start.getTime()) / DAY) === busiestIndex);
  const busiestTop = [...groupSum(busiestRows, (r) => r.sourceName ?? "Other", () => 1)].sort((a, b) => b[1] - a[1])[0];
  const lastMonthDays = Math.round((start.getTime() - lastStart.getTime()) / DAY);
  const lastMonth = Array.from({ length: lastMonthDays }, () => 0);
  for (const r of history) if (r.createdAt >= lastStart && r.createdAt < start) lastMonth[Math.floor((r.createdAt.getTime() - lastStart.getTime()) / DAY)] += used(r);
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(yearStart.getUTCFullYear(), yearStart.getUTCMonth() + i, 1)));
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  const aiByMonth = groupSum(history, (r) => monthKey(r.createdAt), used);
  const teamByMonth = groupSum(teamHistory, (r) => monthKey(r.createdAt), used);

  // ── Where AI credits go ────────────────────────────────────────────────────────────────────────────────────
  const runsOf = (rows: typeof aiRows) => new Set(rows.map((r) => r.agentRunId ?? r.id)).size;
  const bySource: Row[] = [...groupSum(aiRows, (r) => `${r.sourceType}|${r.sourceName ?? "Other"}`, used)].map(([k, v]) => {
    const [type, name] = k.split("|");
    const rows = aiRows.filter((r) => `${r.sourceType}|${r.sourceName ?? "Other"}` === k);
    const custom = type === "skill" && rows.some((r) => r.sourceKey?.startsWith("custom_") || r.sourceKey?.startsWith("demo_"));
    return { key: k, label: name, sub: type === "skill" ? `${custom ? "Custom skill" : "Skill"} · ${runsOf(rows)} run${runsOf(rows) === 1 ? "" : "s"}` : `Assistant · ${runsOf(rows)} answer${runsOf(rows) === 1 ? "" : "s"}`, value: round(v), tone: type === "skill" ? "skill" : "assistant" };
  });
  const byProject: Row[] = [...groupSum(aiRows, (r) => r.projectId ?? "", used)].map(([k, v]) => ({ key: k || "none", label: k ? (projects.get(k) ?? "A project") : "Not tied to a project", value: round(v) }));
  const byFormat: Row[] = [...groupSum(aiRows, (r) => r.format ?? (r.sourceType === "assistant" ? "Assistant answers" : "Other skill output"), used)].map(([k, v]) => ({ key: k, label: k, value: round(v) }));
  const byPerson: Row[] = [...groupSum(aiRows, (r) => r.userId ?? "", used)].map(([k, v]) => ({ key: k || "none", label: k ? (people.get(k)?.name ?? "Former member") : "Not attributed", sub: k ? people.get(k)?.role : undefined, value: round(v) }));
  const sorted = (rows: Row[]) => rows.sort((a, b) => b.value - a.value);
  const top = (rows: Row[], n = 6) => {
    const s = sorted(rows);
    if (s.length <= n + 1) return s;
    const rest = s.slice(n);
    return [...s.slice(0, n), { key: "other", label: "Other", sub: `${rest.length} more`, value: round(rest.reduce((a, r) => a + r.value, 0)), tone: "other" as const }];
  };

  // ── Where team credits go (used this month, plus held for estimates waiting on approval) ───────────────────
  const heldRows = held.map((e) => ({ project: e.project, credits: Math.max(0, e.totalCredits - (e.revisions[0]?.totalCredits ?? 0)) })).filter((h) => h.credits > 0);
  const teamByProject: Row[] = [
    ...[...groupSum(teamRows, (r) => r.projectId ?? "", used)].map(([k, v]) => ({ key: k || "none", label: teamRows.find((r) => r.projectId === k)?.project?.name ?? "Not tied to a project", sub: undefined, value: v })),
    ...heldRows.map((h) => ({ key: `held-${h.project.id}`, label: h.project.name, sub: "Held · estimate waiting on you", value: h.credits, tone: "held" as const })),
  ];
  const teamByFormat: Row[] = [...groupSum(teamRows, (r) => r.format ?? "Other", used)].map(([k, v]) => ({ key: k, label: k, value: v }));
  const teamByPerson: Row[] = [...groupSum(teamRows, (r) => r.userId ?? "", used)].map(([k, v]) => ({ key: k || "none", label: k ? (people.get(k)?.name ?? "Former member") : "Not attributed", value: v }));

  const teamUsed = teamRows.reduce((a, r) => a + used(r), 0);
  const members_ = [...members.map((m) => ({ id: m.user.id, name: m.user.name, role: m.permission === "OWNER" ? "Admin" : "Member", team: teamRows.filter((r) => r.userId === m.user.id).reduce((a, r) => a + used(r), 0), ai: round(aiRows.filter((r) => r.userId === m.user.id).reduce((a, r) => a + used(r), 0)) }))];

  return {
    period: { start, end, today, daysInMonth, label: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(start), nextReset: end },
    ai: {
      ...ai,
      usedThisMonth: aiUsed,
      perDay: byDay.map((v, i) => ({ day: i + 1, used: i < today ? round(v) : 0, forecast: i >= today ? Math.round(average) : 0 })),
      lastMonth: lastMonth.map((v, i) => ({ day: i + 1, used: round(v) })),
      months: months.map((m) => ({ label: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(m), used: round(aiByMonth.get(monthKey(m)) ?? 0) })),
      average: Math.round(average),
      projected: Math.round(aiUsed + forecastLeft),
      reachedDay,
      runsOutBeforeReset: ai.allowance > 0 && aiUsed + forecastLeft > ai.allowance + ai.bundleLeft,
      busiest: aiUsed > 0 ? { day: busiestIndex + 1, value: round(byDay[busiestIndex]), top: busiestTop ? { name: busiestTop[0], count: busiestTop[1] } : null } : null,
      bySource: top(bySource),
      byProject: top(byProject),
      byFormat: top(byFormat),
      byPerson: sorted(byPerson),
      totals: { skills: round(bySource.filter((r) => r.tone === "skill").reduce((a, r) => a + r.value, 0)), assistants: round(bySource.filter((r) => r.tone === "assistant").reduce((a, r) => a + r.value, 0)) },
    },
    team: {
      ...team,
      usedThisMonth: teamUsed,
      byProject: sorted(teamByProject),
      byFormat: sorted(teamByFormat),
      byPerson: sorted(teamByPerson),
      heldNote: heldRows.length ? heldRows.map((h) => `${h.credits} credits held for the ${h.project.name} estimate`).join(" · ") : null,
      months: months.slice(-6).map((m) => ({ label: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(m), used: teamByMonth.get(monthKey(m)) ?? 0 })),
    },
    aiMonths6: months.slice(-6).map((m) => ({ label: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(m), used: round(aiByMonth.get(monthKey(m)) ?? 0) })),
    members: members_.sort((a, b) => b.ai + b.team - (a.ai + a.team)),
  };
}

/** One member's own credits this month (My usage): their team and AI credits only. */
export async function loadMyUsage(clientId: string, userId: string, now = new Date()) {
  const { start, end } = monthPeriod(now);
  const [ai, team] = await Promise.all([
    prisma.aiCreditLedger.findMany({ where: { clientId, userId, kind: "USAGE", createdAt: { gte: start, lt: end } } }),
    prisma.creditLedgerEntry.findMany({ where: { clientId, userId, type: "CONSUMPTION", createdAt: { gte: start, lt: end } }, include: { project: { select: { name: true } } } }),
  ]);
  const bySource = [...groupSum(ai, (r) => r.sourceName ?? "Other", (r) => -r.amount)].map(([label, value]) => ({ key: label, label, value: round(value) })).sort((a, b) => b.value - a.value);
  return {
    label: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(start),
    ai: round(ai.filter((r) => r.billedTo === "klingit").reduce((a, r) => a - r.amount, 0)),
    aiTokens: ai.filter((r) => r.billedTo === "client_provider").reduce((a, r) => a + r.tokensIn + r.tokensOut, 0),
    team: team.reduce((a, r) => a - r.amount, 0),
    bySource,
    teamByProject: [...groupSum(team, (r) => r.project?.name ?? "Not tied to a project", (r) => -r.amount)].map(([label, value]) => ({ key: label, label, value })),
  };
}
