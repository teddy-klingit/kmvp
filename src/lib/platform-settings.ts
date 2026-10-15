import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

/**
 * Staff-editable platform settings (Phase S), one row per key. Every value is a placeholder until staff set it;
 * DEFAULTS is what applies when a row is missing. Read fresh on every call (no cache): a change applies at once.
 */
export const SETTING_DEFAULTS = {
  /** Assistant calls per client per day before the calm fair-use message (assistants never use AI credits). */
  assistantFairUsePerDay: 200 as number,
  /** Weighted tokens per AI credit (1 AI credit ≈ one short piece of copy). */
  aiTokensPerCredit: 1000 as number,
  /** Price adjustment per contract term in months, against the 12-month default (+0.05 = 5% more). */
  termAdjustments: { "3": 0.1, "6": 0.05, "12": 0, "18": -0.05 } as Record<string, number>,
  /** Paying the whole term upfront. */
  upfrontAdjustment: -0.03 as number,
  /** EUR → other currencies: EUR × rate × (1 + markup), rounded to the nearest 5. */
  fxMarkup: 0.02 as number,
  /** PM and creative credits roll over up to this × the monthly amount. */
  teamRolloverCap: 1.5 as number,
  /** AI credits roll over to next month. */
  aiRollover: false as boolean,
  /** Active projects at once: one per this many creative credits (PM-only packs get 1). */
  creativeCreditsPerSlot: 10 as number,
  /** Each estimate's PM line: this share of the creative credits, at least pmLineMin. */
  pmLinePercent: 0.1 as number,
  pmLineMin: 0.5 as number,
  /** Extra creative credits come in packs of this size, at the pack's per-credit price plus this surcharge. */
  creativePackSize: 10 as number,
  creativePackSurcharge: 0.1 as number,
  /** An AI credit top-up (the smallest option; Phase U: 1,000 for €25). */
  aiTopUp: { credits: 1000, priceEur: 25 } as { credits: number; priceEur: number },
  /** Phase U: 1 AI credit = this much real AI cost in USD ($0.01, so $10 of AI = 1,000 credits). */
  usdPerCredit: 0.01 as number,
  /** Phase U: real prices (placeholders): USD per million tokens in / out per model; cache reads and writes as a
   *  share of the input price; per web search, per generated image; and the Batch API discount. */
  aiPrices: {
    models: { "claude-opus-5-5": { in: 5, out: 25 }, "claude-opus-5": { in: 15, out: 75 }, "claude-sonnet-5-5": { in: 3, out: 15 }, "claude-haiku-5-5": { in: 1, out: 5 } } as Record<string, { in: number; out: number }>,
    fallback: { in: 3, out: 15 },
    cacheRead: 0.1,
    cacheWrite: 1.25,
    webSearch: 0.01,
    image: 0.04,
    batchDiscount: 0.5,
  } as { models: Record<string, { in: number; out: number }>; fallback: { in: number; out: number }; cacheRead: number; cacheWrite: number; webSearch: number; image: number; batchDiscount: number },
  /** Phase U: cost control. Simple skills (captions, checks, resizes) on Haiku, the rest on Sonnet, Opus only where a
   *  skill is set to it; the Brand OS (system prompt) is cached; scheduled reports go through the Batch API. */
  aiRouting: {
    default: "claude-sonnet-5-5",
    simple: "claude-haiku-5-5",
    opus: "claude-opus-5-5",
    simpleSkills: ["instagram_caption_agent", "brand_compliance", "tone_checker", "resize_agent", "caption_writer", "email_subject_agent"],
    opusSkills: [] as string[],
  } as { default: string; simple: string; opus: string; simpleSkills: string[]; opusSkills: string[] },
  /** Phase U top-ups (placeholders): the options, the warning, what happens at 100%, approval, the monthly cap,
   *  automatic top-ups and whether top-up credits roll over. */
  aiTopUpOptions: [
    { credits: 1000, priceEur: 25 },
    { credits: 3000, priceEur: 65 },
    { credits: 10000, priceEur: 190 },
  ] as { credits: number; priceEur: number }[],
  aiWarnAt: 0.8 as number,
  aiAt100: "pause" as "pause" | "bill",
  topUpApproval: "instant" as "instant" | "staff",
  topUpMaxEurPerMonth: 250 as number,
  autoTopUpRule: { below: 100, option: 0, maxPerMonth: 3 } as { below: number; option: number; maxPerMonth: number },
  topUpRollover: true as boolean,
  /** Phase U: EUR → USD for "AI share of the plan price" on Admin → AI usage. */
  eurUsdRate: 1.08 as number,
  promptCaching: true as boolean,
  batchScheduledReports: true as boolean,
  /** Phase T: minutes a Today task takes, per kind (placeholders), for "about 1 h 20 min". */
  todayMinutes: { MESSAGE: 5, ESTIMATE: 15, PLAN: 2, REQUEST: 2, STAFFING: 5, "QUALITY CHECK": 15, DEADLINE: 5, INVOICE: 5, BRIEF: 5, AGENT: 5, CHANGES: 5 } as Record<string, number>,
  /** Custom PM quotes only (never Price List items): hours × the task type's multiplier = credits. */
  customQuoteMultipliers: {
    "PM, global": 1,
    "PM, local": 1.25,
    "Production, illustration, presentation": 1,
    "UX/UI, motion, multi-discipline": 1.25,
    "3D, AI, brand, strategy, copy, web dev, marketing": 1.5,
    Specialist: 2,
    "Assets and stock": 0.5,
  } as Record<string, number>,
  /** VAT for clients in Sweden; clients abroad are reverse charge (0). */
  vatRateDomestic: 0.25 as number,
};
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return (row?.value as (typeof SETTING_DEFAULTS)[K] | undefined) ?? SETTING_DEFAULTS[key];
}

/** Staff change a setting; the before/after goes to the AuditLog. */
export async function setSetting<K extends SettingKey>(key: K, value: (typeof SETTING_DEFAULTS)[K], actorUserId: string) {
  const before = await getSetting(key);
  await prisma.platformSetting.upsert({ where: { key }, update: { value: value as Prisma.InputJsonValue, updatedByUserId: actorUserId }, create: { key, value: value as Prisma.InputJsonValue, updatedByUserId: actorUserId } });
  await prisma.auditLog.create({ data: { actorUserId, area: "settings", action: `set ${key}`, before: { value: before } as Prisma.InputJsonValue, after: { value } as Prisma.InputJsonValue } });
}
