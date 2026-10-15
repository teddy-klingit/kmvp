import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/platform-settings";
import { loadPricing, topUpOptionPrice, isCurrency, type Currency } from "@/lib/pricing";
import { liveContract } from "@/lib/contracts";
import { createRequest } from "@/lib/requests";

/**
 * AI credit top-ups (Phase U): options with how long each lasts at the client's pace, automatic top-ups, what
 * happens at 100% (pause, or keep running and bill the overage at the top-up rate). All rules are staff settings;
 * every credit change goes through the ledger (and the request log for top-ups).
 */

const DAY = 86400000;

export async function clientCurrency(clientId: string): Promise<Currency> {
  const c = await liveContract(clientId);
  return c && isCurrency(c.currency) ? c.currency : "EUR";
}

/** "pause" or "bill" at 100% for this client (their setting, else the staff default). */
export async function overageMode(clientId: string) {
  const p = await prisma.billingProfile.findUnique({ where: { clientId }, select: { aiOverage: true } });
  return (p?.aiOverage === "bill" || p?.aiOverage === "pause" ? p.aiOverage : await getSetting("aiAt100")) as "pause" | "bill";
}

/** The options with their price and "about 2 weeks at your pace". */
export async function topUpOptions(clientId: string, usedThisMonth: number, now = new Date()) {
  const [options, pricing, currency] = await Promise.all([getSetting("aiTopUpOptions"), loadPricing(), clientCurrency(clientId)]);
  const elapsed = Math.max(1, (now.getTime() - new Date(now.getFullYear(), now.getMonth(), 1).getTime()) / DAY);
  const perDay = usedThisMonth / elapsed;
  const base = options[0] ? options[0].priceEur / options[0].credits : 0;
  return options.map((o, i) => {
    const q = topUpOptionPrice(pricing, o, currency);
    const days = perDay > 0 ? o.credits / perDay : null;
    const lasts = days == null ? "Lasts as long as you need" : days < 10 ? `About ${Math.max(1, Math.round(days))} days at your pace` : days < 24 ? `About ${Math.round(days / 7)} weeks at your pace` : days < 45 ? "About a month at your pace" : `About ${Math.round(days / 30)} months at your pace`;
    const save = base > 0 ? Math.round((1 - o.priceEur / o.credits / base) * 100) : 0;
    return { index: i, credits: o.credits, price: q.price, currency, lasts, save: save > 0 ? save : 0 };
  });
}

/** Automatic top-up after a charge: below the threshold, at most N a month, within the monthly cap. */
export async function maybeAutoTopUp(clientId: string, left: number, now = new Date()) {
  const profile = await prisma.billingProfile.findUnique({ where: { clientId }, select: { autoTopUp: true } });
  if (!profile?.autoTopUp) return null;
  const rule = await getSetting("autoTopUpRule");
  if (left >= rule.below) return null;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const done = (await prisma.purchaseRequest.findMany({ where: { clientId, kind: "ai_topup", createdAt: { gte: monthStart } }, select: { payload: true } })).filter((r) => (r.payload as { auto?: boolean }).auto).length;
  if (done >= rule.maxPerMonth) return null;
  try {
    return await createRequest(clientId, null, "ai_topup", { option: rule.option, auto: true }, now);
  } catch {
    return null; // over the monthly cap: the client is told by the 100% notice instead
  }
}

/** Overage at the top-up rate, on one running line for the next invoice ("keep running, bill overage"). */
export async function billOverage(clientId: string, credits: number) {
  if (credits <= 0) return;
  const [options, pricing, currency] = await Promise.all([getSetting("aiTopUpOptions"), loadPricing(), clientCurrency(clientId)]);
  const unit = topUpOptionPrice(pricing, options[0], currency);
  const perCredit = unit.price / unit.credits;
  const open = await prisma.billingItem.findFirst({ where: { clientId, kind: "ai_overage", invoiceId: null } });
  const quantity = (open?.quantity ?? 0) + credits;
  const data = { description: `AI credits over the allowance (${Math.round(quantity).toLocaleString("en-GB")}) at the top-up rate`, quantity, unitPrice: Math.round(perCredit * 10000) / 10000, amount: Math.round(quantity * perCredit * 100) / 100, currency };
  if (open) await prisma.billingItem.update({ where: { id: open.id }, data });
  else await prisma.billingItem.create({ data: { clientId, kind: "ai_overage", ...data } });
}
