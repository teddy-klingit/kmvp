import type { Contract, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { notifyMany } from "@/lib/notifier";
import { isCurrency, loadPricing, monthlyPrice, TERMS, type Currency } from "@/lib/pricing";

/**
 * Contracts (Phase S step 4). The rules, as Klingit sells them:
 *  - one active contract per client (paused and ending count as active); ended ones stay as history;
 *  - platform and team prices are locked at signing, in the contract's currency;
 *  - it renews automatically for the same term unless cancelled by the notice deadline (end date − 2 months);
 *  - upgrade: 7 days' notice, lasts at least 3 months, priced at the upgrade length's rate, then goes back;
 *  - downgrade: at most once a month, with a month's notice (from the first of the month after);
 *  - pause (staff only): the platform stays, ordering projects stops; the end date moves by the pause's length;
 *  - a team pack needs Enterprise and a named contact person (the Marketing PM).
 * Every change is a ContractChange row and an AuditLog entry. Scheduled changes apply when due (applyDueChanges),
 * from the hourly scheduler and whenever a contract is read.
 */

const DAY = 86400000;
export const LIVE_STATUSES = ["active", "paused", "ending"];
export type Invoicing = "monthly" | "quarterly" | "upfront";

export class ContractError extends Error {}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** A local calendar day, YYYY-MM-DD (dates are local midnights). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function addMonths(d: Date, n: number) {
  const r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate(), d.getHours(), d.getMinutes());
  // 31 Jan + 1 month → 28/29 Feb, not 3 Mar.
  if (r.getDate() !== d.getDate()) r.setDate(0);
  return r;
}
export const noticeDeadlineFor = (end: Date) => addMonths(end, -2);
/** 3-month terms are invoiced monthly; longer ones quarterly (or upfront if chosen). */
export const defaultInvoicing = (term: number): Invoicing => (term <= 3 ? "monthly" : "quarterly");

type Terms = { platformPlanKey: string; teamPackKey: string | null; pmCreditsPerMonth: number; creativeCreditsPerMonth: number; platformPrice: number; teamPrice: number };
const termsOf = (c: Pick<Contract, keyof Terms>): Terms => ({ platformPlanKey: c.platformPlanKey, teamPackKey: c.teamPackKey, pmCreditsPerMonth: c.pmCreditsPerMonth, creativeCreditsPerMonth: c.creativeCreditsPerMonth, platformPrice: c.platformPrice, teamPrice: c.teamPrice });

async function audit(clientId: string, actorUserId: string | null, action: string, before: unknown, after: unknown) {
  await prisma.auditLog.create({ data: { clientId, actorUserId, area: "contract", action, before: (before ?? undefined) as Prisma.InputJsonValue, after: (after ?? undefined) as Prisma.InputJsonValue } });
}

export async function liveContract(clientId: string, now = new Date()) {
  const c = await prisma.contract.findFirst({ where: { clientId, status: { in: LIVE_STATUSES } }, orderBy: { startDate: "desc" } });
  if (!c) return null;
  await applyDueChanges(c.id, now);
  return prisma.contract.findUnique({ where: { id: c.id }, include: { contact: { include: { user: { select: { id: true, name: true, email: true } } } }, changes: { orderBy: { createdAt: "desc" } } } });
}

/** Ordering projects stops while a contract is paused (the platform keeps working). */
export async function ordersPaused(clientId: string) {
  return Boolean(await prisma.contract.findFirst({ where: { clientId, status: "paused" }, select: { id: true } }));
}
export const PAUSED_MESSAGE = "Your contract with Klingit is paused, so new projects can't be ordered right now. Everything else keeps working. Talk to your Marketing PM to restart.";

