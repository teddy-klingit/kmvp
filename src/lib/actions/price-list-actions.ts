"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";

/**
 * Price List → Deliverables (Phase S step 3). Admins and PMs edit items inline; a change to the credits, unit,
 * balance or status is a new version (valid from now). "Remove" archives: old estimate lines keep their link.
 * Every change goes to the AuditLog.
 */

const STATUSES = ["fixed", "estimate", "quote", "legacy", "draft"] as const;
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);

function refresh() {
  revalidatePath("/ops/admin/price-list", "layout");
}

export async function savePriceListItemAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const id = String(formData.get("id") ?? "");
  const before = await prisma.priceListItem.findUnique({ where: { id } });
  if (!before || before.archivedAt) return;
  const credits = num(formData.get("creditCost"));
  const lead = num(formData.get("leadTimeDays"));
  const status = STATUSES.find((s) => s === formData.get("status")) ?? before.status;
  const data = {
    creditCost: credits === undefined ? before.creditCost : credits,
    unit: String(formData.get("unit") ?? "").trim() || before.unit,
    balance: formData.get("balance") === "pm" ? "pm" : "creative",
    status,
    leadTimeDays: lead === undefined ? before.leadTimeDays : lead == null ? null : Math.round(lead),
    // Legacy items are staff reference only: never visible to clients.
    visibleToClients: status === "legacy" || status === "draft" ? false : formData.get("visibleToClients") === "on",
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
  const priced = data.creditCost !== before.creditCost || data.unit !== before.unit || data.balance !== before.balance || data.status !== before.status;
  await prisma.priceListItem.update({ where: { id }, data: { ...data, ...(priced ? { version: before.version + 1, validFrom: new Date() } : {}) } });
  const pick = (o: typeof before | typeof data) => ({ creditCost: o.creditCost, unit: o.unit, balance: o.balance, status: o.status, leadTimeDays: o.leadTimeDays, visibleToClients: o.visibleToClients, notes: o.notes });
  await prisma.auditLog.create({ data: { actorUserId: viewer.userId, area: "price-list", action: `${before.displayName ?? before.deliverableType}${priced ? ` → v${before.version + 1}` : ""}`, before: pick(before) as Prisma.InputJsonValue, after: pick(data) as Prisma.InputJsonValue } });
  refresh();
}

export async function addPriceListItemAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const item = String(formData.get("item") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || "Other";
  if (!item) return;
  const credits = num(formData.get("creditCost"));
  const status = STATUSES.find((s) => s === formData.get("status")) ?? "fixed";
  let key = slug(item);
  if (await prisma.priceListItem.findUnique({ where: { sourceKey: key } })) key = `${key}_${Date.now().toString(36)}`;
  const data = {
    deliverableType: item,
    displayName: item,
    category,
    squad: String(formData.get("squad") ?? "").trim() || null,
    unit: String(formData.get("unit") ?? "").trim() || "per item",
    creditCost: credits ?? null,
    balance: formData.get("balance") === "pm" ? "pm" : "creative",
    status,
    monthly: formData.get("monthly") === "on",
    visibleToClients: status !== "legacy" && status !== "draft",
    notes: String(formData.get("notes") ?? "").trim() || null,
    sourceKey: key,
    sortOrder: (await prisma.priceListItem.count()) + 1,
  };
  await prisma.priceListItem.create({ data });
  await prisma.auditLog.create({ data: { actorUserId: viewer.userId, area: "price-list", action: `Added ${item}`, after: data as Prisma.InputJsonValue } });
  refresh();
}

export async function archivePriceListItemAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const id = String(formData.get("id") ?? "");
  const item = await prisma.priceListItem.findUnique({ where: { id } });
  if (!item || item.archivedAt) return;
  await prisma.priceListItem.update({ where: { id }, data: { archivedAt: new Date() } });
  await prisma.auditLog.create({ data: { actorUserId: viewer.userId, area: "price-list", action: `Removed ${item.displayName ?? item.deliverableType}` } });
  refresh();
}
