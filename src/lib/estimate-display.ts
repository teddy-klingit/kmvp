import type { ComplexityTier } from "@/generated/prisma";

export const COMPLEXITY_LABEL: Record<ComplexityTier, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

type NamedLine = { deliverable: string; priceListItem?: { displayName: string | null } | null };

/** The client-facing name: the Price List row's display name ("Presentation slides"), else what the PM typed. */
export function lineName(line: NamedLine) {
  return line.priceListItem?.displayName ?? line.deliverable;
}