/** Resolves a pack (or Per request) to credits and the locked monthly prices, at a term's rate. */
async function priceTerms(q: { platformPlanKey: string; teamPackKey: string | null; custom?: { pmCredits: number; creativeCredits: number; teamEur: number } | null; termMonths: number; invoicing: Invoicing; currency: Currency }): Promise<Terms> {
  const p = await loadPricing();
  const plan = p.plans.find((x) => x.key === q.platformPlanKey);
  if (!plan) throw new ContractError("Pick a platform plan.");
  const pack = q.teamPackKey ? p.packs.find((x) => x.key === q.teamPackKey) : null;
  if (q.teamPackKey && !pack) throw new ContractError("That team pack doesn't exist.");
  if (pack && pack.requiresPlanKey !== plan.key) throw new ContractError(`A team pack needs the ${p.plans.find((x) => x.key === pack.requiresPlanKey)?.name ?? pack.requiresPlanKey} platform plan.`);
  if (pack?.perRequest && !q.custom) throw new ContractError("Per request needs its credits and price.");
  const price = monthlyPrice(p, { planKey: plan.key, packKey: pack?.key ?? null, customTeamEur: q.custom?.teamEur ?? null, term: q.termMonths, upfront: q.invoicing === "upfront", currency: q.currency });
  return {
    platformPlanKey: plan.key,
    teamPackKey: pack?.key ?? null,
    pmCreditsPerMonth: pack ? (pack.perRequest ? q.custom!.pmCredits : pack.pmCredits) : 0,
    creativeCreditsPerMonth: pack ? (pack.perRequest ? q.custom!.creativeCredits : pack.creativeCredits) : 0,
    platformPrice: price.platform,
    teamPrice: price.team ?? 0,
  };
}

export type NewContract = {
  clientId: string;
  platformPlanKey: string;
  teamPackKey?: string | null;
  custom?: { pmCredits: number; creativeCredits: number; teamEur: number } | null;
  termMonths: number;
  startDate: Date;
  invoicing?: Invoicing;
  currency: string;
  contactStaffId?: string | null;
  /** Staff may set prices by hand (e.g. a migrated client keeps their signed team price). */
  priceOverride?: { platformPrice?: number; teamPrice?: number } | null;
};

export async function createContract(input: NewContract, actorUserId: string | null) {
  if (!TERMS.includes(input.termMonths as (typeof TERMS)[number])) throw new ContractError("The term is 3, 6, 12 or 18 months.");
  if (!isCurrency(input.currency)) throw new ContractError("Pick a currency.");
  if (await prisma.contract.findFirst({ where: { clientId: input.clientId, status: { in: LIVE_STATUSES } }, select: { id: true } })) throw new ContractError("This client already has a contract. Amend or end it first.");
  const invoicing = input.invoicing ?? defaultInvoicing(input.termMonths);
  const terms = await priceTerms({ platformPlanKey: input.platformPlanKey, teamPackKey: input.teamPackKey ?? null, custom: input.custom, termMonths: input.termMonths, invoicing, currency: input.currency });
  if (terms.teamPackKey && !input.contactStaffId) throw new ContractError("A team pack needs a contact person (the client's Marketing PM).");
  if (input.priceOverride?.platformPrice != null) terms.platformPrice = input.priceOverride.platformPrice;
  if (input.priceOverride?.teamPrice != null) terms.teamPrice = input.priceOverride.teamPrice;
  const startDate = startOfDay(input.startDate);
  const endDate = addMonths(startDate, input.termMonths);
  const contract = await prisma.contract.create({
    data: { clientId: input.clientId, ...terms, termMonths: input.termMonths, startDate, endDate, invoicing, currency: input.currency, noticeDeadline: noticeDeadlineFor(endDate), contactStaffId: input.contactStaffId ?? null, createdByUserId: actorUserId, changes: { create: { kind: "created", effectiveFrom: startDate, after: { ...terms, termMonths: input.termMonths, invoicing, currency: input.currency } as Prisma.InputJsonValue, byUserId: actorUserId } } },
  });
  if (input.contactStaffId) await prisma.client.update({ where: { id: input.clientId }, data: { accountLeadId: input.contactStaffId } });
  await audit(input.clientId, actorUserId, "contract created", null, { ...terms, termMonths: input.termMonths, startDate, endDate, invoicing, currency: input.currency, contactStaffId: input.contactStaffId ?? null });
  return contract;
}

