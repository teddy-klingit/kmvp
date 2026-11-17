import { prisma } from "@/lib/prisma";
import { AD_PLATFORMS, adPlatformOf, changePct, loadLayer, type LayerRow } from "@/lib/insights/layer";
import { loadMeasuredAssets } from "@/lib/insights-data";
import { WORK_TZ } from "@/lib/working-hours";
import { assetTitle } from "@/lib/asset-display";

/**
 * Insights → Paid ads (Phase X v2, design Ins4Paid): what the ads cost, what they brought back (sales credited to
 * each platform, shared credit), best and worst ads, budget pacing and ads getting tired. All from the data layer.
 */
const DAY = 86400000;
const isAd = (r: LayerRow) => (AD_PLATFORMS as readonly string[]).includes(r.source);
const monthKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: WORK_TZ, year: "numeric", month: "2-digit" }).format(d).slice(0, 7);

/** An ad is getting tired when people see it more than 4 times and its click rate drops by a third. */
export const TIRED_FREQUENCY = 4;
export const TIRED_DROP = 1 / 3;

export async function loadPaidTab(clientId: string, opts: { days: number; now?: Date }) {
  const now = opts.now ?? new Date();
  const L = await loadLayer(clientId, { days: opts.days, now });
  const { cur, prev, sum, sales } = L;
  const fromAds = (r: LayerRow) => adPlatformOf(r.channel) !== null;

  const spend = sum(cur, "spend", isAd);
  const spendPrev = sum(prev, "spend", isAd);
  const adSales = sales(cur, fromAds);
  const adSalesPrev = sales(prev, fromAds);
  // Cost per online order: spend on the platforms that sell online, over the online orders credited to them.
  const onlinePlatforms = AD_PLATFORMS.filter((p) => cur.some((r) => r.metric === "orders" && r.path === "online" && adPlatformOf(r.channel) === p && r.value));
  const costPerOrder = (xs: LayerRow[]) => {
    const orders = sum(xs, "orders", (r) => r.path === "online" && onlinePlatforms.includes(adPlatformOf(r.channel)!));
    const sp = sum(xs, "spend", (r) => onlinePlatforms.includes(r.source as (typeof AD_PLATFORMS)[number]));
    return orders ? sp / orders : null;
  };
  const ctr = (xs: LayerRow[]) => {
    const imp = sum(xs, "impressions", isAd);
    return imp ? (sum(xs, "clicks", isAd) / imp) * 100 : null;
  };
  const slices = L.slices();
  const numbers = {
    spend: { value: spend, change: L.coversPrev ? changePct(spend, spendPrev) : null, spark: slices.map((xs) => sum(xs, "spend", isAd)) },
    sales: { value: adSales, change: L.coversPrev ? changePct(adSales, adSalesPrev) : null, spark: slices.map((xs) => sales(xs, fromAds)) },
    costPerOrder: { value: costPerOrder(cur), previous: L.coversPrev ? costPerOrder(prev) : null, spark: slices.map((xs) => costPerOrder(xs) ?? 0) },
    ctr: { value: ctr(cur), previous: L.coversPrev ? ctr(prev) : null, spark: slices.map((xs) => ctr(xs) ?? 0) },
  };

  // ─── Where the money went, and what came back ────────────────────────────────
  const channels = AD_PLATFORMS.map((p) => {
    const sp = sum(cur, "spend", (r) => r.source === p);
    const online = sum(cur, "revenue", (r) => r.path === "online" && adPlatformOf(r.channel) === p);
    const retail = sum(cur, "won_value", (r) => r.path === "retail" && adPlatformOf(r.channel) === p);
    return { platform: p, spend: sp, sales: online + retail, retailOnly: retail > 0 && online === 0, return: sp ? (online + retail) / sp : null };
  }).filter((c) => c.spend || c.sales);

  // ─── Best and worst ads: delivered work with a click rate, and what its sales were worth per order ──────────
  const { measured } = await loadMeasuredAssets(clientId);
  const perPiece = new Map<string, { revenue: number; orders: number }>();
  for (const r of cur) {
    if (!r.outputId || r.path !== "online" || !fromAds(r) || (r.metric !== "revenue" && r.metric !== "orders")) continue;
    const p = perPiece.get(r.outputId) ?? { revenue: 0, orders: 0 };
    if (r.metric === "revenue") p.revenue += r.value * L.weight(r);
    else p.orders += r.value * L.weight(r);
    perPiece.set(r.outputId, p);
  }
  const ads = measured
    .map((a) => {
      const p = perPiece.get(a.id);
      return { id: a.id, title: a.title, format: a.format, platform: a.platform ?? null, ctr: a.ctr, thumbnail: a.thumbnail, color: a.color, orderValue: p && p.orders >= 5 ? p.revenue / p.orders : null };
    })
    .sort((a, b) => b.ctr - a.ctr);
  const best = ads.length >= 3 ? [...ads.slice(0, 2).map((a) => ({ ...a, tag: "Winner" as const })), { ...ads[ads.length - 1], tag: "Weakest" as const }] : [];

  // ─── Budget this month: spent so far against the plan, and where the month will end at this pace ────────────
  const month = monthKey(now);
  const budgets = await prisma.adBudget.findMany({ where: { clientId, month } });
  const plan = budgets.find((b) => b.channel === "")?.amount ?? (budgets.length ? budgets.reduce((a, b) => a + b.amount, 0) : null);
  const monthStart = `${month}-01`;
  const monthRows = await prisma.metricDaily.findMany({ where: { clientId, date: { gte: monthStart }, metric: "spend", source: { in: [...AD_PLATFORMS] } }, select: { source: true, value: true } });
  const spentMonth = monthRows.reduce((a, r) => a + r.value, 0);
  const dayOfMonth = Number(new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric" }).format(now));
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const projected = dayOfMonth ? (spentMonth / dayOfMonth) * daysInMonth : spentMonth;
  // Which channel is furthest under its own plan, when the plan is split by channel.
  const under = budgets
    .filter((b) => b.channel)
    .map((b) => ({ channel: b.channel, gap: b.amount - (monthRows.filter((r) => r.source === b.channel).reduce((a, r) => a + r.value, 0) / Math.max(1, dayOfMonth)) * daysInMonth }))
    .sort((a, b) => b.gap - a.gap)[0];
  const budget = plan ? { plan, spent: spentMonth, share: spentMonth / plan, projected, unspent: plan - projected, under: under && under.gap > 0 ? under.channel : null, day: dayOfMonth, days: daysInMonth } : null;

  // ─── Ads getting tired: seen more than 4 times per person while their click rate falls by a third ───────────
  const since = (d: number) => new Date(now.getTime() - d * DAY).toISOString().slice(0, 10);
  const pieceRows = await prisma.metricDaily.findMany({ where: { clientId, outputId: { not: null }, source: { in: [...AD_PLATFORMS] }, metric: { in: ["impressions", "clicks", "frequency"] }, date: { gte: since(28) } }, select: { outputId: true, date: true, metric: true, value: true } });
  const byPiece = new Map<string, typeof pieceRows>();
  for (const r of pieceRows) byPiece.set(r.outputId!, [...(byPiece.get(r.outputId!) ?? []), r]);
  const tired: { id: string; title: string; format: string | null; thumbnail: string | null; frequency: number; ctrBefore: number; ctrNow: number }[] = [];
  for (const [id, rs] of byPiece) {
    const latestFreq = rs.filter((r) => r.metric === "frequency").sort((a, b) => b.date.localeCompare(a.date))[0]?.value ?? null;
    const ctrIn = (from: string, to: string) => {
      const inside = rs.filter((r) => r.date >= from && r.date < to);
      const imp = inside.filter((r) => r.metric === "impressions").reduce((a, r) => a + r.value, 0);
      return imp >= 500 ? (inside.filter((r) => r.metric === "clicks").reduce((a, r) => a + r.value, 0) / imp) * 100 : null;
    };
    const before = ctrIn(since(28), since(21));
    const after = ctrIn(since(7), since(-1));
    if (latestFreq !== null && latestFreq > TIRED_FREQUENCY && before && after !== null && after <= before * (1 - TIRED_DROP)) {
      const a = measured.find((x) => x.id === id) ?? (await prisma.asset.findFirst({ where: { id, clientId }, select: { id: true, name: true, format: true } }).then((x) => (x ? { id: x.id, title: assetTitle(x.name, x.format), format: x.format, thumbnail: null } : null)));
      if (a) tired.push({ id, title: a.title, format: a.format ?? null, thumbnail: "thumbnail" in a ? (a.thumbnail ?? null) : null, frequency: latestFreq, ctrBefore: before, ctrNow: after });
    }
  }

  return {
    currency: L.currency,
    days: L.days,
    numbers,
    channels,
    best,
    budget,
    tired,
    sources: { spend: L.sourcesOf(cur, ["spend"], isAd), sales: L.sourcesOf(cur, ["revenue", "won_value"], fromAds) },
  };
}
export type PaidTab = Awaited<ReturnType<typeof loadPaidTab>>;
