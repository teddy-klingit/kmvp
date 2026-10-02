"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole, ForbiddenError } from "@/lib/authz";

const TIERS = ["LOW", "MEDIUM", "HIGH"] as const;

export type PriceListState = { error?: string | null };

async function requireAdminOrPm(): Promise<string | null> {
  try {
    await requireOpsRole(["ADMIN", "PM"]);
    return null;
  } catch (err) {
    if (err instanceof ForbiddenError) return err.message;
    throw err;
  }
}

export async function createPriceListItemAction(_prev: PriceListState, formData: FormData): Promise<PriceListState> {
  const forbidden = await requireAdminOrPm();
  if (forbidden) return { error: forbidden };

  const deliverableType = String(formData.get("deliverableType") ?? "").trim();
  const complexityTier = String(formData.get("complexityTier") ?? "");
  const creditCost = Number(formData.get("creditCost") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!deliverableType) return { error: "Name the deliverable type." };
  if (!TIERS.includes(complexityTier as (typeof TIERS)[number])) return { error: "Pick a complexity tier." };
  if (!Number.isInteger(creditCost) || creditCost <= 0) return { error: "Credit cost must be a positive whole number." };

  const existing = await prisma.priceListItem.findUnique({
    where: { deliverableType_complexityTier: { deliverableType, complexityTier: complexityTier as (typeof TIERS)[number] } },
  });
  if (existing && !existing.archivedAt) return { error: `${deliverableType} (${complexityTier}) already has a price — edit that row instead.` };

  if (existing) {
    // Re-adding an archived row brings it back with the new price.
    await prisma.priceListItem.update({ where: { id: existing.id }, data: { creditCost, notes: notes || null, archivedAt: null } });
  } else {
    await prisma.priceListItem.create({
      data: { deliverableType, complexityTier: complexityTier as (typeof TIERS)[number], creditCost, notes: notes || null },
    });
  }

  revalidatePath("/ops/price-list");
  return { error: null };
}

export async function updatePriceListItemAction(_prev: PriceListState, formData: FormData): Promise<PriceListState> {
  const forbidden = await requireAdminOrPm();
  if (forbidden) return { error: forbidden };

  const id = String(formData.get("id") ?? "");
  const deliverableType = String(formData.get("deliverableType") ?? "").trim();
  const complexityTier = String(formData.get("complexityTier") ?? "");
  const creditCost = Number(formData.get("creditCost") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!id) return { error: "Missing row." };
  if (!deliverableType) return { error: "Name the deliverable type." };
  if (!TIERS.includes(complexityTier as (typeof TIERS)[number])) return { error: "Pick a complexity tier." };
  if (!Number.isInteger(creditCost) || creditCost <= 0) return { error: "Credit cost must be a positive whole number." };

  const clash = await prisma.priceListItem.findUnique({
    where: { deliverableType_complexityTier: { deliverableType, complexityTier: complexityTier as (typeof TIERS)[number] } },
  });
  if (clash && clash.id !== id) return { error: `${deliverableType} (${complexityTier}) already has a price on another row.` };

  await prisma.priceListItem.update({
    where: { id },
    data: { deliverableType, complexityTier: complexityTier as (typeof TIERS)[number], creditCost, notes: notes || null },
  });

  revalidatePath("/ops/price-list");
  return { error: null };
}

export async function deletePriceListItemAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Soft archive, never a hard delete: estimates that used this row keep their history.
  await prisma.priceListItem.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath("/ops/price-list");
}