/** The Marketing PM: logged, and the client's admins are told. Required while there's a team pack. */
export async function setContact(contractId: string, staffId: string | null, actorUserId: string | null) {
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { contact: { include: { user: true } } } });
  if (!staffId && c.teamPackKey) throw new ContractError("A client with a team pack needs a contact person.");
  const next = staffId ? await prisma.staffMember.findUnique({ where: { id: staffId }, include: { user: true } }) : null;
  if (staffId && !next) throw new ContractError("That person isn't on the team.");
  await prisma.contract.update({ where: { id: c.id }, data: { contactStaffId: staffId } });
  await prisma.contractChange.create({ data: { contractId: c.id, kind: "contact", effectiveFrom: new Date(), before: { contactStaffId: c.contactStaffId }, after: { contactStaffId: staffId }, byUserId: actorUserId } });
  if (staffId) await prisma.client.update({ where: { id: c.clientId }, data: { accountLeadId: staffId } });
  await audit(c.clientId, actorUserId, "contact person changed", { contactStaffId: c.contactStaffId, name: c.contact?.user.name ?? null }, { contactStaffId: staffId, name: next?.user.name ?? null });
  if (next) {
    const admins = await prisma.clientUser.findMany({ where: { clientId: c.clientId, permission: "OWNER" }, select: { userId: true } });
    await notifyMany(admins.map((a) => ({ userId: a.userId, clientId: c.clientId, type: "SYSTEM" as const, title: `${next.user.name} is your Marketing PM`, body: "Your contact at Klingit for plans, briefs and the work. Message them any time.", actionUrl: "/settings/plan", actionLabel: "See your plan" })));
  }
}

const credits = (t: Pick<Terms, "pmCreditsPerMonth" | "creativeCreditsPerMonth">) => t.pmCreditsPerMonth + t.creativeCreditsPerMonth;

/**
 * Upgrade: starts 7 days from now, lasts `months` (at least 3), priced at that length's rate (a 3-month upgrade on a
 * 12-month contract pays the 3-month rate for the new pack), then goes back to the contract's own terms.
 */
export async function scheduleUpgrade(contractId: string, q: { teamPackKey: string; platformPlanKey?: string; months: number; custom?: NewContract["custom"] }, actorUserId: string | null, now = new Date()) {
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  if (c.status !== "active") throw new ContractError("Only an active contract can be upgraded.");
  if (q.months < 3 || !TERMS.includes(q.months as (typeof TERMS)[number])) throw new ContractError("An upgrade lasts at least 3 months (3, 6, 12 or 18).");
  const after = await priceTerms({ platformPlanKey: q.platformPlanKey ?? c.platformPlanKey, teamPackKey: q.teamPackKey, custom: q.custom, termMonths: q.months, invoicing: "monthly", currency: c.currency as Currency });
  if (credits(after) <= credits(c)) throw new ContractError("That's not an upgrade: pick a bigger pack, or downgrade instead.");
  if (!c.contactStaffId) throw new ContractError("Set the client's contact person first.");
  const effectiveFrom = startOfDay(new Date(now.getTime() + 7 * DAY));
  const change = await prisma.contractChange.create({ data: { contractId, kind: "upgrade", status: "scheduled", createdAt: now, effectiveFrom, until: addMonths(effectiveFrom, q.months), before: termsOf(c) as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue, byUserId: actorUserId } });
  await audit(c.clientId, actorUserId, `upgrade scheduled from ${dayKey(effectiveFrom)} for ${q.months} months`, termsOf(c), after);
  return change;
}

