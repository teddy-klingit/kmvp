import type { PlanTier } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { notifyMany } from "@/lib/notifier";
import { decryptSecret } from "@/lib/secrets";
import { aiPrices, costUsd, creditsForBudget, creditsForCost } from "@/lib/ai-cost";
import { billOverage, maybeAutoTopUp, overageMode } from "@/lib/top-ups";
import { getSetting } from "@/lib/platform-settings";

/**
 * AI credits (Phase Q). Two credit types exist:
 *  - team credits: Klingit team time, 1 credit = 1 hour (CreditLedgerEntry, src/lib/client-home.ts);
 *  - AI credits: LLM use by the skills a client runs and the built-in assistants they use (AiCreditLedger, here).
 * Klingit's own production AI (estimates, staffing, the quality check, scheduled jobs) never charges a client:
 * a run is charged only inside a client-triggered context (withAiCharge in src/lib/ai-context.ts) or as a
 * client's own skill run. Assistants (Phase S) never charge either: their token cost is logged as billable: false
 * and a daily fair-use limit applies instead (assistantFairUse).
 *
 * ── Tokens → AI credits (PLACEHOLDER rate, one place) ──────────────────────────────────────────────────────────
 * 1 AI credit = 1,000 weighted tokens by default; staff change it in Price List → Currencies & terms (Phase S). Weighted tokens = input tokens + 5 × output tokens (output costs ~5× input
 * on Claude), times the model's price relative to the default model. A web search adds 1,000 weighted tokens; a
 * generated image adds IMAGE_CREDITS. Change the numbers here and nowhere else.
 */
export const TOKENS_PER_AI_CREDIT = 1000;
export const OUTPUT_TOKEN_WEIGHT = 5;
export const WEB_SEARCH_TOKENS = 1000;
export const IMAGE_CREDITS = 12;
const MODEL_WEIGHT: Record<string, number> = { "claude-opus-5": 1, "claude-sonnet-5-5": 0.6, "claude-haiku-4-5-20251001": 0.2 };
/** Shown everywhere a credit number has no measured source yet. */
export const AI_CREDITS_ARE_PLACEHOLDERS = true;

export function creditsForTokens(u: { tokensIn: number; tokensOut: number; model?: string | null; webSearches?: number; images?: number }, tokensPerCredit = TOKENS_PER_AI_CREDIT) {
  const weight = (u.model ? MODEL_WEIGHT[u.model] : undefined) ?? 1;
  const weighted = (u.tokensIn + OUTPUT_TOKEN_WEIGHT * u.tokensOut) * weight + (u.webSearches ?? 0) * WEB_SEARCH_TOKENS;
  return Math.round((weighted / tokensPerCredit + (u.images ?? 0) * IMAGE_CREDITS) * 100) / 100;
}

// ─── Plans and periods ────────────────────────────────────────────────────────────────────────────────────────────

export function monthPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, key: start.toISOString().slice(0, 7) };
}

export async function planFor(tier: PlanTier) {
  return (await prisma.plan.findUnique({ where: { tier } })) ?? { tier, name: tier.charAt(0) + tier.slice(1).toLowerCase(), activeSlots: 1, monthlyAiCredits: 0, monthlyTeamCredits: 0, priceAmount: null, currency: "EUR", ownModel: false, sortOrder: 0, updatedAt: new Date() };
}

/** Team credits a month on a plan (Plan.monthlyTeamCredits, a placeholder until pricing is set). */
export async function teamAllowanceFor(tier: PlanTier) {
  return (await planFor(tier)).monthlyTeamCredits;
}

/**
 * A client's team credits a month — the one source every screen reads (Home, the profile menu, Usage, Account,
 * ops): the plan's value from the Plan table, unless staff set a per-client override.
 */
export async function teamAllowance(clientId: string) {
  // Phase S: a client on a contract gets its pack's PM + creative credits.
  const contract = await prisma.contract.findFirst({ where: { clientId, status: { in: ["active", "paused", "ending"] } }, orderBy: { startDate: "desc" } });
  if (contract) {
    const value = contract.pmCreditsPerMonth + contract.creativeCreditsPerMonth;
    const pack = contract.teamPackKey ? await prisma.teamPack.findUnique({ where: { key: contract.teamPackKey }, select: { name: true } }) : null;
    return { value, planValue: value, planName: pack?.name ?? "Platform only", source: "contract" as const };
  }
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { planTier: true, teamCreditsOverride: true } });
  const plan = await planFor(client.planTier);
  const override = client.teamCreditsOverride;
  return { value: override ?? plan.monthlyTeamCredits, planValue: plan.monthlyTeamCredits, planName: plan.name, source: override === null ? ("plan" as const) : ("override" as const) };
}

