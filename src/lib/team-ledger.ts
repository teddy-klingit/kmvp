import type { Contract } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/platform-settings";

/**
 * Team credits on a contract (Phase S step 5): two balances, PM and creative, granted, used, rolled over and reported
 * separately (never pooled). On the first of each month (quarterly contracts too):
 *  1. what's left over the rollover cap expires: after the grant a balance is at most teamRolloverCap × the monthly
 *     amount (placeholder 150%), so up to half a month carries over;
 *  2. the month's credits are granted;
 *  3. fixed-credit services (Performance, the web retainer…) reserve their credits from the creative balance.
 * Every row has a period key, so running a month twice changes nothing. Paused months get no grant.
 * Clients without a contract keep the earlier single-balance behaviour until they're migrated.
 */

export type Pool = "pm" | "creative";
export const POOLS: Pool[] = ["pm", "creative"];
const LIVE = ["active", "paused", "ending"];

export const periodKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const nextMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
const round = (n: number) => Math.round(n * 100) / 100 || 0;

export async function contractFor(clientId: string) {
  return prisma.contract.findFirst({ where: { clientId, status: { in: LIVE } }, orderBy: { startDate: "desc" } });
}

export const monthlyFor = (c: Pick<Contract, "pmCreditsPerMonth" | "creativeCreditsPerMonth">, pool: Pool) => (pool === "pm" ? c.pmCreditsPerMonth : c.creativeCreditsPerMonth);

/**
 * Where a client's contract ledger starts: its first term's start date. Rows before it belong to the earlier
 * single-balance model and never count against the PM and creative balances.
 */
export async function ledgerSince(clientId: string) {
  const c = await contractFor(clientId);
  if (!c) return null;
  const created = await prisma.contractChange.findFirst({ where: { contractId: c.id, kind: "created" }, select: { effectiveFrom: true } });
  return created?.effectiveFrom ?? c.startDate;
}

export async function poolBalance(clientId: string, pool: Pool, before?: Date) {
  const since = await ledgerSince(clientId);
  const createdAt = { ...(since ? { gte: since } : {}), ...(before ? { lt: before } : {}) };
  const r = await prisma.creditLedgerEntry.aggregate({ where: { clientId, pool, ...(since || before ? { createdAt } : {}) }, _sum: { amount: true } });
  return round(r._sum.amount ?? 0);
}

async function write(clientId: string, pool: Pool, data: { type: "ALLOWANCE" | "EXPIRY" | "SERVICE"; amount: number; note: string; periodKey: string; serviceId?: string | null; createdAt: Date }) {
  const balance = await poolBalance(clientId, pool);
  try {
    // serviceId is "" (not null) on grants and expiries: SQLite treats nulls as distinct in a unique index, so only a
    // value makes the (client, pool, type, period, service) key stop a second, concurrent grant.
    await prisma.creditLedgerEntry.create({ data: { clientId, pool, ...data, serviceId: data.serviceId ?? "", balanceAfter: round(balance + data.amount) } });
  } catch {
    // Already written for this period (unique key): a second run changes nothing.
  }
}

/** One month for one contract: expiry over the cap, the grant, then the services. Idempotent. */
export async function grantMonth(contract: Contract, month: Date) {
  const start = monthStart(month);
  const key = periodKey(start);
  if (contract.status === "paused" && contract.pausedFrom && contract.pausedFrom <= start) return;
  if (contract.startDate >= nextMonth(start) || contract.endDate <= start) return;
  const cap = await getSetting("teamRolloverCap");
  for (const pool of POOLS) {
    const monthly = monthlyFor(contract, pool);
    if (monthly <= 0) continue;
    const granted = await prisma.creditLedgerEntry.findFirst({ where: { clientId: contract.clientId, pool, type: "ALLOWANCE", periodKey: key }, select: { id: true } });
    if (granted) continue;
    const carry = await poolBalance(contract.clientId, pool, start);
    const carryMax = Math.max(0, cap * monthly - monthly);
    if (carry > carryMax) await write(contract.clientId, pool, { type: "EXPIRY", amount: -round(carry - carryMax), note: `Over the ${Math.round(cap * 100)}% rollover cap: expired`, periodKey: key, createdAt: start });
    await write(contract.clientId, pool, { type: "ALLOWANCE", amount: monthly, note: `${pool === "pm" ? "PM" : "Creative"} credits · ${key}`, periodKey: key, createdAt: start });
  }
  const services = await prisma.serviceAllocation.findMany({ where: { clientId: contract.clientId, outsidePack: false, endedAt: null, startDate: { lt: nextMonth(start) } } });
  for (const s of services) {
    const sStart = monthStart(s.startDate);
    const sEnd = new Date(sStart.getFullYear(), sStart.getMonth() + s.months, 1);
    if (start < sStart || start >= sEnd) continue;
    await write(contract.clientId, "creative", { type: "SERVICE", amount: -s.creditsPerMonth, note: `${s.name} · fixed monthly service`, periodKey: key, serviceId: s.id, createdAt: start });
  }
}

