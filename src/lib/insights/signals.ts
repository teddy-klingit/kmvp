import type { MarketSignal } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { SERIES } from "@/components/insights/tokens";
import type { RangeDays } from "@/lib/insights/daily";

/**
 * Market signals for the charts: counted per calendar week (Monday start) by type, and a performance signal's
 * before → after CTR (from MarketSignal.data, or parsed from the summary older signals were written with).
 */

export const SIGNAL_TYPES = [
  { type: "TREND", label: "Trend", color: SERIES[0] },
  { type: "COMPETITOR", label: "Competitor", color: SERIES[1] },
  { type: "PERFORMANCE", label: "Your ads", color: SERIES[2] },
  { type: "MARKET", label: "Industry news", color: SERIES[3] },
] as const;

const DAY = 86400000;
const monday = (d: Date) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
};
const label = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);

/** How many weeks a range shows: at least 4, so a 7-day view still has something to compare with. */
export const weeksFor = (days: RangeDays) => (days === 90 ? 13 : days === 30 ? 6 : 4);

export function signalsPerWeek(signals: Pick<MarketSignal, "type" | "publishedAt">[], weeks: number, now = new Date()) {
  const start = monday(new Date(now.getTime() - (weeks - 1) * 7 * DAY));
  const buckets = Array.from({ length: weeks }, (_, i) => ({ start: new Date(start.getTime() + i * 7 * DAY), counts: new Map<string, number>() }));
  for (const s of signals) {
    const i = Math.floor((monday(s.publishedAt).getTime() - start.getTime()) / (7 * DAY));
    if (i < 0 || i >= weeks) continue;
    buckets[i].counts.set(s.type, (buckets[i].counts.get(s.type) ?? 0) + 1);
  }
  const present = SIGNAL_TYPES.filter((t) => buckets.some((b) => b.counts.get(t.type)));
  return {
    series: present.map((t) => ({ name: t.label, color: t.color })),
    data: buckets.map((b) => ({ x: label(b.start), values: present.map((t) => b.counts.get(t.type) ?? 0) })),
    totals: present.map((t) => ({ label: t.label, color: t.color, value: buckets.reduce((a, b) => a + (b.counts.get(t.type) ?? 0), 0) })),
    total: buckets.reduce((a, b) => a + [...b.counts.values()].reduce((x, y) => x + y, 0), 0),
  };
}

export async function loadSignals(clientId: string, weeks: number) {
  const since = monday(new Date(Date.now() - (weeks - 1) * 7 * DAY));
  return prisma.marketSignal.findMany({ where: { clientId, archivedAt: null, publishedAt: { gte: since } }, orderBy: { publishedAt: "desc" } });
}

/** A performance signal's CTR before → after, or null. */
export function perfChange(s: Pick<MarketSignal, "type" | "summary" | "data">): { before: number; after: number } | null {
  if (s.type !== "PERFORMANCE") return null;
  const d = s.data as { before?: number; after?: number } | null;
  if (d && typeof d.before === "number" && typeof d.after === "number") return { before: d.before, after: d.after };
  const m = s.summary.match(/([\d.]+)% → ([\d.]+)%/);
  return m ? { before: Number(m[1]), after: Number(m[2]) } : null;
}

/** Where a signal came from, short: "LinkedIn", "LinkedIn Ad Library", "FF News", "Industry news". */
export function signalSource(s: Pick<MarketSignal, "type" | "summary" | "source">) {
  if (s.type === "PERFORMANCE") return s.source ?? s.summary.split(":")[0];
  if (s.type === "COMPETITOR") return s.source ? (/Google/.test(s.source) ? "Google Ads Transparency" : `${s.source} Ad Library`) : "Ad Library";
  if (s.source && s.source !== "News") return s.source;
  return s.summary.match(/^Covered by (.+?)\.?$/)?.[1] ?? "Industry news";
}

/** Channel colours for competitor ads: Meta, LinkedIn, Google (Google has no stored history, so no new-ad counts). */
export const CHANNEL_COLOR: Record<string, string> = { Meta: SERIES[0], LinkedIn: SERIES[1], Google: SERIES[3] };

/**
 * New ads per competitor and channel in the last `days`: for each stored snapshot inside the window, the ads it
 * saw that the check before it hadn't. The very first check of a brand has nothing to compare with, so it adds none.
 */
export async function newAdsByChannel(clientId: string, days: number) {
  const since = new Date(Date.now() - days * DAY);
  const snaps = await prisma.competitorSnapshot.findMany({ where: { clientId }, orderBy: { capturedAt: "asc" }, select: { brand: true, platform: true, adIds: true, capturedAt: true } });
  const last = new Map<string, Set<string>>();
  const out = new Map<string, Map<string, number>>();
  for (const s of snaps) {
    const key = `${s.brand}|${s.platform}`;
    const ids = new Set(Array.isArray(s.adIds) ? (s.adIds as string[]) : []);
    const prev = last.get(key);
    if (prev && s.capturedAt >= since) {
      const fresh = [...ids].filter((id) => !prev.has(id)).length;
      const brand = out.get(s.brand) ?? new Map<string, number>();
      brand.set(s.platform, (brand.get(s.platform) ?? 0) + fresh);
      out.set(s.brand, brand);
    } else if (s.capturedAt >= since && !out.has(s.brand)) {
      out.set(s.brand, new Map());
    }
    last.set(key, ids);
  }
  return out;
}
