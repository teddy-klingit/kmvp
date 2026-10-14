import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

/**
 * Staff-editable platform settings (Phase S), one row per key. Every value is a placeholder until staff set it;
 * DEFAULTS is what applies when a row is missing. Read fresh on every call (no cache): a change applies at once.
 */
export const SETTING_DEFAULTS = {
  /** Assistant calls per client per day before the calm fair-use message (assistants never use AI credits). */
  assistantFairUsePerDay: 200 as number,
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
