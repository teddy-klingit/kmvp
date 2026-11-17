import { prisma } from "@/lib/prisma";
import type { CreditModel } from "@/lib/revenue";

/**
 * Phase X v2: one read of the data layer (MetricDaily) for an Insights tab, with one credit rule, so the numbers on
 * Overview, Paid ads, Email and Sales always agree. Same rule as Phase V's loadRevenue: shared credit averages first
 * and last touch; a source that only reports last touch counts as-is under every choice.
 */
export type LayerRow = { date: string; source: string; channel: string; campaignId: string; campaignName: string; utmContent: string; outputId: string | null; market: string; path: string; model: string; page: string; metric: string; value: number; currency: string };

const CREDITED = new Set(["orders", "new_customers", "revenue", "leads", "qualified", "deals", "won", "won_value"]);
export const AD_PLATFORMS = ["Meta", "Google", "LinkedIn", "TikTok"] as const;
const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The ad platform a sales channel belongs to ("Google Ads" → Google), or null for email, organic, retail fairs… */
export function adPlatformOf(channel: string): (typeof AD_PLATFORMS)[number] | null {
  if (/organic/i.test(channel)) return null;
  if (/^meta|facebook|instagram ads/i.test(channel)) return "Meta";
  if (/^google ads|^google$/i.test(channel)) return "Google";
  if (/^linkedin/i.test(channel)) return "LinkedIn";
  if (/^tiktok/i.test(channel)) return "TikTok";
  return null;
}

/** Where a sale came from, in the Sales tab's words. */
export type SalesGroup = "Retail deals" | "Meta ads" | "Google Ads" | "LinkedIn ads" | "TikTok ads" | "Email" | "Search & direct" | "Organic social" | "Other";
export function salesGroupOf(r: Pick<LayerRow, "channel" | "path">): SalesGroup {
  if (r.path === "retail") return "Retail deals";
  const ad = adPlatformOf(r.channel);
  if (ad) return ad === "Google" ? "Google Ads" : (`${ad} ads` as SalesGroup);
  if (/klaviyo|email|newsletter/i.test(r.channel)) return "Email";
  if (/organic/i.test(r.channel) && /instagram|tiktok|linkedin|facebook|pinterest|youtube/i.test(r.channel)) return "Organic social";
  if (/unattributed|direct|search|google organic|seo/i.test(r.channel)) return "Search & direct";
  return "Other";
}

export async function loadLayer(clientId: string, opts: { days: number; model?: CreditModel; now?: Date }) {
  const now = opts.now ?? new Date();
  const days = opts.days;
  const model = opts.model ?? "shared";
  const start = iso(new Date(now.getTime() - (days - 1) * DAY));
  const prevStart = iso(new Date(now.getTime() - (2 * days - 1) * DAY));
  const today = iso(now);
  const all: LayerRow[] = await prisma.metricDaily.findMany({
    where: { clientId, date: { gte: prevStart, lte: today } },
    select: { date: true, source: true, channel: true, campaignId: true, campaignName: true, utmContent: true, outputId: true, market: true, path: true, model: true, page: true, metric: true, value: true, currency: true },
  });
  // Page-level rows (a site page's visits and orders) are a breakdown of the totals, never added to them.
  const rows = all.filter((r) => !r.page);
  const pageRows = all.filter((r) => r.page && r.date >= iso(new Date(now.getTime() - (days - 1) * DAY)));
  const lastOnly = [...new Set(rows.filter((r) => CREDITED.has(r.metric) && r.model === "last").map((r) => r.source))].filter((s) => !rows.some((r) => r.source === s && CREDITED.has(r.metric) && r.model === "first"));
  const weight = (r: LayerRow) => {
    if (!CREDITED.has(r.metric)) return r.model === "" ? 1 : 0;
    if (r.model === "") return 1;
    if (lastOnly.includes(r.source)) return r.model === "last" ? 1 : 0;
    if (model === "shared") return 0.5;
    return r.model === model ? 1 : 0;
  };
  const cur = rows.filter((r) => r.date >= start);
  const prev = rows.filter((r) => r.date < start);
  const sum = (xs: LayerRow[], metric: string, where: (r: LayerRow) => boolean = () => true) => xs.reduce((a, r) => (r.metric === metric && where(r) ? a + r.value * weight(r) : a), 0);
  /** Sales: online revenue plus won retail deals. */
  const sales = (xs: LayerRow[], where: (r: LayerRow) => boolean = () => true) => sum(xs, "revenue", (r) => r.path === "online" && where(r)) + sum(xs, "won_value", (r) => r.path === "retail" && where(r));
  // The previous period only counts when stored numbers cover all of it.
  const earliest = rows.reduce<string | null>((m, r) => (!m || r.date < m ? r.date : m), null);
  const coversPrev = earliest !== null && earliest <= prevStart;
  /** The current period in `n` equal slices (oldest first), for sparklines. */
  const slices = (n = 6) => {
    const size = Math.max(1, Math.round(days / n));
    return Array.from({ length: n }, (_, i) => {
      const from = iso(new Date(now.getTime() - (days - 1 - i * size) * DAY));
      const to = i === n - 1 ? today : iso(new Date(now.getTime() - (days - 1 - (i + 1) * size) * DAY - DAY));
      return cur.filter((r) => r.date >= from && r.date <= to);
    });
  };
  const currency = rows.find((r) => r.metric === "revenue" || r.metric === "spend")?.currency || "EUR";
  const sourcesOf = (xs: LayerRow[], metrics: string[], where: (r: LayerRow) => boolean = () => true) => [...new Set(xs.filter((r) => metrics.includes(r.metric) && where(r) && r.value).map((r) => r.source))];
  return { rows, pageRows, cur, prev, sum, sales, weight, coversPrev, slices, currency, sourcesOf, lastOnly, start, days, model };
}
export type Layer = Awaited<ReturnType<typeof loadLayer>>;

/** "+18%", "−9%": a change as a share of the previous value; null when there's no previous value to compare. */
export function changePct(now: number, before: number | null | undefined) {
  if (!before) return null;
  return (now - before) / Math.abs(before);
}
