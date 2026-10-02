import { after } from "next/server";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { dailyMetricsFreshness, syncDailyAdMetrics, DAILY_WINDOW_DAYS } from "@/lib/integrations/ad-daily";

/**
 * Per-day ad numbers for Insights, read from AdDailyMetric (real days from the ad platforms). A day without a row
 * inside the stored window means the campaigns didn't deliver that day, so it counts as zero; nothing outside the
 * window is ever filled in.
 */

export type RangeDays = 7 | 30 | 90;
export const parseRange = (v: string | undefined): RangeDays => (v === "7" ? 7 : v === "90" ? 90 : 30);

export type DayPoint = { date: string; spend: number; clicks: number; impressions: number; conversions: number };
export type CampaignRow = {
  platform: string;
  campaignId: string;
  name: string;
  accountName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  /** Spent in the last 2 days of the range. */
  live: boolean;
  /** CTR over the last 7 days, and over the 23 before them (both null when there's too little delivery). */
  ctrLast7: number | null;
  ctrTrailing: number | null;
};
export type Totals = { spend: number; clicks: number; impressions: number; conversions: number; ctr: number; cpc: number | null };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysBack = (n: number, from = new Date()) => iso(new Date(from.getTime() - n * 86400000));

function totals(points: { spend: number; clicks: number; impressions: number; conversions: number }[]): Totals {
  const t = points.reduce((a, p) => ({ spend: a.spend + p.spend, clicks: a.clicks + p.clicks, impressions: a.impressions + p.impressions, conversions: a.conversions + p.conversions }), { spend: 0, clicks: 0, impressions: 0, conversions: 0 });
  return { ...t, ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0, cpc: t.clicks ? t.spend / t.clicks : null };
}

const ctrOf = (rows: { clicks: number; impressions: number }[]) => {
  const i = rows.reduce((a, r) => a + r.impressions, 0);
  const c = rows.reduce((a, r) => a + r.clicks, 0);
  return i >= 500 ? Math.round((c / i) * 10000) / 100 : null;
};

/** Makes sure the daily rows exist and are fresh: the very first time it waits for them, after that it refreshes behind the page. */
async function ensureDaily(clientId: string) {
  const { lastSynced, stale } = await dailyMetricsFreshness(clientId);
  if (!lastSynced) {
    await syncDailyAdMetrics(clientId).catch(() => undefined);
    return;
  }
  if (stale) {
    try {
      after(() => syncDailyAdMetrics(clientId).catch(() => undefined));
    } catch {
      // Outside a request (tests, scripts): the scheduler refreshes it.
    }
  }
}

export const loadDaily = cache(async (clientId: string, days: RangeDays, platform?: string | null) => {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { isSampleAccount: true, paidMediaInScope: true } });
  const live = !client.isSampleAccount && client.paidMediaInScope;
  if (live) await ensureDaily(clientId);
  const since = daysBack(Math.min(DAILY_WINDOW_DAYS, days * 2) - 1);
  const rows = live ? await prisma.adDailyMetric.findMany({ where: { clientId, date: { gte: since }, ...(platform ? { platform } : {}) }, orderBy: { date: "asc" } }) : [];
  const platforms = live ? [...new Set((await prisma.adDailyMetric.findMany({ where: { clientId }, select: { platform: true }, distinct: ["platform"] })).map((r) => r.platform))] : [];
  const start = daysBack(days - 1);
  const inRange = rows.filter((r) => r.date >= start);
  const prev = rows.filter((r) => r.date < start);

  const byDay = new Map<string, DayPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const d = daysBack(i);
    byDay.set(d, { date: d, spend: 0, clicks: 0, impressions: 0, conversions: 0 });
  }
  for (const r of inRange) {
    const p = byDay.get(r.date);
    if (!p) continue;
    p.spend += r.spend;
    p.clicks += r.clicks;
    p.impressions += r.impressions;
    p.conversions += r.conversions;
  }

  const last2 = daysBack(1);
  const last7 = daysBack(6);
  const trailingStart = daysBack(29);
  const allRecent = live ? await prisma.adDailyMetric.findMany({ where: { clientId, date: { gte: trailingStart }, ...(platform ? { platform } : {}) } }) : [];
  const campaigns = new Map<string, CampaignRow>();
  for (const r of inRange) {
    const key = `${r.platform}:${r.campaignId}`;
    const c = campaigns.get(key) ?? { platform: r.platform, campaignId: r.campaignId, name: r.campaignName, accountName: r.accountName, spend: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0, live: false, ctrLast7: null, ctrTrailing: null };
    c.spend += r.spend;
    c.impressions += r.impressions;
    c.clicks += r.clicks;
    c.conversions += r.conversions;
    if (r.date >= last2 && r.spend > 0) c.live = true;
    campaigns.set(key, c);
  }
  for (const c of campaigns.values()) {
    c.ctr = c.impressions ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0;
    const mine = allRecent.filter((r) => r.platform === c.platform && r.campaignId === c.campaignId);
    c.ctrLast7 = ctrOf(mine.filter((r) => r.date >= last7));
    c.ctrTrailing = ctrOf(mine.filter((r) => r.date < last7));
  }

  // A previous period only counts when the stored window covers all of it and the days were already being stored.
  const earliest = live ? (await prisma.adDailyMetric.findFirst({ where: { clientId, ...(platform ? { platform } : {}) }, orderBy: { date: "asc" }, select: { date: true } }))?.date : undefined;
  const coversPrevious = days * 2 <= DAILY_WINDOW_DAYS && earliest !== undefined && earliest <= daysBack(days * 2 - 1);
  return {
    has: inRange.length > 0,
    live,
    platforms,
    currency: rows[0]?.currency ?? null,
    accounts: [...new Set(rows.map((r) => `${r.platform} · ${r.accountName}`))],
    days: [...byDay.values()],
    totals: totals(inRange),
    previous: coversPrevious ? totals(prev) : null,
    campaigns: [...campaigns.values()].sort((a, b) => b.spend - a.spend),
  };
});

export type Daily = Awaited<ReturnType<typeof loadDaily>>;

/** "2 Sep" */
export const dayLabel = (isoDay: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${isoDay}T12:00:00`));

export function money(v: number, currency: string | null, decimals = 0) {
  const n = new Intl.NumberFormat("en-GB", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(v);
  return currency ? `${currency} ${n}` : n;
}

export function compact(v: number) {
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : v >= 10_000 ? `${Math.round(v / 1000)}K` : new Intl.NumberFormat("en-GB").format(Math.round(v));
}

export const pct = (v: number, d = v < 1 ? 2 : 1) => `${v.toFixed(d).replace(/\.0+$/, "")}%`;

/** A delta only against a real previous period. Only a change for the worse is flagged (orange). */
export function delta(now: number, before: number | null | undefined, goodWhenUp: boolean | null = true): { text: string; tone: "good" | "bad" | "neutral" } | null {
  if (before === null || before === undefined || before === 0) return null;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return { text: "same as before", tone: "neutral" };
  const up = change > 0;
  // null: neither direction is good or bad in itself (spend), so it's never flagged.
  return { text: `${up ? "+" : "−"}${Math.abs(change)}% vs previous`, tone: goodWhenUp === null ? "neutral" : up === goodWhenUp ? "good" : "bad" };
}

/** The timestamp `n` days ago (for "in the last n days" filters). */
export const sinceDays = (n: number) => Date.now() - n * 86400000;