/** Downgrade: once a month at most, with a month's notice: it applies on the first of the month after that. */
export async function scheduleDowngrade(contractId: string, q: { teamPackKey: string | null; custom?: NewContract["custom"] }, actorUserId: string | null, now = new Date()) {
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  if (c.status !== "active") throw new ContractError("Only an active contract can be downgraded.");
  const recent = await prisma.contractChange.findFirst({ where: { contractId, kind: "downgrade", status: { not: "cancelled" }, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } });
  if (recent) throw new ContractError("One downgrade a month: the last one was asked for less than a month ago.");
  const after = await priceTerms({ platformPlanKey: c.platformPlanKey, teamPackKey: q.teamPackKey, custom: q.custom, termMonths: c.termMonths, invoicing: c.invoicing as Invoicing, currency: c.currency as Currency });
  if (credits(after) >= credits(c)) throw new ContractError("That's not a downgrade: pick a smaller pack, or upgrade instead.");
  const notice = addMonths(now, 1);
  const effectiveFrom = new Date(notice.getFullYear(), notice.getMonth() + 1, 1);
  const change = await prisma.contractChange.create({ data: { contractId, kind: "downgrade", status: "scheduled", createdAt: now, effectiveFrom, before: termsOf(c) as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue, byUserId: actorUserId } });
  await audit(c.clientId, actorUserId, `downgrade scheduled from ${dayKey(effectiveFrom)}`, termsOf(c), after);
  return change;
}

export async function pauseContract(contractId: string, actorUserId: string | null, note: string | null, now = new Date()) {
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  if (c.status !== "active") throw new ContractError("Only an active contract can be paused.");
  await prisma.contract.update({ where: { id: c.id }, data: { status: "paused", pausedFrom: now } });
  await prisma.contractChange.create({ data: { contractId, kind: "pause", effectiveFrom: now, note, byUserId: actorUserId } });
  await audit(c.clientId, actorUserId, "contract paused", { status: c.status }, { status: "paused", note });
}

/** Restart: the end date (and the notice deadline) move by the pause's length. */
export async function resumeContract(contractId: string, actorUserId: string | null, now = new Date()) {
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  if (c.status !== "paused" || !c.pausedFrom) throw new ContractError("This contract isn't paused.");
  const days = Math.max(0, Math.round((startOfDay(now).getTime() - startOfDay(c.pausedFrom).getTime()) / DAY));
  const endDate = new Date(c.endDate.getTime() + days * DAY);
  await prisma.contract.update({ where: { id: c.id }, data: { status: c.cancelledAt ? "ending" : "active", pausedFrom: null, pausedDays: c.pausedDays + days, endDate, noticeDeadline: noticeDeadlineFor(endDate) } });
  await prisma.contractChange.create({ data: { contractId, kind: "resume", effectiveFrom: now, before: { endDate: c.endDate }, after: { endDate, pausedDays: days }, byUserId: actorUserId } });
  await audit(c.clientId, actorUserId, `contract resumed after ${days} days`, { endDate: c.endDate }, { endDate });
}

/** Cancel: allowed until the notice deadline; the contract then ends on its end date instead of renewing. */
export async function cancelContract(contractId: string, actorUserId: string | null, now = new Date()) {
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  if (!["active", "paused"].includes(c.status)) throw new ContractError("This contract is already ending.");
  if (now > c.noticeDeadline) throw new ContractError(`The notice deadline was ${dayKey(c.noticeDeadline)}: it renews on ${dayKey(c.endDate)}. Cancel after that for the following term, or end it now.`);
  await prisma.contract.update({ where: { id: c.id }, data: { status: c.status === "paused" ? "paused" : "ending", cancelledAt: now, autoRenew: false } });
  await prisma.contractChange.create({ data: { contractId, kind: "cancelled", effectiveFrom: c.endDate, byUserId: actorUserId } });
  await audit(c.clientId, actorUserId, "contract cancelled (ends on its end date)", { status: c.status }, { status: "ending", endDate: c.endDate });
}

