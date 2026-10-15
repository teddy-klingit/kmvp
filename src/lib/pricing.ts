import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/platform-settings";

/**
 * Phase S prices, in one place. EUR is the base: every list price is stored in EUR (PlatformPlan, TeamPack) and
 * converted with the staff-editable FX table as EUR × rate × (1 + markup), rounded to the nearest 5. Staff can
 * override any converted list price (PriceOverride). Term and upfront adjustments come from PlatformSetting.
 * Every number is a placeholder until pricing is decided. Never hardcode a price in UI code: read it from here.
 */

export const CURRENCIES = ["EUR", "SEK", "NOK", "GBP", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const TERMS = [3, 6, 12, 18] as const;
export type Term = (typeof TERMS)[number];
export const isCurrency = (c: unknown): c is Currency => CURRENCIES.includes(c as Currency);

export const round5 = (n: number) => Math.round(n / 5) * 5;

/** The FX rule: EUR × rate × (1 + markup), rounded to 5. EUR stays as it is. */
export function convertEur(eur: number, currency: Currency, perEur: Record<string, number>, markup: number) {
  if (currency === "EUR") return eur;
  const rate = perEur[currency];
  if (!rate) throw new Error(`No FX rate for ${currency}`);
  return round5(eur * rate * (1 + markup));
}

export async function loadPricing() {
  const [plans, packs, rates, overrides, termAdjustments, upfrontAdjustment, fxMarkup, creativePackSize, creativePackSurcharge, aiTopUp] = await Promise.all([
    prisma.platformPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.teamPack.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.fxRate.findMany(),
    prisma.priceOverride.findMany(),
    getSetting("termAdjustments"),
    getSetting("upfrontAdjustment"),
    getSetting("fxMarkup"),
    getSetting("creativePackSize"),
    getSetting("creativePackSurcharge"),
    getSetting("aiTopUp"),
  ]);
  const perEur = Object.fromEntries(rates.map((r) => [r.currency, r.perEur]));
  const override = new Map(overrides.map((o) => [`${o.ref}|${o.currency}`, o.amount]));
  /** A list price (before term adjustments) in a currency: the override if staff set one, else converted. */
  const list = (ref: string, eur: number, currency: Currency) => override.get(`${ref}|${currency}`) ?? convertEur(eur, currency, perEur, fxMarkup);
  return { plans, packs, perEur, fxMarkup, termAdjustments, upfrontAdjustment, creativePackSize, creativePackSurcharge, aiTopUp, list };
}
export type Pricing = Awaited<ReturnType<typeof loadPricing>>;

/** Term and payment adjustment as a factor (12 months, quarterly = 1). */
export function termFactor(p: Pick<Pricing, "termAdjustments" | "upfrontAdjustment">, term: number, upfront: boolean) {
  return (1 + (p.termAdjustments[String(term)] ?? 0)) * (upfront ? 1 + p.upfrontAdjustment : 1);
}

const roundFor = (currency: Currency, n: number) => (currency === "EUR" ? Math.round(n) : round5(n));

/**
 * The monthly price of a setup: platform + team pack (or Per request with staff-set credits and price), adjusted
 * for the term and upfront payment, in the contract's currency.
 */
export function monthlyPrice(p: Pricing, q: { planKey: string; packKey?: string | null; customTeamEur?: number | null; term: number; upfront?: boolean; currency: Currency }) {
  const plan = p.plans.find((x) => x.key === q.planKey);
  if (!plan) throw new Error(`Unknown platform plan ${q.planKey}`);
  const pack = q.packKey ? p.packs.find((x) => x.key === q.packKey) : null;
  if (q.packKey && !pack) throw new Error(`Unknown team pack ${q.packKey}`);
  const f = termFactor(p, q.term, Boolean(q.upfront));
  const platform = roundFor(q.currency, p.list(`plan:${plan.key}`, plan.priceEur, q.currency) * f);
  const teamBase = pack ? (pack.perRequest ? (q.customTeamEur != null ? convertEur(q.customTeamEur, q.currency, p.perEur, p.fxMarkup) : null) : pack.priceEur != null ? p.list(`pack:${pack.key}`, pack.priceEur, q.currency) : null) : 0;
  const team = teamBase == null ? null : roundFor(q.currency, teamBase * f);
  return { platform, team, total: team == null ? null : platform + team, currency: q.currency };
}

/**
 * One pack of extra creative credits: the client's pack's price per credit (team price ÷ all its credits) plus the
 * surcharge, × the pack size. With no pack (or Per request without a price), the most expensive per-credit pack.
 */
export function creativePackPrice(p: Pricing, packKey: string | null | undefined, currency: Currency) {
  const priced = p.packs.filter((x) => !x.perRequest && x.priceEur != null && x.pmCredits + x.creativeCredits > 0);
  const perCredit = (x: (typeof priced)[number]) => p.list(`pack:${x.key}`, x.priceEur!, currency) / (x.pmCredits + x.creativeCredits);
  const own = priced.find((x) => x.key === packKey);
  const base = own ? perCredit(own) : Math.max(...priced.map(perCredit));
  return { credits: p.creativePackSize, price: roundFor(currency, base * (1 + p.creativePackSurcharge) * p.creativePackSize) };
}

/** One top-up option (Phase U: 1,000 / 3,000 / 10,000 credits) in the client's currency. */
export function topUpOptionPrice(p: Pricing, o: { credits: number; priceEur: number }, currency: Currency) {
  return { credits: o.credits, price: roundFor(currency, convertEur(o.priceEur, currency, p.perEur, p.fxMarkup)) };
}

export function aiTopUpPrice(p: Pricing, currency: Currency) {
  return { credits: p.aiTopUp.credits, price: roundFor(currency, convertEur(p.aiTopUp.priceEur, currency, p.perEur, p.fxMarkup)) };
}

export function formatMoney(amount: number, currency: Currency) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}