/** Every month from the contract's start to now, so a balance is always up to date when it's read. */
export async function ensureGrants(clientId: string, now = new Date()) {
  const c = await contractFor(clientId);
  if (!c) return null;
  for (let m = monthStart(c.startDate); m <= now; m = nextMonth(m)) await grantMonth(c, m);
  return c;
}

export async function ensureAllGrants(now = new Date()) {
  const ids = await prisma.contract.findMany({ where: { status: { in: LIVE } }, select: { clientId: true } });
  for (const { clientId } of ids) await ensureGrants(clientId, now);
  return ids.length;
}

/**
 * How a balance reads everywhere ("31 left of 40"): left of the monthly amount, as on the pricing page; what was
 * carried over, bought or reserved for fixed services is named next to it. Without a monthly amount (packs only),
 * left of what's available.
 */
export function poolOf(p: PoolState) {
  return p.monthly > 0 ? p.monthly : Math.max(0, p.carried + p.purchased - p.services);
}
export function poolNotes(p: PoolState) {
  return [p.carried ? `${Math.round(p.carried * 10) / 10} carried over` : null, p.purchased ? `${Math.round(p.purchased * 10) / 10} bought` : null, p.services ? `${Math.round(p.services * 10) / 10} reserved for fixed services` : null].filter((x): x is string => Boolean(x));
}

export type PoolState = { monthly: number; granted: number; carried: number; purchased: number; used: number; services: number; expired: number; left: number };

/** This month per balance: carried in, granted, bought, used (approved estimates), reserved by services, left. */
export async function teamBalances(clientId: string, now = new Date()) {
  const contract = await ensureGrants(clientId, now);
  if (!contract) return null;
  const since = await ledgerSince(clientId);
  const start = since && since > monthStart(now) ? since : monthStart(now);
  const rows = await prisma.creditLedgerEntry.findMany({ where: { clientId, createdAt: { gte: start } } });
  const services = await prisma.serviceAllocation.findMany({ where: { clientId, endedAt: null } });
  const state = async (pool: Pool): Promise<PoolState> => {
    const mine = rows.filter((r) => r.pool === pool);
    const sum = (t: string) => round(mine.filter((r) => r.type === t).reduce((n, r) => n + r.amount, 0));
    return {
      monthly: monthlyFor(contract, pool),
      granted: sum("ALLOWANCE"),
      carried: round(Math.max(0, (await poolBalance(clientId, pool, start)) + sum("EXPIRY"))),
      purchased: round(sum("PURCHASE") + sum("ADJUSTMENT")),
      used: round(-sum("CONSUMPTION")),
      services: round(-sum("SERVICE")),
      expired: round(-sum("EXPIRY")),
      left: await poolBalance(clientId, pool),
    };
  };
  return {
    contract,
    pm: await state("pm"),
    creative: await state("creative"),
    services: services.map((s) => ({ id: s.id, name: s.name, creditsPerMonth: s.creditsPerMonth, outsidePack: s.outsidePack, until: new Date(s.startDate.getFullYear(), s.startDate.getMonth() + s.months, 1) })),
  };
}

/**
 * Active projects at once on a contract: one per creativeCreditsPerSlot creative credits (placeholder 10), at least
 * one for a PM-only pack or a one-off client, plus extra slots bought.
 */
export async function slotsForContract(c: Pick<Contract, "creativeCreditsPerMonth" | "pmCreditsPerMonth" | "extraSlots">) {
  const per = await getSetting("creativeCreditsPerSlot");
  return Math.max(1, Math.floor(c.creativeCreditsPerMonth / per)) + c.extraSlots;
}

/** Which balance a line draws on: PM lines fall back to creative when the client has no PM balance (one-off work). */
export async function poolFor(clientId: string, balance: string): Promise<Pool> {
  if (balance !== "pm") return "creative";
  const c = await contractFor(clientId);
  return c && c.pmCreditsPerMonth > 0 ? "pm" : "creative";
}
