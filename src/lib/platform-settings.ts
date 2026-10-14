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
  /** An AI credit top-up. */
  aiTopUp: { credits: 500, priceEur: 49 } as { credits: number; priceEur: number },
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