/**
 * The client's current monthly period: creates its ClientPlan row and the month's ALLOWANCE ledger row the first
 * time it's needed (idempotent), so the allowance resets every month without a cron job.
 */
export async function ensurePeriod(clientId: string, now = new Date()) {
  const p = monthPeriod(now);
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { planTier: true } });
  const row = await prisma.clientPlan.upsert({
    where: { clientId_periodStart: { clientId, periodStart: p.start } },
    update: {},
    create: { clientId, tier: client.planTier, periodStart: p.start, periodEnd: p.end },
  });
  // Phase S: a contract's platform plan sets the AI credits (and Basic's own model) instead of the old Plan.
  const contract = await prisma.contract.findFirst({ where: { clientId, status: { in: ["active", "paused", "ending"] } }, orderBy: { startDate: "desc" } });
  const platform = contract ? await prisma.platformPlan.findUnique({ where: { key: contract.platformPlanKey } }) : null;
  const legacy = await planFor(row.tier);
  // Phase U: the credits follow from the plan's USD budget ($3 / $10 / $30 → 300 / 1,000 / 3,000 at $0.01).
  const plan = platform ? { ...legacy, name: platform.name, monthlyAiCredits: await creditsForBudget(platform), ownModel: platform.ownModel } : legacy;
  const has = await prisma.aiCreditLedger.findFirst({ where: { clientId, kind: "ALLOWANCE", createdAt: { gte: p.start, lt: p.end } }, select: { id: true } });
  if (!has && plan.monthlyAiCredits > 0) {
    await prisma.aiCreditLedger.create({ data: { clientId, kind: "ALLOWANCE", amount: plan.monthlyAiCredits, note: `${plan.name} plan · ${p.key}`, createdAt: p.start } });
  }
  return { period: row, plan, ...p };
}

const sum = (rows: { amount: number }[]) => rows.reduce((a, r) => a + r.amount, 0);

/** Where the client stands this month. Only rows billed to Klingit count; Basic-plan rows are tokens only. */
export async function aiCreditStatus(clientId: string, now = new Date()) {
  const { plan, start, end, key } = await ensurePeriod(clientId, now);
  const [period, bundles, bundleUse, provider] = await Promise.all([
    prisma.aiCreditLedger.findMany({ where: { clientId, billedTo: "klingit", billable: true, createdAt: { gte: start, lt: end }, kind: { in: ["ALLOWANCE", "ADJUSTMENT", "USAGE"] } }, select: { kind: true, amount: true, fundedBy: true } }),
    // Top-ups roll over (Phase U setting): all of them count, or only this month's when rollover is off.
    getSetting("topUpRollover").then((roll) => prisma.aiCreditLedger.findMany({ where: { clientId, kind: "BUNDLE", ...(roll ? {} : { createdAt: { gte: start } }) }, select: { amount: true } })),
    prisma.aiCreditLedger.findMany({ where: { clientId, kind: "USAGE", fundedBy: "bundle", billedTo: "klingit", billable: true }, select: { amount: true } }),
    prisma.aiCreditLedger.aggregate({ where: { clientId, billedTo: "client_provider", createdAt: { gte: start, lt: end } }, _sum: { tokensIn: true, tokensOut: true } }),
  ]);
  const allowance = sum(period.filter((r) => r.kind === "ALLOWANCE")) + sum(period.filter((r) => r.kind === "ADJUSTMENT"));
  const usage = period.filter((r) => r.kind === "USAGE");
  const used = -sum(usage);
  const usedFromAllowance = -sum(usage.filter((r) => r.fundedBy !== "bundle"));
  const allowanceLeft = Math.max(0, allowance - usedFromAllowance);
  const bundleLeft = Math.max(0, sum(bundles) + sum(bundleUse));
  const round = (n: number) => Math.round(n * 100) / 100 || 0;
  return {
    plan,
    periodKey: key,
    periodStart: start,
    periodEnd: end,
    allowance: round(allowance),
    used: round(used),
    allowanceLeft: round(allowanceLeft),
    bundleLeft: round(bundleLeft),
    left: round(allowanceLeft + bundleLeft),
    // Phase U: own Claude works on every plan; skills on it use 0 Klingit credits.
    ownModel: plan.ownModel || (await usesOwnClaude(clientId)),
    providerTokens: (provider._sum.tokensIn ?? 0) + (provider._sum.tokensOut ?? 0),
  };
}

export type AiGate = { ok: true; warning: string | null } | { ok: false; error: string; topUp: boolean };

