"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";
import { getSetting, setSetting, SETTING_DEFAULTS, type SettingKey } from "@/lib/platform-settings";
import { CURRENCIES } from "@/lib/pricing";

/**
 * Price List → Plans & packs, Currencies & terms (Phase S step 2). Admins edit; every change goes to the AuditLog
 * with before and after. Existing contracts keep the price they were signed at.
 */

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

async function audit(actorUserId: string, action: string, before: unknown, after: unknown) {
  await prisma.auditLog.create({ data: { actorUserId, area: "pricing", action, before: (before ?? undefined) as Prisma.InputJsonValue, after: (after ?? undefined) as Prisma.InputJsonValue } });
}

function refresh() {
  revalidatePath("/ops/admin/price-list", "layout");
}

export async function savePlatformPlanAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const key = String(formData.get("key") ?? "");
  const before = await prisma.platformPlan.findUnique({ where: { key } });
  if (!before) return;
  const priceEur = num(formData.get("priceEur"));
  const ai = num(formData.get("aiCreditsPerMonth"));
  const data = {
    name: String(formData.get("name") ?? "").trim() || before.name,
    priceEur: priceEur != null && priceEur >= 0 ? priceEur : before.priceEur,
    aiCreditsPerMonth: ai != null && ai >= 0 ? Math.round(ai) : before.aiCreditsPerMonth,
    tagline: String(formData.get("tagline") ?? "").trim() || null,
  };
  await prisma.platformPlan.update({ where: { key }, data });
  await audit(viewer.userId, `plan ${key}`, { name: before.name, priceEur: before.priceEur, aiCreditsPerMonth: before.aiCreditsPerMonth, tagline: before.tagline }, data);
  refresh();
}

export async function saveTeamPackAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const key = String(formData.get("key") ?? "");
  const before = await prisma.teamPack.findUnique({ where: { key } });
  if (!before || before.perRequest) return;
  const pm = num(formData.get("pmCredits"));
  const creative = num(formData.get("creativeCredits"));
  const priceEur = num(formData.get("priceEur"));
  const data = {
    name: String(formData.get("name") ?? "").trim() || before.name,
    pmCredits: pm != null && pm >= 0 ? Math.round(pm) : before.pmCredits,
    creativeCredits: creative != null && creative >= 0 ? Math.round(creative) : before.creativeCredits,
    priceEur: priceEur != null && priceEur >= 0 ? priceEur : before.priceEur,
  };
  await prisma.teamPack.update({ where: { key }, data });
  await audit(viewer.userId, `pack ${key}`, { name: before.name, pmCredits: before.pmCredits, creativeCredits: before.creativeCredits, priceEur: before.priceEur }, data);
  refresh();
}

/** Override one converted list price; an empty amount goes back to the FX rule. */
export async function savePriceOverrideAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const ref = String(formData.get("ref") ?? "");
  const currency = String(formData.get("currency") ?? "");
  if (!/^(plan|pack):[a-z0-9_]+$/.test(ref) || !CURRENCIES.includes(currency as never) || currency === "EUR") return;
  const amount = num(formData.get("amount"));
  const before = await prisma.priceOverride.findUnique({ where: { ref_currency: { ref, currency } } });
  if (amount == null) {
    if (before) await prisma.priceOverride.delete({ where: { id: before.id } });
  } else await prisma.priceOverride.upsert({ where: { ref_currency: { ref, currency } }, update: { amount, updatedByUserId: viewer.userId }, create: { ref, currency, amount, updatedByUserId: viewer.userId } });
  await audit(viewer.userId, `override ${ref} ${currency}`, before ? { amount: before.amount } : null, amount == null ? null : { amount });
  refresh();
}

export async function saveFxRateAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const currency = String(formData.get("currency") ?? "");
  const perEur = num(formData.get("perEur"));
  if (!CURRENCIES.includes(currency as never) || currency === "EUR" || perEur == null || perEur <= 0) return;
  const before = await prisma.fxRate.findUnique({ where: { currency } });
  await prisma.fxRate.upsert({ where: { currency }, update: { perEur, updatedByUserId: viewer.userId }, create: { currency, perEur, updatedByUserId: viewer.userId } });
  await audit(viewer.userId, `fx ${currency}`, before ? { perEur: before.perEur } : null, { perEur });
  refresh();
}

/** The number settings on Currencies & terms (percentages are typed as %, stored as fractions). */
const NUMBER_SETTINGS: { key: SettingKey; percent?: boolean; min?: number }[] = [
  { key: "assistantFairUsePerDay", min: 1 },
  { key: "aiTokensPerCredit", min: 1 },
  { key: "upfrontAdjustment", percent: true },
  { key: "fxMarkup", percent: true },
  { key: "teamRolloverCap", min: 0 },
  { key: "creativeCreditsPerSlot", min: 1 },
  { key: "pmLinePercent", percent: true },
  { key: "pmLineMin", min: 0 },
  { key: "creativePackSize", min: 1 },
  { key: "creativePackSurcharge", percent: true },
  { key: "vatRateDomestic", percent: true },
];

export async function savePricingSettingsAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  for (const s of NUMBER_SETTINGS) {
    const v = num(formData.get(s.key));
    if (v == null || (s.min != null && v < s.min)) continue;
    const value = s.percent ? Math.round(v * 100) / 10000 : v;
    await setSetting(s.key, value as never, viewer.userId);
  }
  const terms: Record<string, number> = {};
  for (const t of Object.keys(SETTING_DEFAULTS.termAdjustments)) {
    const v = num(formData.get(`term${t}`));
    if (v != null) terms[t] = Math.round(v * 100) / 10000;
  }
  if (Object.keys(terms).length) await setSetting("termAdjustments", { ...(await getSetting("termAdjustments")), ...terms }, viewer.userId);
  const topUpCredits = num(formData.get("aiTopUpCredits"));
  const topUpEur = num(formData.get("aiTopUpEur"));
  if (topUpCredits != null && topUpEur != null && topUpCredits > 0 && topUpEur >= 0) await setSetting("aiTopUp", { credits: Math.round(topUpCredits), priceEur: topUpEur }, viewer.userId);
  if (formData.has("aiRolloverSet")) await setSetting("aiRollover", formData.get("aiRollover") === "on", viewer.userId);
  refresh();
  revalidatePath("/ops/admin/settings");
}
