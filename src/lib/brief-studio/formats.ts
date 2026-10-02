import { addBusinessDays, FIRST_DRAFT_BUSINESS_DAYS } from "@/lib/project-state";

/**
 * What a client can ask for, mapped to the Price List: the studio's format chips, the estimate preview and the
 * earliest realistic deadline all read this one catalogue.
 */

export type DeliverableKind = "ads" | "social" | "deck" | "video" | "web" | "email" | "brand" | "other";
type Tier = "LOW" | "MEDIUM" | "HIGH";

export type FormatDef = {
  id: string;
  label: string;
  kinds: DeliverableKind[];
  /** PriceListItem.deliverableType it's priced as. */
  priceType: string;
  /** Typical units in one project (a set of ad variants, a deck's slides). */
  qty: [number, number];
  tiers: [Tier, Tier];
  /** Matches an existing Asset.format, so past performance can be read per format. */
  matches: RegExp;
};

export const FORMAT_CATALOG: FormatDef[] = [
  { id: "stories", label: "Stories 9:16", kinds: ["ads", "social"], priceType: "Social post (static)", qty: [3, 4], tiers: ["MEDIUM", "HIGH"], matches: /^(story|stories)\b|story 9:16/i },
  { id: "carousel", label: "Carousel", kinds: ["ads", "social"], priceType: "Social post (static)", qty: [2, 3], tiers: ["MEDIUM", "HIGH"], matches: /carousel/i },
  { id: "static", label: "Static 1:1", kinds: ["ads", "social"], priceType: "Social post (static)", qty: [3, 4], tiers: ["LOW", "MEDIUM"], matches: /static|feed post|1:1/i },
  { id: "reels", label: "Reels / video", kinds: ["ads", "social", "video"], priceType: "Video cutdown (<30s)", qty: [1, 2], tiers: ["MEDIUM", "HIGH"], matches: /reel|video 9:16|^video\b/i },
  { id: "banners", label: "Display banners", kinds: ["ads"], priceType: "Social post (static)", qty: [3, 4], tiers: ["LOW", "MEDIUM"], matches: /banner|\d+\s*[×x]\s*\d+/i },
  { id: "deck_short", label: "Deck, about 10 slides", kinds: ["deck"], priceType: "PPT slide", qty: [8, 12], tiers: ["MEDIUM", "MEDIUM"], matches: /deck|slides?/i },
  { id: "deck_long", label: "Deck, 20+ slides", kinds: ["deck"], priceType: "PPT slide", qty: [20, 25], tiers: ["MEDIUM", "MEDIUM"], matches: /^$/ },
  { id: "data_slides", label: "Data visualisation slides", kinds: ["deck"], priceType: "PPT slide", qty: [3, 5], tiers: ["HIGH", "HIGH"], matches: /^$/ },
  { id: "cutdowns", label: "Video cutdowns", kinds: ["video"], priceType: "Video cutdown (<30s)", qty: [3, 4], tiers: ["LOW", "MEDIUM"], matches: /cutdown/i },
  { id: "film", label: "Full video", kinds: ["video"], priceType: "Full video production", qty: [1, 1], tiers: ["HIGH", "HIGH"], matches: /^$/ },
  { id: "landing", label: "Landing page", kinds: ["web"], priceType: "Landing page build", qty: [1, 1], tiers: ["MEDIUM", "HIGH"], matches: /landing|web page/i },
  { id: "email", label: "Email copy", kinds: ["email", "ads"], priceType: "Email copy", qty: [2, 3], tiers: ["LOW", "MEDIUM"], matches: /email|newsletter/i },
  { id: "guidelines", label: "Brand guidelines", kinds: ["brand"], priceType: "Brand guidelines deck", qty: [1, 1], tiers: ["HIGH", "HIGH"], matches: /guidelines/i },
];

export function formatsFor(kind: DeliverableKind) {
  const list = FORMAT_CATALOG.filter((f) => f.kinds.includes(kind));
  return list.length ? list : FORMAT_CATALOG.filter((f) => f.kinds.includes("ads"));
}

/** The catalogue entry for a chosen or typed format label ("Stories 9:16", "4 stories"). */
export function formatForLabel(label: string) {
  const exact = FORMAT_CATALOG.find((f) => f.label.toLowerCase() === label.trim().toLowerCase());
  if (exact) return exact;
  const l = label.toLowerCase();
  if (/stor(y|ies)/.test(l)) return FORMAT_CATALOG.find((f) => f.id === "stories")!;
  if (/reel|video ad|tiktok/.test(l)) return FORMAT_CATALOG.find((f) => f.id === "reels")!;
  return FORMAT_CATALOG.find((f) => f.matches.test(label)) ?? null;
}

/** The catalogue format an existing asset was made in (for past CTR per format). */
export function formatForAsset(assetFormat: string) {
  return FORMAT_CATALOG.find((f) => f.matches.test(assetFormat) && f.matches.source !== "^$") ?? null;
}

export type PriceEntry = { deliverableType: string; complexityTier: Tier; creditCost: number; leadTimeDays: number };

function cost(prices: PriceEntry[], type: string, tier: Tier) {
  const forType = prices.filter((p) => p.deliverableType === type);
  if (forType.length === 0) return null;
  const order: Tier[] = ["LOW", "MEDIUM", "HIGH"];
  // The tier itself, else the nearest one that's listed.
  const ranked = [...forType].sort((a, b) => Math.abs(order.indexOf(a.complexityTier) - order.indexOf(tier)) - Math.abs(order.indexOf(b.complexityTier) - order.indexOf(tier)));
  return ranked[0].creditCost;
}

/**
 * "Estimate preview": the Estimate agent's Price List lookup for the chosen formats, as a credit range
 * (typical quantity × the format's tiers). Null when no chosen format is on the price list.
 */
export function estimatePreview(deliverables: string[], prices: PriceEntry[]) {
  let low = 0;
  let high = 0;
  let priced = 0;
  for (const label of deliverables) {
    const f = formatForLabel(label);
    if (!f) continue;
    const lo = cost(prices, f.priceType, f.tiers[0]);
    const hi = cost(prices, f.priceType, f.tiers[1]);
    if (lo === null || hi === null) continue;
    low += f.qty[0] * lo;
    high += f.qty[1] * hi;
    priced++;
  }
  return priced ? { low, high } : null;
}

/** The longest Price List lead time among the chosen formats (business days, staffing to final). */
export function leadTimeFor(deliverables: string[], prices: PriceEntry[]) {
  const days = deliverables
    .map((l) => formatForLabel(l))
    .filter((f): f is FormatDef => Boolean(f))
    .flatMap((f) => prices.filter((p) => p.deliverableType === f.priceType).map((p) => p.leadTimeDays));
  return days.length ? Math.max(...days) : 5;
}

/** Earliest realistic dates: the first draft by the 2-business-day rule, the final after the lead time on top. */
export function earliestDates(deliverables: string[], prices: PriceEntry[], now = new Date()) {
  const firstDraft = addBusinessDays(now, FIRST_DRAFT_BUSINESS_DAYS);
  const final = addBusinessDays(now, FIRST_DRAFT_BUSINESS_DAYS + leadTimeFor(deliverables, prices));
  return { firstDraft, final };
}

export function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromIsoDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
