import { prisma } from "@/lib/prisma";
import { teamBalances, poolOf, periodKey } from "@/lib/team-ledger";
import { aiCreditStatus } from "@/lib/ai-credits";
import { creditsForBudget } from "@/lib/ai-cost";
import { getSetting } from "@/lib/platform-settings";

/**
 * Phase T2: a client's three balances — Marketing PM, Creative team and AI — the same everywhere they appear (the
 * client's Overview, the Clients list, Today's "Keep an eye on" and the Credits tab). Never one mixed number, never
 * hidden: before the contract starts a balance reads "10 from 1 Nov"; a client without a team pack reads "Not in
 * their plan". No prices anywhere here.
 */
const DAY = 86400000;
const dm = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
const monthName = (d: Date) => new Intl.DateTimeFormat("en-GB", { month: "short" }).format(d);
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const round = (n: number) => Math.round(n * 10) / 10 || 0;

export type BalanceKey = "pm" | "creative" | "ai";
export type Balance = {
  key: BalanceKey;
  label: string;
  /** live: a running balance; pending: granted from the contract's start; none: not in their plan */
  state: "live" | "pending" | "none";
  left: number;
  of: number;
  /** "14 of 20 left", "10 from 1 Nov", "Not in their plan" */
  headline: string;
  note: string;
  warn: boolean;
};

const LABEL: Record<BalanceKey, string> = { pm: "Marketing PM", creative: "Creative team", ai: "AI" };

