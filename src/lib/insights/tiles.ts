import type { IconKind } from "@/components/insights/cards";
import type { PlatformCampaign } from "@/lib/performance";
import { compact, delta, money, pct, type Daily } from "@/lib/insights/daily";

/**
 * The paid stat tiles, shared by Overview (4) and Performance (5). From the stored daily rows when there are
 * some: sparklines are the real days, deltas only against a real previous period. A sample account has no
 * daily rows, so its tiles are the period totals without a sparkline.
 */
export type Tile = { key: string; icon: IconKind; label: string; value: string; context?: string | null; spark?: number[]; delta?: ReturnType<typeof delta> };

const series = (days: Daily["days"], f: (d: Daily["days"][number]) => number | null) => days.map(f).filter((v): v is number => v !== null);

export function paidTiles(daily: Daily, fallback: PlatformCampaign[], days: number, source: string): Tile[] {
  if (daily.has) {
    const t = daily.totals;
    const p = daily.previous;
    const cur = daily.currency;
    return [
      { key: "spend", icon: "spend", label: "Ad spend", value: money(t.spend, cur), context: `Last ${days} days · ${source}`, spark: series(daily.days, (d) => d.spend), delta: delta(t.spend, p?.spend, null) },
      { key: "impressions", icon: "impressions", label: "Impressions", value: compact(t.impressions), context: `Last ${days} days`, spark: series(daily.days, (d) => d.impressions), delta: delta(t.impressions, p?.impressions, null) },
      { key: "clicks", icon: "clicks", label: "Clicks", value: compact(t.clicks), context: `${compact(t.impressions)} impressions`, spark: series(daily.days, (d) => d.clicks), delta: delta(t.clicks, p?.clicks, true) },
      { key: "ctr", icon: "ctr", label: "Click-through rate", value: pct(t.ctr), context: "All live ads", spark: series(daily.days, (d) => (d.impressions >= 100 ? (d.clicks / d.impressions) * 100 : null)), delta: delta(t.ctr, p?.ctr, true) },
      ...(t.cpc !== null
        ? [{ key: "cpc", icon: "cpc" as const, label: "Cost per click", value: money(t.cpc, cur, 1), context: "All live ads", spark: series(daily.days, (d) => (d.clicks > 0 ? d.spend / d.clicks : null)), delta: delta(t.cpc, p?.cpc, false) }]
        : []),
    ];
  }
  if (fallback.length === 0) return [];
  const cur = new Set(fallback.map((c) => c.currency)).size === 1 ? fallback[0].currency : null;
  const spend = fallback.reduce((a, c) => a + c.spend, 0);
  const impressions = fallback.reduce((a, c) => a + c.impressions, 0);
  const clicks = fallback.reduce((a, c) => a + c.clicks, 0);
  const ctx = `Last 30 days · ${source}`;
  return [
    ...(cur ? [{ key: "spend", icon: "spend" as const, label: "Ad spend", value: money(spend, cur), context: ctx }] : []),
    { key: "impressions", icon: "impressions", label: "Impressions", value: compact(impressions), context: ctx },
    { key: "clicks", icon: "clicks", label: "Clicks", value: compact(clicks), context: `${compact(impressions)} impressions` },
    { key: "ctr", icon: "ctr", label: "Click-through rate", value: pct(impressions ? (clicks / impressions) * 100 : 0), context: "All ads" },
    ...(cur && clicks > 0 ? [{ key: "cpc", icon: "cpc" as const, label: "Cost per click", value: money(spend / clicks, cur, 1), context: "All ads" }] : []),
  ];
}
