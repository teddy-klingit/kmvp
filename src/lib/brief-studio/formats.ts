import { addBusinessDays, FIRST_DRAFT_BUSINESS_DAYS } from "@/lib/project-state";
import { FORMATS, UNITS_PER_FORMAT, formatByLabel, type DeliverableKind, type FormatDef } from "@/lib/brief-studio/question-bank";

export type { DeliverableKind, FormatDef };

/**
 * Pricing and dates for the Brief studio: the estimate preview (ideas × sizes, priced from the Price List, with
 * the material answer moving the tiers) and the earliest realistic deadline.
 */

export { formatByLabel };

/** The bank format an existing asset was made in (for past CTR per format). */
export function formatForAsset(assetFormat: string) {
  if (/^video 9:16/i.test(assetFormat)) return FORMATS.find((f) => f.id === "meta_reels")!;
  return FORMATS.find((f) => f.channel === "Meta" && f.matches.test(assetFormat)) ?? FORMATS.find((f) => f.matches.test(assetFormat)) ?? null;
}

/** A Price List item as the studio needs it: its key (sourceKey), credits per unit and lead time. */
export type PriceEntry = { key: string; creditCost: number | null; leadTimeDays: number | null };

export const priceEntries = (rows: { sourceKey: string | null; creditCost: number | null; leadTimeDays: number | null; archivedAt: Date | null; status: string }[]): PriceEntry[] =>
  rows.filter((r) => r.sourceKey && !r.archivedAt && r.status !== "legacy").map((r) => ({ key: r.sourceKey!, creditCost: r.creditCost, leadTimeDays: r.leadTimeDays }));

function cost(prices: PriceEntry[], key: string) {
  return prices.find((p) => p.key === key)?.creditCost ?? null;
}

export type Material = { clientProvides?: string | null; klingitMakes?: string | null; needsShoot?: boolean };

/**
 * "Estimate preview": the Estimate agent's Price List lookup for what's being made. Units = ideas × sizes; with the
 * client's own material the format's usual item applies, Klingit creating the visuals (or a shoot) uses the richer
 * one. Formats not on the price list (a PM quotes them), and a shoot, are left out and named in `unpriced`.
 */
export function estimatePreview(d: { formats: string[]; ideasCount?: number | null }, prices: PriceEntry[], material: Material = {}) {
  const ideas = d.ideasCount && d.ideasCount > 0 ? d.ideasCount : 3;
  const makes = Boolean(material.needsShoot) || /klingit/i.test(material.klingitMakes ?? "");
  let low = 0;
  let high = 0;
  let priced = 0;
  const unpriced: string[] = [];
  for (const label of d.formats) {
    const f = formatByLabel(label);
    if (!f?.priceType) {
      unpriced.push(label);
      continue;
    }
    const lo = cost(prices, makes ? f.priceType[1] : f.priceType[0]);
    const hi = cost(prices, f.priceType[1]);
    if (lo === null || hi === null) {
      unpriced.push(label);
      continue;
    }
    const units = UNITS_PER_FORMAT[f.id] ?? ideas;
    low += units * lo;
    high += units * hi;
    priced++;
  }
  if (material.needsShoot) unpriced.push("Shoot");
  return priced ? { low, high, unpriced } : null;
}

/** The longest Price List lead time among the formats (business days, staffing to final). */
export function leadTimeFor(formats: string[], prices: PriceEntry[]) {
  const days = formats
    .map((l) => formatByLabel(l))
    .filter((f): f is FormatDef => Boolean(f?.priceType))
    .flatMap((f) => prices.filter((p) => f.priceType!.includes(p.key) && p.leadTimeDays != null).map((p) => p.leadTimeDays!));
  return days.length ? Math.max(...days) : 5;
}

/** Earliest realistic dates: the first draft by the 2-business-day rule, the final after the lead time on top. */
export function earliestDates(formats: string[], prices: PriceEntry[], now = new Date()) {
  const firstDraft = addBusinessDays(now, FIRST_DRAFT_BUSINESS_DAYS);
  const final = addBusinessDays(now, FIRST_DRAFT_BUSINESS_DAYS + leadTimeFor(formats, prices));
  return { firstDraft, final };
}

export function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromIsoDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