export async function balanceSummary(clientId: string, now = new Date()): Promise<Balance[]> {
  const [team, ai, scheduled, owner, held, requests, cap] = await Promise.all([
    teamBalances(clientId, now),
    aiCreditStatus(clientId, now),
    prisma.contract.findFirst({ where: { clientId, status: "scheduled" }, orderBy: { startDate: "asc" } }),
    prisma.clientUser.findFirst({ where: { clientId, permission: "OWNER" }, include: { user: { select: { name: true } } } }),
    prisma.estimate.findMany({ where: { status: "SENT", project: { clientId, status: { notIn: ["ARCHIVED", "DRAFT"] } } }, select: { pmCredits: true } }),
    prisma.purchaseRequest.findMany({ where: { clientId, status: "pending", kind: "creative_pack" }, select: { payload: true } }),
    getSetting("teamRolloverCap"),
  ]);
  const contact = owner?.user.name.split(" ")[0] ?? "the client";
  const out: Balance[] = [];
  const elapsed = Math.max(1, (now.getTime() - monthStart(now).getTime()) / DAY);
  const monthEnd = addMonths(now, 1);

  for (const key of ["pm", "creative"] as const) {
    if (team) {
      const p = team[key];
      if (p.monthly <= 0 && !p.left && !(team.contract.teamPackKey && key === "pm")) {
        out.push({ key, label: LABEL[key], state: "none", left: 0, of: 0, headline: "Not in their plan", note: "No team pack on the contract", warn: false });
        continue;
      }
      const of = poolOf(p);
      const pace = p.used / elapsed;
      const runsOut = pace > 0 && p.left > 0 ? new Date(now.getTime() + (p.left / pace) * DAY) : null;
      const warn = Boolean(runsOut && runsOut < monthEnd);
      const notes =
        key === "pm"
          ? [`Your time`, held.reduce((n, e) => n + (e.pmCredits ?? 0), 0) ? `${held.reduce((n, e) => n + (e.pmCredits ?? 0), 0)} held for open estimates` : null]
          : [
              warn ? `At this pace: runs out ~ ${dm(runsOut!)}` : "Lasts the month at this pace",
              requests.length ? `+${requests.reduce((n, r) => n + (((r.payload ?? {}) as { packs?: number }).packs ?? 1) * 10, 0)} requested` : null,
              p.services ? `${Math.round(p.services)} reserved for fixed services` : null,
            ];
      out.push({ key, label: LABEL[key], state: "live", left: round(p.left), of, headline: `${round(p.left)} of ${of} left`, note: notes.filter(Boolean).join(" · "), warn });
    } else if (scheduled) {
      const monthly = key === "pm" ? scheduled.pmCreditsPerMonth : scheduled.creativeCreditsPerMonth;
      if (!scheduled.teamPackKey || monthly <= 0) {
        out.push({ key, label: LABEL[key], state: "none", left: 0, of: 0, headline: "Not in their plan", note: "No team pack on the contract", warn: false });
        continue;
      }
      const rule = key === "pm" ? "Granted on the 1st of each month" : `Granted on the 1st · rolls over up to ${Math.round(monthly * cap)}`;
      out.push({ key, label: LABEL[key], state: "pending", left: 0, of: monthly, headline: `${monthly} from ${dm(scheduled.startDate)}`, note: rule, warn: false });
    } else {
      out.push({ key, label: LABEL[key], state: "none", left: 0, of: 0, headline: "Not in their plan", note: "On an old plan without a team pack", warn: false });
    }
  }

  if (ai.ownModel) out.push({ key: "ai", label: LABEL.ai, state: "none", left: 0, of: 0, headline: "Their own AI", note: "Skills run on the client's own model", warn: false });
  else {
    const of = ai.allowance || ai.left;
    const usedShare = of ? ai.used / of : 0;
    const topUpWarn = await prisma.notification.findFirst({ where: { clientId, title: { contains: "AI credits" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null);
    let note = usedShare >= 0.8 ? `${Math.round(usedShare * 100)}% used${topUpWarn && topUpWarn.createdAt >= monthStart(now) ? ` · ${contact} got the top-up warning ${dm(topUpWarn.createdAt)}` : ""}` : `Skills run by ${contact}'s team · resets ${dm(addMonths(now, 1))}`;
    if (scheduled) {
      const plan = await prisma.platformPlan.findUnique({ where: { key: scheduled.platformPlanKey } });
      const then = plan ? await creditsForBudget(plan) : null;
      note = `Old plan allowance until ${dm(new Date(scheduled.startDate.getTime() - DAY))}${then ? ` · then ${then.toLocaleString("en-GB")} a month` : ""}`;
    }
    out.push({ key: "ai", label: LABEL.ai, state: "live", left: Math.round(ai.left), of: Math.round(of), headline: `${Math.round(ai.left).toLocaleString("en-GB")} of ${Math.round(of).toLocaleString("en-GB")} left`, note, warn: usedShare >= 0.8 });
  }
  return out;
}

// ─── The Credits tab ──────────────────────────────────────────────────────────────────────────────────────────

export type CreditsPeriod = "month" | "6m" | "contract";
export const parseCreditsPeriod = (s: string | undefined): CreditsPeriod => (s === "month" || s === "contract" ? s : "6m");

export type MonthBar = { key: string; label: string; used: number; forecast: number | null };
export type Movement = { at: Date; balance: BalanceKey; amount: string; what: string; type: string };
export type Advice = { tone: "warn" | "ok"; text: string; strong?: string };

export async function creditsTab(clientId: string, opts: { period: CreditsPeriod; now?: Date }) {
  const now = opts.now ?? new Date();
  const [balances, contract, scheduled, ledger, aiRows, requests, services, packs, owner, cap] = await Promise.all([
    balanceSummary(clientId, now),
    prisma.contract.findFirst({ where: { clientId, status: { in: ["active", "paused", "ending"] } }, orderBy: { startDate: "desc" } }),
    prisma.contract.findFirst({ where: { clientId, status: "scheduled" }, orderBy: { startDate: "asc" } }),
    prisma.creditLedgerEntry.findMany({ where: { clientId, createdAt: { gte: addMonths(now, -11) } }, include: { project: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.aiCreditLedger.findMany({ where: { clientId, billedTo: "klingit", createdAt: { gte: addMonths(now, -11) }, OR: [{ kind: { not: "USAGE" } }, { billable: true }] }, orderBy: { createdAt: "desc" } }),
    prisma.purchaseRequest.findMany({ where: { clientId, status: "pending", kind: { in: ["creative_pack", "ai_topup"] } }, orderBy: { createdAt: "desc" } }),
    prisma.serviceAllocation.findMany({ where: { clientId, endedAt: null } }),
    prisma.teamPack.findMany({ orderBy: { creativeCredits: "asc" } }).catch(() => [] as { key: string; name: string; pmCredits: number; creativeCredits: number }[]),
    prisma.clientUser.findFirst({ where: { clientId, permission: "OWNER" }, include: { user: { select: { name: true } } } }),
    getSetting("teamRolloverCap"),
  ]);
  const c = contract ?? scheduled;
  const contact = owner?.user.name.split(" ")[0] ?? "the client";
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set([...ledger.map((r) => r.userId), ...aiRows.map((r) => r.userId)].filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } });
  const person = (id: string | null) => {
    const n = users.find((u) => u.id === id)?.name;
    return n ? n.split(" ")[0] : null;
  };

  // ─── 6 months of use per balance, the grant line, and this month's forecast ──────────────────────────────
  const months = Array.from({ length: 6 }, (_, i) => addMonths(now, i - 5));
  const elapsed = Math.max(1, (now.getTime() - monthStart(now).getTime()) / DAY);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const inMonth = (d: Date, m: Date) => d >= m && d < addMonths(m, 1);
  const teamUsed = (pool: "pm" | "creative", m: Date) => -ledger.filter((r) => r.pool === pool && inMonth(r.createdAt, m) && (r.type === "CONSUMPTION" || r.type === "SERVICE")).reduce((n, r) => n + r.amount, 0);
  const aiUsed = (m: Date) => -aiRows.filter((r) => r.kind === "USAGE" && inMonth(r.createdAt, m)).reduce((n, r) => n + r.amount, 0);
  const bars = (used: (m: Date) => number): MonthBar[] =>
    months.map((m, i) => {
      const u = round(used(m));
      return { key: periodKey(m), label: monthName(m), used: u, forecast: i === 5 ? round((u / elapsed) * daysInMonth) : null };
    });
  const grant = { pm: c?.pmCreditsPerMonth ?? 0, creative: c?.creativeCreditsPerMonth ?? 0, ai: balances.find((b) => b.key === "ai")?.of ?? 0 };

  // ─── The period the top uses and the ledger cover ─────────────────────────────────────────────────────────
  const from = opts.period === "month" ? monthStart(now) : opts.period === "contract" && c ? c.startDate : addMonths(now, -5);
  const inPeriod = (d: Date) => d >= from;

  const top = (rows: { key: string; value: number; suffix?: string }[]) => {
    const m = new Map<string, { value: number; suffix?: string }>();
    for (const r of rows) {
      const x = m.get(r.key) ?? { value: 0, suffix: r.suffix };
      x.value += r.value;
      m.set(r.key, x);
    }
    return [...m].map(([label, x]) => ({ label, value: round(x.value), suffix: x.suffix ?? null })).sort((a, b) => b.value - a.value).slice(0, 3);
  };
  const topUses = {
    pm: top(ledger.filter((r) => r.pool === "pm" && r.type === "CONSUMPTION" && inPeriod(r.createdAt)).map((r) => ({ key: (r.note ?? r.project?.name ?? "PM work").split(" · ")[0], value: -r.amount }))),
    creative: top(ledger.filter((r) => r.pool === "creative" && (r.type === "CONSUMPTION" || r.type === "SERVICE") && inPeriod(r.createdAt)).map((r) => (r.type === "SERVICE" ? { key: `${(r.note ?? "Service").split(" · ")[0]} (monthly service)`, value: -r.amount / Math.max(1, opts.period === "month" ? 1 : 1), suffix: "reserved" } : { key: r.project?.name ?? (r.note ?? "Project").split(" · ")[0], value: -r.amount }))),
    ai: top(aiRows.filter((r) => r.kind === "USAGE" && inPeriod(r.createdAt)).map((r) => ({ key: r.sourceName ?? "Skills", value: -r.amount }))),
  };
  // A monthly service shows what it reserves a month, not the period's total.
  for (const t of topUses.creative) if (t.suffix === "reserved") t.value = services.find((s) => t.label.startsWith(s.name))?.creditsPerMonth ?? t.value;

  // ─── Every credit movement ───────────────────────────────────────────────────────────────────────────────
  const moves: Movement[] = [];
  const TYPE: Record<string, string> = { ALLOWANCE: "Grant", CONSUMPTION: "Project", PURCHASE: "Bought", ADJUSTMENT: "Adjustment", EXPIRY: "Expired", SERVICE: "Reserved" };
  for (const r of ledger.filter((x) => inPeriod(x.createdAt))) {
    const pool = r.pool === "pm" ? "pm" : "creative";
    const carried = r.type === "ALLOWANCE" ? ledger.find((x) => x.pool === r.pool && x.type === "EXPIRY" && x.periodKey === r.periodKey) : null;
    const what =
      r.type === "ALLOWANCE"
        ? `${new Intl.DateTimeFormat("en-GB", { month: "long" }).format(r.createdAt)} grant`
        : r.type === "SERVICE"
          ? `${(r.note ?? "Service").split(" · ")[0]}, monthly service`
          : [r.project?.name ?? r.note?.split(" · ")[0] ?? "Credits", person(r.userId)].filter(Boolean).join(" · ");
    const type = pool === "pm" && r.type === "CONSUMPTION" && !r.projectId ? "Your time" : (TYPE[r.type] ?? r.type);
    moves.push({ at: r.createdAt, balance: pool, amount: `${r.amount > 0 ? "+" : "−"} ${Math.abs(round(r.amount))}${carried ? ` · ${round(-carried.amount)} expired` : ""}`, what: r.type === "CONSUMPTION" && pool === "pm" && r.note ? r.note : what, type });
  }
  // AI use grouped per day and skill, so a busy day is one row ("Ad generator · 4 runs · Maja").
  const aiDays = new Map<string, { at: Date; amount: number; runs: number; name: string; who: Set<string> }>();
  for (const r of aiRows.filter((x) => inPeriod(x.createdAt))) {
    if (r.kind !== "USAGE") {
      moves.push({ at: r.createdAt, balance: "ai", amount: `${r.amount > 0 ? "+" : "−"} ${Math.abs(Math.round(r.amount)).toLocaleString("en-GB")}`, what: r.kind === "ALLOWANCE" ? `${new Intl.DateTimeFormat("en-GB", { month: "long" }).format(r.createdAt)} allowance` : r.kind === "BUNDLE" ? "Top-up" : (r.note ?? "Adjustment"), type: r.kind === "ALLOWANCE" ? "Grant" : r.kind === "BUNDLE" ? "Top-up" : "Adjustment" });
      continue;
    }
    const k = `${r.createdAt.toISOString().slice(0, 10)}|${r.sourceName ?? "Skills"}`;
    const x = aiDays.get(k) ?? { at: r.createdAt, amount: 0, runs: 0, name: r.sourceName ?? "Skills", who: new Set<string>() };
    x.amount += r.amount;
    x.runs += 1;
    const p = person(r.userId);
    if (p) x.who.add(p);
    aiDays.set(k, x);
  }
  for (const x of aiDays.values()) moves.push({ at: x.at, balance: "ai", amount: `− ${Math.abs(Math.round(x.amount)).toLocaleString("en-GB")}`, what: [x.name, `${x.runs} run${x.runs === 1 ? "" : "s"}`, [...x.who].join(", ")].filter(Boolean).join(" · "), type: "Skill" });
  for (const r of requests.filter((x) => inPeriod(x.createdAt))) {
    const p = (r.payload ?? {}) as { packs?: number; credits?: number };
    moves.push({ at: r.createdAt, balance: r.kind === "ai_topup" ? "ai" : "creative", amount: r.kind === "ai_topup" ? `+ ${(p.credits ?? 0).toLocaleString("en-GB")} asked` : `+ ${(p.packs ?? 1) * 10} asked`, what: `${r.kind === "ai_topup" ? "AI top-up" : "Extra pack"} request · waiting for you`, type: "Request" });
  }
  moves.sort((a, b) => b.at.getTime() - a.at.getTime());

  // ─── What to do about it: simple rules, not AI ───────────────────────────────────────────────────────────
  const advice: Advice[] = [];
  const full = months.slice(2, 5); // the last 3 full months
  if (grant.creative > 0) {
    const over = full.filter((m) => teamUsed("creative", m) > grant.creative);
    if (over.length >= 2) {
      const next = packs.find((p) => p.creativeCredits > grant.creative);
      advice.push({ tone: "warn", text: `Creative ran over ${grant.creative} in ${over.length} of the last 3 months (${over.map((m) => `${monthName(m)} ${Math.round(teamUsed("creative", m))}`).join(", ")}).`, strong: next ? `Suggest ${next.name} at the next review instead of buying packs every month.` : "Suggest a bigger pack at the next review." });
    }
  }
  // AI use doubling: this month's forecast against last month, or last month against the one before.
  const aiNow = aiUsed(months[5]);
  const aiForecast = (aiNow / elapsed) * daysInMonth;
  const jumps = [
    { ratio: aiUsed(months[4]) > 0 ? aiForecast / aiUsed(months[4]) : 0, since: months[4] },
    { ratio: aiUsed(months[3]) > 0 ? aiUsed(months[4]) / aiUsed(months[3]) : 0, since: months[3] },
  ].sort((a, b) => b.ratio - a.ratio)[0];
  if (jumps.ratio >= 2) {
    const skill = topUses.ai[0]?.label;
    advice.push({ tone: "warn", text: `AI use ${jumps.ratio >= 2.8 ? "tripled" : "doubled"} since ${new Intl.DateTimeFormat("en-GB", { month: "long" }).format(jumps.since)}${skill ? ` (${skill})` : ""}. Auto top-up would avoid paused skills.` });
  }
  if (grant.pm > 0) {
    const used = full.map((m) => teamUsed("pm", m)).filter((u) => u > 0);
    if (used.length && used.every((u) => u <= grant.pm && u >= grant.pm * 0.5)) advice.push({ tone: "ok", text: `PM credits fit well: ${Math.round(Math.min(...used))}–${Math.round(Math.max(...used))} used of ${grant.pm}.` });
  }

  // ─── The contract, without prices ────────────────────────────────────────────────────────────────────────
  const [plan, pack] = c ? await Promise.all([prisma.platformPlan.findUnique({ where: { key: c.platformPlanKey } }), c.teamPackKey ? prisma.teamPack.findUnique({ where: { key: c.teamPackKey } }) : null]) : [null, null];
  const long = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
  const contractCard = c
    ? {
        pack: [plan?.name ?? c.platformPlanKey, c.teamPackKey ? `PM + creative ${c.pmCreditsPerMonth} + ${c.creativeCreditsPerMonth}` : "platform only"].join(" · "),
        term: `${long(c.startDate)} – ${long(new Date(c.endDate.getTime() - DAY))}`,
        notice: long(c.noticeDeadline),
        renewal: c.autoRenew ? `Automatic, ${c.termMonths} months` : "Ends at the term",
        rollover: c.teamPackKey ? `Up to ${Math.round(cap * 100)}% (PM ${Math.round(c.pmCreditsPerMonth * cap)}, creative ${Math.round(c.creativeCreditsPerMonth * cap)})` : null,
        services: services.length ? services.map((s) => `${s.name} · ${s.creditsPerMonth} creative`).join(", ") : "None",
        packName: pack?.name ?? null,
      }
    : null;

  return {
    balances,
    bars: { pm: bars((m) => teamUsed("pm", m)), creative: bars((m) => teamUsed("creative", m)), ai: bars(aiUsed) },
    grant,
    topUses,
    moves: moves.slice(0, 80),
    advice,
    contract: contractCard,
    contact,
    monthLabel: new Intl.DateTimeFormat("en-GB", { month: "long" }).format(now),
  };
}
export type CreditsTab = Awaited<ReturnType<typeof creditsTab>>;