/**
 * May this client start something that uses AI credits? A skill run is blocked when nothing is left (with Top up);
 * an assistant never uses AI credits, so it's never blocked or warned about here (see assistantFairUse). On Basic the client's own model pays, so only a missing connection blocks.
 */
export async function aiGate(clientId: string, sourceType: "skill" | "assistant", now = new Date()): Promise<AiGate> {
  const s = await aiCreditStatus(clientId, now);
  if (s.ownModel) {
    const own = await ownModelConnection(clientId);
    return own ? { ok: true, warning: null } : { ok: false, error: "Connect your own Claude in Settings → Connections first.", topUp: false };
  }
  // Assistants never use AI credits (Phase S): nothing to warn about.
  if (sourceType === "assistant") return { ok: true, warning: null };
  const warnAt = await getSetting("aiWarnAt");
  if (s.left > 0) return { ok: true, warning: s.allowance > 0 && s.used >= s.allowance * warnAt ? `${Math.floor(s.left)} AI credits left this month.` : null };
  // Phase U: at 100% skills pause (the default) with a top-up, or keep running and the overage is billed.
  if ((await overageMode(clientId)) === "bill") return { ok: true, warning: "You're over this month's AI credits: the extra is billed at the top-up rate." };
  return { ok: false, error: "You've used this month's AI credits. Top up to keep your skills running, or wait for the reset.", topUp: true };
}

/**
 * On Basic: the client's own model connection (Settings → Connections → Your own AI model), if any, with its key
 * decrypted for this one call. Only run-agent uses the key, and only for a run charged to this same client.
 */
/** The client connected their own Claude (MCP or API key): their skills run on it (Phase U: on any plan). */
export async function usesOwnClaude(clientId: string) {
  return Boolean(await prisma.brandConnection.findFirst({ where: { clientId, app: "claude", status: "CONNECTED" }, select: { id: true } }));
}

export async function ownModelConnection(clientId: string) {
  const conn = await prisma.brandConnection.findFirst({ where: { clientId, app: { in: ["claude", "openai"] }, status: "CONNECTED" } });
  if (!conn) return null;
  const meta = (conn.meta ?? {}) as { encryptedKey?: string };
  return { provider: conn.app as "claude" | "openai", apiKey: decryptSecret(meta.encryptedKey) };
}

/**
 * Assistants are free but fair-use limited: a staff-set number of calls per client per day (placeholder 200).
 * Returns the calm message to show once the limit is reached, or null.
 */
export async function assistantFairUse(clientId: string, now = new Date()) {
  const limit = await getSetting("assistantFairUsePerDay");
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const used = await prisma.aiCreditLedger.count({ where: { clientId, kind: "USAGE", sourceType: "assistant", createdAt: { gte: dayStart } } });
  return used >= limit ? "That's a lot of questions for one day. The assistants take a breather until tomorrow; your Marketing PM can help in the meantime." : null;
}

export type AiCharge = {
  clientId: string;
  userId?: string | null;
  sourceType: "skill" | "assistant";
  sourceKey: string;
  sourceName: string;
  projectId?: string | null;
  format?: string | null;
  tokensIn: number;
  tokensOut: number;
  model?: string | null;
  webSearches?: number;
  images?: number;
  /** Phase U: input tokens read from / written to the prompt cache (tokensIn is the uncached rest). */
  cacheRead?: number;
  cacheWrite?: number;
  agentRunId?: string | null;
};

/**
 * Writes the usage of one client-triggered AI call to the ledger, from real token counts. Drawn from the monthly
 * allowance first, then from bundles. On Basic it logs the tokens as billed by the client's provider and deducts
 * nothing. Tells the client's admins once each at 80% and 100% of the allowance. Returns the credits charged.
 */
