import { prisma } from "@/lib/prisma";
import { teamBalances } from "@/lib/team-ledger";
import { aiCreditStatus } from "@/lib/ai-credits";
import { platformStatus } from "@/lib/brand-completeness";
import { invoicePeriods } from "@/lib/invoicing";
import { getSetting } from "@/lib/platform-settings";
import type { OpsProject } from "@/lib/ops-exceptions";

/**
 * A client's Overview (Phase T, design PMClient): what's next (dated events and who they wait for), the projects
 * that need attention, three separate balances with their notes, account health as a word with reasons, and the
 * contract at a glance.
 */

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayMonth = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);

export type Meter = { label: string; left: number; of: number; note: string; tone: "ink" | "blue" | "purple"; warn?: boolean };
export type NextEvent = { at: Date; what: string; subject: string; waitsFor: string; soon: boolean };

/** `money`: invoices, payment status and prices; Admin only. A Marketing PM's view never has them. */
export async function clientOverview(clientId: string, projects: OpsProject[], now = new Date(), opts: { money?: boolean } = {}) {
  const money = Boolean(opts.money);
  const [client, contract, b, ai, pendingPacks, sentEstimates, planItems, overdueInvoices, lastPaid, skillRuns, owner, pmSetting] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, include: { brandOS: true } }),
    prisma.contract.findFirst({ where: { clientId, status: { in: ["active", "paused", "ending", "scheduled"] } }, orderBy: { startDate: "asc" } }),
    teamBalances(clientId, now),
    aiCreditStatus(clientId, now),
    prisma.purchaseRequest.findMany({ where: { clientId, status: "pending", kind: "creative_pack" }, select: { payload: true } }),
    prisma.estimate.findMany({ where: { status: "SENT", project: { clientId, status: { notIn: ["ARCHIVED", "DRAFT"] } } }, select: { pmCredits: true } }),
    prisma.clientCalendarItem.findMany({ where: { clientId, archivedAt: null, maker: "klingit_help", projectId: null, briefBy: { gte: startOfDay(now) } }, orderBy: { briefBy: "asc" }, take: 6 }),
    money ? prisma.invoice.count({ where: { clientId, status: "OVERDUE" } }) : 0,
    money ? prisma.invoice.findFirst({ where: { clientId, status: "PAID" }, orderBy: { paidAt: "desc" }, select: { paidAt: true } }) : null,
    prisma.aiCreditLedger.count({ where: { clientId, kind: "USAGE", sourceType: "skill", createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } }),
    prisma.clientUser.findFirst({ where: { clientId, permission: "OWNER" }, include: { user: { select: { name: true } } } }),
    getSetting("teamRolloverCap"),
  ]);
  const first = (n?: string | null) => (n ?? "the client").split(" ")[0];
  const contact = first(owner?.user.name);

  // ─── What's next ─────────────────────────────────────────────────────────
  const events: NextEvent[] = [];
  for (const i of planItems) events.push({ at: i.briefBy!, what: "Brief due", subject: i.title, waitsFor: "Client", soon: false });
  for (const p of projects) {
    const s = p.state;
    const eta = s.keyFacts.firstDraftEta;
    if (s.stage === "production" && eta && eta >= startOfDay(now)) events.push({ at: eta, what: "Send v1", subject: p.project.name, waitsFor: "You", soon: false });
    if (s.stage === "review" && p.project.dueDate && p.project.dueDate >= startOfDay(now)) events.push({ at: p.project.dueDate, what: "Client reviews", subject: p.project.name, waitsFor: contact, soon: false });
    else if (p.project.dueDate && p.project.dueDate >= startOfDay(now) && s.stage !== "review") events.push({ at: p.project.dueDate, what: "Delivery", subject: p.project.name, waitsFor: "Team", soon: false });
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  const next = events.slice(0, 7).map((e) => ({ ...e, soon: e.at.getTime() - now.getTime() < 2 * DAY }));

  // ─── Balances: three separate meters, never one mixed number ─────────────
  const meters: Meter[] = [];
  let rollover: string | null = null;
  if (b) {
    const held = sentEstimates.reduce((n, e) => n + (e.pmCredits ?? 0), 0);
    if (b.pm.monthly > 0 || b.pm.left) meters.push({ label: "Marketing PM", left: b.pm.left, of: b.pm.monthly || b.pm.left, note: `Used by you${held ? ` · ${held} held for open estimates` : ""}`, tone: "blue" });
    const elapsed = Math.max(1, (now.getTime() - new Date(now.getFullYear(), now.getMonth(), 1).getTime()) / DAY);
    const pace = b.creative.used / elapsed;
    const runsOut = pace > 0 && b.creative.left > 0 ? new Date(now.getTime() + (b.creative.left / pace) * DAY) : null;
    const requested = pendingPacks.reduce((n, r) => n + (((r.payload ?? {}) as { packs?: number }).packs ?? 1) * 10, 0);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    if (b.creative.monthly > 0 || b.creative.left) {
      const notes = [runsOut && runsOut < new Date(monthEnd.getTime() + 21 * DAY) ? `At this pace it runs out ~ ${dayMonth(runsOut)}` : "Lasts the month at this pace", requested ? `+${requested} requested` : null, b.creative.services ? `${b.creative.services} reserved for fixed services` : null].filter(Boolean);
      meters.push({ label: "Creative team", left: b.creative.left, of: b.creative.monthly || b.creative.left, note: notes.join(" · "), tone: "ink", warn: Boolean(runsOut && runsOut < monthEnd) });
    }
    const carried = b.pm.carried + b.creative.carried;
    const prev = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    rollover = `Rollover up to ${Math.round(pmSetting * 100)}% · ${carried ? `${Math.round(carried)} credits rolled over from ${prev}` : "nothing rolled over this month"}`;
  }
  if (!ai.ownModel) meters.push({ label: "AI", left: ai.left, of: ai.allowance || ai.left, note: `Skills run by ${contact}'s team · resets ${dayMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1))}`, tone: "purple" });

  // ─── Account health: a word, with reasons (what's happening now, not a stored score) ─
  const warnings: string[] = [];
  const waiting = projects.flatMap((p) => p.exceptions.filter((e) => e.kind === "client_waiting")).sort((x, y) => x.since.getTime() - y.since.getTime())[0];
  if (waiting) {
    const d = Math.max(1, Math.floor((now.getTime() - waiting.since.getTime()) / DAY));
    warnings.push(`A message has waited ${d} day${d === 1 ? "" : "s"}`);
  }
  const overdue = projects.filter((p) => p.project.dueDate && p.project.dueDate < startOfDay(now) && p.state.stage !== "closed").length;
  if (overdue) warnings.push(`${overdue} project${overdue === 1 ? " is" : "s are"} past due`);
  if (overdueInvoices) warnings.push(`${overdueInvoices} invoice${overdueInvoices === 1 ? " is" : "s are"} overdue`);
  if (projects.some((p) => p.exceptions.some((e) => e.kind === "failed_agent"))) warnings.push("An agent run failed");
  const creativeMeter = meters.find((m) => m.label === "Creative team");
  if (creativeMeter?.warn) warnings.push("Creative credits run out before the month ends");
  if (contract && contract.autoRenew && contract.noticeDeadline >= now && contract.noticeDeadline.getTime() - now.getTime() <= 30 * DAY) warnings.push(`Notice deadline ${dayMonth(contract.noticeDeadline)}`);
  if (!contract && client.renewalDate && Math.abs(client.renewalDate.getTime() - now.getTime()) <= 30 * DAY) warnings.push(client.renewalDate < now ? "Renewal date passed on an old plan" : `Renews ${dayMonth(client.renewalDate)} on an old plan`);
  const brand = platformStatus({ brandSummary: client.brandSummary, brandOS: client.brandOS });
  const ticks = [
    `Brand OS ${brand.done} of 8 sections`,
    lastPaid?.paidAt ? `Invoices paid · last ${dayMonth(lastPaid.paidAt)}` : null,
    skillRuns ? `Uses the platform weekly · ${skillRuns} skill runs this month` : null,
  ].filter((x): x is string => Boolean(x));
  if (brand.done < 3) warnings.push("Brand OS mostly unwritten");
  // At risk: work or money is late, or a lot at once. Needs attention: three things. Otherwise Good.
  const word = overdue >= 2 || overdueInvoices > 0 || warnings.length >= 4 ? "At risk" : warnings.length === 3 ? "Needs attention" : "Good";

  // ─── Contract ────────────────────────────────────────────────────────────
  let contractCard: { perMonth: string | null; pack: string | null; term: string; notice: string; renews: string | null; nextInvoice: string | null } | null = null;
  if (contract) {
    const fmt = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: contract.currency, maximumFractionDigits: 0 }).format(n);
    const periods = invoicePeriods(contract);
    const nextP = periods.find((p) => p.start > now);
    const q = (d: Date) => (contract.invoicing === "quarterly" ? ` · Q${Math.floor(d.getMonth() / 3) + 1}` : "");
    const last = new Date(contract.endDate.getTime() - DAY);
    contractCard = {
      perMonth: money ? `${fmt(contract.platformPrice + contract.teamPrice)} (${fmt(contract.platformPrice)} + ${fmt(contract.teamPrice)})` : null,
      pack: money ? null : contract.teamPackKey ? `PM ${contract.pmCreditsPerMonth} · creative ${contract.creativeCreditsPerMonth} a month` : "Platform only",
      renews: money ? null : contract.autoRenew ? `Yes, for ${contract.termMonths} months` : "No",
      term: `${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(contract.startDate)} – ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(last)}`,
      notice: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(contract.noticeDeadline),
      nextInvoice: money ? (nextP ? `${dayMonth(nextP.start)}${q(nextP.start)}` : "End of term") : null,
    };
  }

  return { next, meters, rollover, health: { word, warnings, ticks, fix: warnings.length }, contract: contractCard, oldPlan: !contract };
}