/** Staff end a contract now (case by case). */
export async function endContract(contractId: string, actorUserId: string | null, note: string | null, now = new Date()) {
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  if (c.status === "ended") return;
  await prisma.contract.update({ where: { id: c.id }, data: { status: "ended", endDate: now < c.endDate ? now : c.endDate, autoRenew: false } });
  await prisma.contractChange.create({ data: { contractId, kind: "ended", effectiveFrom: now, note, byUserId: actorUserId } });
  await audit(c.clientId, actorUserId, "contract ended", { status: c.status, endDate: c.endDate }, { status: "ended", note });
}

/**
 * Applies what's due: scheduled upgrades and downgrades, an upgrade's end (back to the contract's own terms), and
 * the end of the term (renew for the same term, or end if it was cancelled). Paused contracts wait.
 */
export async function applyDueChanges(contractId: string, now = new Date()) {
  let c = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!c || c.status === "ended") return;
  const due = await prisma.contractChange.findMany({ where: { contractId, status: "scheduled", effectiveFrom: { lte: now } }, orderBy: { effectiveFrom: "asc" } });
  for (const ch of due) {
    await prisma.contract.update({ where: { id: c.id }, data: ch.after as Terms });
    await prisma.contractChange.update({ where: { id: ch.id }, data: { status: "applied" } });
    await audit(c.clientId, null, `${ch.kind} applied`, ch.before, ch.after);
  }
  const ended = await prisma.contractChange.findMany({ where: { contractId, kind: "upgrade", status: "applied", until: { lte: now } } });
  for (const ch of ended) {
    await prisma.contract.update({ where: { id: c.id }, data: ch.before as Terms });
    await prisma.contractChange.update({ where: { id: ch.id }, data: { status: "finished" } });
    await prisma.contractChange.create({ data: { contractId, kind: "upgrade ended", effectiveFrom: ch.until!, before: ch.after as Prisma.InputJsonValue, after: ch.before as Prisma.InputJsonValue } });
    await audit(c.clientId, null, "upgrade ended", ch.after, ch.before);
  }
  c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  while (c.status !== "paused" && now >= c.endDate) {
    if (c.status === "ending" || !c.autoRenew) {
      await prisma.contract.update({ where: { id: c.id }, data: { status: "ended" } });
      await prisma.contractChange.create({ data: { contractId, kind: "ended", effectiveFrom: c.endDate, note: "Cancelled before the notice deadline" } });
      await audit(c.clientId, null, "contract ended at its end date", null, { endDate: c.endDate });
      return;
    }
    const startDate: Date = c.endDate;
    const endDate: Date = addMonths(startDate, c.termMonths);
    c = await prisma.contract.update({ where: { id: c.id }, data: { startDate, endDate, noticeDeadline: noticeDeadlineFor(endDate) } });
    await prisma.contractChange.create({ data: { contractId, kind: "renewed", effectiveFrom: startDate, after: { startDate, endDate } as Prisma.InputJsonValue, note: `Renewed for ${c.termMonths} months` } });
    await audit(c.clientId, null, `renewed for ${c.termMonths} months`, null, { startDate, endDate });
  }
}

/** Every live contract, for the hourly scheduler. */
export async function applyAllDueChanges(now = new Date()) {
  const ids = await prisma.contract.findMany({ where: { status: { in: LIVE_STATUSES } }, select: { id: true } });
  for (const { id } of ids) await applyDueChanges(id, now);
  return ids.length;
}

/** Renewals (Billing): live contracts that will renew, soonest notice deadline first; orange from 30 days before it. */
export async function renewals(now = new Date()) {
  const rows = await prisma.contract.findMany({ where: { status: { in: ["active", "paused"] }, autoRenew: true }, include: { client: { select: { id: true, name: true } }, contact: { include: { user: { select: { name: true } } } } }, orderBy: { noticeDeadline: "asc" } });
  return rows.map((c) => ({ contract: c, daysToNotice: Math.ceil((c.noticeDeadline.getTime() - now.getTime()) / DAY), urgent: c.noticeDeadline.getTime() - now.getTime() <= 30 * DAY }));
}
