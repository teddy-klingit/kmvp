/**
 * Output library categories (Phase U). Every output has one: stored when staff set it, otherwise mapped here from its
 * format, type, channel and the project's type. Safe to import in client components.
 */
export const CATEGORIES = ["Social", "Ads", "Presentations", "Video & motion", "Illustration", "Print", "Web", "Copy & email", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const isCategory = (c: unknown): c is Category => CATEGORIES.includes(c as Category);

const AD_CHANNEL = /meta|facebook|google|display|tiktok ads|linkedin ads|programmatic|youtube ads/i;

export function categoryFor(o: { format?: string | null; type?: string | null; channel?: string | null; projectType?: string | null; title?: string | null }): Category {
  const f = `${o.format ?? ""} ${o.title ?? ""}`.toLowerCase();
  if (/deck|slide|presentation|keynote|pptx|master template/.test(f) || o.projectType === "PRESENTATION") return "Presentations";
  if (o.type === "VIDEO" || /video|reel|motion|bumper|\bcut\b|film|animation|\bgif\b/.test(f) || o.projectType === "MOTION_VIDEO") return "Video & motion";
  if (/illustration|icon|character|\bmap\b|drawing/.test(f)) return "Illustration";
  if (/print|poster|flyer|\ba[3-6]\b|brochure|shelf|gift card|business card|retail display|packaging|leaflet/.test(f)) return "Print";
  if (o.type === "COPY" || /caption|copy|email|newsletter|headline|script/.test(f)) return "Copy & email";
  if (o.type === "HTML5" || /landing|web page|website|pdp|product page|\bweb\b/.test(f) || o.projectType === "DEVELOPMENT") return "Web";
  if (AD_CHANNEL.test(o.channel ?? "") || /\bad\b|ads|link ad|display|banner/.test(f)) return "Ads";
  if (/story|feed|post|carousel|static|square|instagram|linkedin|tiktok|\d+:\d+/.test(f) || /instagram|linkedin|tiktok|pinterest/i.test(o.channel ?? "")) return "Social";
  return "Other";
}

/** Labels a client or PM can pick in "+ Add how it did". */
export const FACT_LABELS = ["Printed", "Sent to", "Shared with", "Used in", "Leads", "Downloads", "Views", "Sales", "Other"] as const;
