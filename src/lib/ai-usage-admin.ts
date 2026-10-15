import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/platform-settings";
import { aiCreditStatus } from "@/lib/ai-credits";

/**
 * Admin → AI usage (Phase U, design AdminAIUsage): what each plan may cost us, this month's real AI cost (skills vs
 * assistants), the real cost per credit, top-ups sold, clients close to the ceiling, usage by client, where the cost
 * goes (by skill and by model). All from the ledger's real costUsd.
 */

export type Period = "month" | "last" | "year";
const startOf = (p: Period, now: Date) => (p === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : p === "last" ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : new Date(now.getFullYear() - 1, now.getMonth(), 1));
const endOf = (p: Period, now: Date) => (p === "last" ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth() + 1, 1));

export async function loadAiUsage(period: Period = "month", now = new Date()) {
  const from = startOf(period, now);
  const to = endOf(period, now);
  const [usdPerCredit, eurUsd, warnAt, options, plans, rows, topUps, clients, contracts, profiles, ownAi] = await Promise.all([
    getSetting("usdPerCredit"),
    getSetting("eurUsdRate"),
    getSetting("aiWarnAt"),
    getSetting("aiTopUpOptions"),
    prisma.platformPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.aiCreditLedger.findMany({ where: { kind: "USAGE", createdAt: { gte: from, lt: to }, billedTo: "klingit" }, select: { clientId: true, sourceType: true, sourceName: true, model: true, amount: true, costUsd: true, billable: true, agentRunId: true, images: true } }),
    prisma.purchaseRequest.findMany({ where: { kind: "ai_topup", status: "approved", createdAt: { gte: from, lt: to } }, select: { clientId: true, price: true, currency: true, payload: true } }),
    prisma.client.findMany({ where: { status: { not: "OFFBOARDED" } }, select: { id: true, name: true, isDemo: true }, orderBy: { name: "asc" } }),
    prisma.contract.findMany({ where: { status: { in: ["active", "paused", "ending"] } }, select: { clientId: true, platformPlanKey: true } }),
    prisma.billingProfile.findMany({ select: { clientId: true, autoTopUp: true } }),
    prisma.brandConnection.findMany({ where: { app: "claude", status: "CONNECTED" }, select: { clientId: true } }),
  ]);

  // 1. What each plan may cost us.
  const planRows = plans.map((p) => {
    const budget = p.aiBudgetUsd ?? p.aiCreditsPerMonth * usdPerCredit;
    return { key: p.key, name: p.name, priceEur: p.priceEur, budgetUsd: budget, credits: Math.round(budget / usdPerCredit), share: p.priceEur > 0 ? budget / (p.priceEur * eurUsd) : null };
  });
  const top = options[0];
  const topUpRow = top ? { priceEur: top.priceEur, budgetUsd: top.credits * usdPerCredit, credits: top.credits, share: (top.credits * usdPerCredit) / (top.priceEur * eurUsd), markup: (top.priceEur * eurUsd) / (top.credits * usdPerCredit) } : null;

  // 2. Tiles.
  const cost = (xs: typeof rows) => xs.reduce((n, r) => n + (r.costUsd ?? 0), 0);
  const skills = rows.filter((r) => r.sourceType === "skill");
  const assistants = rows.filter((r) => r.sourceType === "assistant");
  const charged = -skills.filter((r) => r.billable).reduce((n, r) => n + r.amount, 0);
  const sold = topUps.reduce((n, t) => n + (t.price ?? 0), 0);
  const soldCredits = topUps.reduce((n, t) => n + Number((t.payload as { credits?: number }).credits ?? 0), 0);

  // 3. Usage by client (this month's status for the bars; the period's cost).
  const byClient = [];
  for (const c of clients) {
    const s = await aiCreditStatus(c.id, period === "last" ? new Date(from.getTime() + 86400000) : now);
    const plan = contracts.find((x) => x.clientId === c.id)?.platformPlanKey;
    const planRow = planRows.find((p) => p.key === plan);
    const own = ownAi.some((o) => o.clientId === c.id);
    const ups = topUps.filter((t) => t.clientId === c.id);
    const of = s.allowance + s.bundleLeft + Math.max(0, s.used - s.allowance);
    const clientCost = cost(rows.filter((r) => r.clientId === c.id));
    if (!s.used && !clientCost && !ups.length) continue;
    byClient.push({
      id: c.id,
      name: c.name,
      demo: c.isDemo,
      plan: planRow?.name ?? s.plan.name,
      used: Math.round(s.used),
      of: Math.round(of || s.allowance),
      pct: of > 0 ? Math.round((s.used / of) * 100) : 0,
      costUsd: clientCost,
      budgetUsd: planRow?.budgetUsd ?? s.allowance * usdPerCredit,
      topUps: ups.length,
      topUpsAmount: ups.reduce((n, t) => n + (t.price ?? 0), 0),
      currency: ups[0]?.currency ?? "EUR",
      note: [profiles.find((p) => p.clientId === c.id)?.autoTopUp ? "Auto top-up on" : null, own ? "Uses own Claude for some work" : null, ups.length ? `${s.allowance.toLocaleString("en-GB")} + ${soldCreditsOf(ups).toLocaleString("en-GB")} top-up` : null].filter(Boolean).join(" · "),
    });
  }
  byClient.sort((a, b) => b.pct - a.pct);

  // 4. Where the cost goes.
  const bySkill = new Map<string, { cost: number; runs: Set<string>; images: number }>();
  for (const r of skills) {
    const k = r.sourceName ?? "Skill";
    const v = bySkill.get(k) ?? { cost: 0, runs: new Set<string>(), images: 0 };
    v.cost += r.costUsd ?? 0;
    v.runs.add(r.agentRunId ?? `${k}-${v.runs.size}`);
    v.images += r.images;
    bySkill.set(k, v);
  }
  const skillsList = [...bySkill.entries()].map(([name, v]) => ({ name, costUsd: v.cost, runs: v.runs.size, images: v.images })).sort((a, b) => b.costUsd - a.costUsd);
  const byModel = new Map<string, number>();
  for (const r of rows) byModel.set(r.model ?? "other", (byModel.get(r.model ?? "other") ?? 0) + (r.costUsd ?? 0));
  const total = cost(rows);

  return {
    usdPerCredit,
    eurUsd,
    plans: planRows,
    topUp: topUpRow,
    tiles: { costUsd: total, skillsUsd: cost(skills), assistantsUsd: cost(assistants), costPerCredit: charged > 0 ? cost(skills.filter((r) => r.billable)) / charged : null, topUpsSold: sold, topUpsCount: topUps.length, topUpsCostUsd: soldCredits * usdPerCredit, over80: byClient.filter((c) => c.pct >= warnAt * 100) },
    clients: byClient,
    skills: skillsList,
    assistants: { costUsd: cost(assistants), names: [...new Set(assistants.map((a) => a.sourceName).filter(Boolean))] as string[] },
    models: [...byModel.entries()].map(([model, usd]) => ({ model, usd, share: total > 0 ? usd / total : 0 })).sort((a, b) => b.usd - a.usd),
  };
}

function soldCreditsOf(ups: { payload: unknown }[]) {
  return ups.reduce((n, t) => n + Number((t.payload as { credits?: number }).credits ?? 0), 0);
}
