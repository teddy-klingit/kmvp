"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import type { BrandAssetCategory } from "@/generated/prisma";

const PREVIEW_COLORS = [
  "var(--avatar-1)",
  "var(--avatar-2)",
  "var(--avatar-3)",
  "var(--avatar-4)",
  "var(--avatar-5)",
  "var(--avatar-6)",
  "var(--avatar-7)",
  "var(--avatar-8)",
];

type EmptyState = Record<string, never>;
const EMPTY: EmptyState = {};

export async function deleteBrandAssetAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const assetId = String(formData.get("assetId") ?? "");
  const category = String(formData.get("category") ?? "");

  await prisma.brandAsset.deleteMany({ where: { id: assetId, clientId: viewer.clientId } });

  revalidatePath(`/assets/visual-identity/${category}`);
  revalidatePath("/assets/visual-identity");
}

export async function updateBrandAssetAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const assetId = String(formData.get("assetId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const variant = String(formData.get("variant") ?? "").trim();
  const newCategory = String(formData.get("category") ?? "") as BrandAssetCategory;
  const oldCategory = String(formData.get("oldCategory") ?? "") as BrandAssetCategory;
  if (!assetId || !name || !newCategory) return EMPTY;

  await prisma.brandAsset.updateMany({
    where: { id: assetId, clientId: viewer.clientId },
    data: { name, variant: variant || null, category: newCategory },
  });

  revalidatePath(`/assets/visual-identity/${categorySlug(oldCategory)}`);
  revalidatePath(`/assets/visual-identity/${categorySlug(newCategory)}`);
  revalidatePath("/assets/visual-identity");
  return EMPTY;
}

export async function createBrandAssetAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "") as BrandAssetCategory;
  const variant = String(formData.get("variant") ?? "").trim();
  const format = String(formData.get("format") ?? "").trim();
  if (!name || !category) return EMPTY;

  await prisma.brandAsset.create({
    data: {
      clientId: viewer.clientId,
      name,
      category,
      variant: variant || null,
      format: format || null,
      previewColor: PREVIEW_COLORS[Math.floor(name.length % PREVIEW_COLORS.length)],
    },
  });

  revalidatePath(`/assets/visual-identity/${categorySlug(category)}`);
  revalidatePath("/assets/visual-identity");
  return EMPTY;
}

function categorySlug(category: BrandAssetCategory) {
  const map: Record<BrandAssetCategory, string> = {
    LOGO: "logotype",
    ICON: "icons",
    PHOTOGRAPHY: "photography",
    ILLUSTRATION: "illustration",
    PATTERN: "patterns",
    VIDEO: "video",
    ANIMATION: "animation",
  };
  return map[category];
}
