import type { ComplexityTier } from "@/generated/prisma";

export type SnapshotLine = {
  deliverable: string;
  detail: string | null;
  quantity: number;
  complexityTier: ComplexityTier | null;
  credits: number;
  isCustom?: boolean;
  priceListItemId?: string | null;
};

export type LineChange = { prevCredits?: number; prevTier?: ComplexityTier | null; prevQuantity?: number; isNew?: boolean };

/** Matches lines by name (display name), so the client sees what changed between two versions. */
export function diffEstimate(prev: SnapshotLine[], next: { deliverable: string; quantity: number; complexityTier: ComplexityTier | null; credits: number }[]) {
  const unused = [...prev];
  const changes = next.map((line): LineChange | null => {
    const i = unused.findIndex((p) => p.deliverable === line.deliverable);
    if (i < 0) return { isNew: true };
    const [p] = unused.splice(i, 1);
    if (p.credits === line.credits && p.quantity === line.quantity && p.complexityTier === line.complexityTier) return null;
    return { prevCredits: p.credits, prevTier: p.complexityTier, prevQuantity: p.quantity };
  });
  return { changes, removed: unused };
}