export async function chargeAi(c: AiCharge, now = new Date()) {
  // Phase U: credits = real cost ÷ $ per credit, rounded up, at least 1. The real cost is stored on every row.
  const [prices, usdPerCredit] = await Promise.all([aiPrices(), getSetting("usdPerCredit")]);
  const cost = costUsd({ model: c.model, tokensIn: c.tokensIn, tokensOut: c.tokensOut, cacheRead: c.cacheRead, cacheWrite: c.cacheWrite, webSearches: c.webSearches, images: c.images }, prices);
  const credits = creditsForCost(cost, usdPerCredit);
  const before = await aiCreditStatus(c.clientId, now);
  const base = { clientId: c.clientId, userId: c.userId ?? null, kind: "USAGE" as const, sourceType: c.sourceType, sourceKey: c.sourceKey, sourceName: c.sourceName, projectId: c.projectId ?? null, format: c.format ?? null, model: c.model ?? null, agentRunId: c.agentRunId ?? null, createdAt: now, cacheReadTokens: c.cacheRead ?? 0, cacheWriteTokens: c.cacheWrite ?? 0, images: c.images ?? 0 };
  // Assistants: the cost is logged so Klingit can see it, never counted against the client.
  if (c.sourceType === "assistant") {
    await prisma.aiCreditLedger.create({ data: { ...base, amount: -credits, tokensIn: c.tokensIn, tokensOut: c.tokensOut, billable: false, costUsd: before.ownModel ? 0 : cost, billedTo: before.ownModel ? "client_provider" : "klingit", note: "Assistant · free for clients" } });
    return { credits: 0, billedTo: before.ownModel ? ("client_provider" as const) : ("klingit" as const) };
  }
  if (before.ownModel) {
    await prisma.aiCreditLedger.create({ data: { ...base, amount: -credits, tokensIn: c.tokensIn, tokensOut: c.tokensOut, costUsd: 0, billedTo: "client_provider", fundedBy: "own_ai", note: "Own AI · your Claude, 0 Klingit credits" } });
    return { credits: 0, billedTo: "client_provider" as const };
  }
  const fromAllowance = Math.min(credits, before.allowanceLeft);
  const rest = Math.round((credits - fromAllowance) * 100) / 100;
  // One row per funding source, so "used from allowance" and "used from bundles" always add up to the total.
  // The cost goes on the first row, so a sum of costUsd is the real cost exactly once.
  if (fromAllowance > 0 || rest === 0) await prisma.aiCreditLedger.create({ data: { ...base, amount: -fromAllowance, fundedBy: "allowance", tokensIn: c.tokensIn, tokensOut: c.tokensOut, costUsd: cost } });
  // Over the allowance and the top-ups ("keep running, bill overage"): the overage line on the next invoice.
  if (rest > 0 && before.bundleLeft <= 0 && (await overageMode(c.clientId)) === "bill") await billOverage(c.clientId, rest);
  if (rest > 0) await prisma.aiCreditLedger.create({ data: { ...base, amount: -rest, fundedBy: before.bundleLeft > 0 ? "bundle" : "over", tokensIn: fromAllowance > 0 ? 0 : c.tokensIn, tokensOut: fromAllowance > 0 ? 0 : c.tokensOut, costUsd: fromAllowance > 0 ? 0 : cost } });
  await thresholdAlerts(c.clientId, before.allowance, before.allowance - before.allowanceLeft, before.allowance - before.allowanceLeft + credits, before.periodKey);
  await maybeAutoTopUp(c.clientId, before.left - credits, now);
  return { credits, costUsd: cost, billedTo: "klingit" as const };
}

async function thresholdAlerts(clientId: string, allowance: number, usedBefore: number, usedAfter: number, periodKey: string) {
  if (allowance <= 0) return;
  for (const pct of [Math.round((await getSetting("aiWarnAt")) * 100), 100]) {
    const line = (pct / 100) * allowance;
    if (usedBefore < line && usedAfter >= line) {
      const admins = await prisma.clientUser.findMany({ where: { clientId, permission: "OWNER" }, select: { userId: true } });
      await notifyMany(
        admins.map((a) => ({
          userId: a.userId,
          clientId,
          type: "SYSTEM" as const,
          title: pct === 100 ? "You've used this month's AI credits" : `${pct}% of this month's AI credits used`,
          body: pct === 100 ? `Skills pause until you top up or the allowance resets (${periodKey}).` : `${Math.round(allowance - usedAfter)} AI credits left this month. Top up in a click so skills keep running.`,
          actionUrl: "/settings/usage",
          actionLabel: "See usage",
        }))
      );
    }
  }
}

/** Staff: a manual adjustment with a reason (logged with who made it). */
export async function adjustAiCredits(clientId: string, amount: number, reason: string, byUserId: string) {
  return prisma.aiCreditLedger.create({ data: { clientId, kind: "ADJUSTMENT", amount, note: reason, createdById: byUserId } });
}

/** Staff confirm a top-up request: the bundle's credits land in the ledger (bundles never expire). */
export async function confirmTopUp(requestId: string, byUserId: string, approve: boolean) {
  const req = await prisma.aiTopUpRequest.findUnique({ where: { id: requestId }, include: { bundle: true } });
  if (!req || req.status !== "PENDING") return null;
  await prisma.aiTopUpRequest.update({ where: { id: requestId }, data: { status: approve ? "CONFIRMED" : "REJECTED", decidedByUserId: byUserId, decidedAt: new Date() } });
  if (approve) await prisma.aiCreditLedger.create({ data: { clientId: req.clientId, kind: "BUNDLE", amount: req.bundle.size, note: `Top-up · ${req.bundle.size} AI credits`, createdById: byUserId } });
  return req;
}
