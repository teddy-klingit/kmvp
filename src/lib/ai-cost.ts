import { getSetting } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";

/**
 * Real AI cost (Phase U). Every call's cost in USD comes from its model, tokens (uncached, cache reads, cache writes),
 * web searches and generated images at the staff-set prices; a skill run then uses credits = cost ÷ $ per credit,
 * rounded up to whole credits, at least 1. Prices and the routing are settings (Admin → AI usage).
 */

export type Usage = { model: string | null | undefined; tokensIn: number; tokensOut: number; cacheRead?: number; cacheWrite?: number; webSearches?: number; images?: number; batch?: boolean };
type Prices = Awaited<ReturnType<typeof aiPrices>>;

export const aiPrices = () => getSetting("aiPrices");

/** USD for one call. tokensIn here are the uncached input tokens. */
export function costUsd(u: Usage, p: Prices) {
  const m = (u.model && p.models[u.model]) || p.fallback;
  const tokens = (u.tokensIn * m.in + (u.cacheRead ?? 0) * m.in * p.cacheRead + (u.cacheWrite ?? 0) * m.in * p.cacheWrite + u.tokensOut * m.out) / 1_000_000;
  const cost = tokens * (u.batch ? p.batchDiscount : 1) + (u.webSearches ?? 0) * p.webSearch + (u.images ?? 0) * p.image;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Whole credits for a skill run: cost ÷ $ per credit, rounded up, at least 1. */
export function creditsForCost(cost: number, usdPerCredit: number) {
  return Math.max(1, Math.ceil(cost / usdPerCredit - 1e-9));
}

/** The model a skill runs on: Opus only where set, Haiku for simple skills, Sonnet for the rest. */
export async function modelFor(agentKey: string) {
  const r = await getSetting("aiRouting");
  if (r.opusSkills.includes(agentKey)) return r.opus;
  if (r.simpleSkills.includes(agentKey) || /caption|check|resize|tone_check|compliance/.test(agentKey)) return r.simple;
  return r.default;
}

/** A plan's AI credits a month from its USD budget (falls back to the stored number for a plan without one). */
export async function creditsForBudget(plan: { aiBudgetUsd: number | null; aiCreditsPerMonth: number }) {
  if (plan.aiBudgetUsd == null) return plan.aiCreditsPerMonth;
  return Math.round(plan.aiBudgetUsd / (await getSetting("usdPerCredit")));
}

/**
 * "About N credits" before a run: the average of the skill's last 30 charged runs (every client), rounded; the
 * skill's own number until it has run. The real number is charged after.
 */
export async function estimateCredits(agents: { id: string; aiCreditsPerRun: number | null }[]) {
  const runs = await prisma.agentRun.findMany({ where: { agentId: { in: agents.map((a) => a.id) }, aiCredits: { gt: 0 } }, orderBy: { createdAt: "desc" }, select: { agentId: true, aiCredits: true }, take: 30 * Math.max(1, agents.length) });
  const out = new Map<string, number | null>();
  for (const a of agents) {
    const last = runs.filter((r) => r.agentId === a.id).slice(0, 30);
    out.set(a.id, last.length ? Math.max(1, Math.round(last.reduce((n, r) => n + (r.aiCredits ?? 0), 0) / last.length)) : a.aiCreditsPerRun);
  }
  return out;
}
