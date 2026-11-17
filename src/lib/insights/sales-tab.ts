import { AD_PLATFORMS, adPlatformOf, changePct, loadLayer, salesGroupOf, type LayerRow, type SalesGroup } from "@/lib/insights/layer";
import type { CreditModel } from "@/lib/revenue";

/**
 * Insights → Sales (Phase X v2, design Ins4Sales): what marketing brought in and from where, new vs returning
 * customers. Same data layer and credit rule as Paid ads and the Overview, so the totals agree.
 */
const online = (r: LayerRow) => r.path === "online";
const retail = (r: LayerRow) => r.path === "retail";
const isAd = (r: LayerRow) => (AD_PLATFORMS as readonly string[]).includes(r.source);

export async function loadSalesTab(clientId: string, opts: { days: number; model: CreditModel; now?: Date }) {
  const L = await loadLayer(clientId, { days: opts.days, model: opts.model, now: opts.now });
  const { cur, prev, sum, sales } = L;
  const slices = L.slices();

  const total = sales(cur);
  const onlineSales = sum(cur, "revenue", online);
  const orders = sum(cur, "orders", online);
  const ordersPrev = sum(prev, "orders", online);
  const avgOrder = (xs: LayerRow[]) => {
    const o = sum(xs, "orders", online);
    return o ? sum(xs, "revenue", online) / o : null;
  };
  const won = sum(cur, "won", retail);
  const wonValue = sum(cur, "won_value", retail);
  const numbers = {
    sales: { value: total, change: L.coversPrev ? changePct(total, sales(prev)) : null, spark: slices.map((xs) => sales(xs)) },
    orders: { value: orders, change: L.coversPrev ? changePct(orders, ordersPrev) : null, spark: slices.map((xs) => sum(xs, "orders", online)) },
    avgOrder: { value: avgOrder(cur), previous: L.coversPrev ? avgOrder(prev) : null, spark: slices.map((xs) => avgOrder(xs) ?? 0) },
    won: { value: won, wonValue, spark: slices.map((xs) => sum(xs, "won", retail)) },
  };

  // Where the sales came from: one bar per source group, with its orders or deals.
  const groups = new Map<SalesGroup, { sales: number; orders: number; deals: number }>();
  for (const r of cur) {
    if (!["revenue", "won_value", "orders", "won"].includes(r.metric)) continue;
    if ((r.metric === "revenue" || r.metric === "orders") && !online(r)) continue;
    if ((r.metric === "won_value" || r.metric === "won") && !retail(r)) continue;
    const g = salesGroupOf(r);
    const x = groups.get(g) ?? { sales: 0, orders: 0, deals: 0 };
    const v = r.value * L.weight(r);
    if (r.metric === "revenue" || r.metric === "won_value") x.sales += v;
    else if (r.metric === "orders") x.orders += v;
    else x.deals += v;
    groups.set(g, x);
  }
  const from = [...groups.entries()].map(([group, x]) => ({ group, ...x })).filter((g) => g.sales > 0).sort((a, b) => b.sales - a.sales);

  // New and returning customers (online): what a new one cost to win, and where returning orders came from.
  const fresh = sum(cur, "new_customers", online);
  const returning = Math.max(0, orders - fresh);
  const onlineAdSpend = sum(cur, "spend", (r) => isAd(r) && cur.some((o) => o.metric === "orders" && online(o) && adPlatformOf(o.channel) === r.source));
  const emailOrders = sum(cur, "orders", (r) => online(r) && salesGroupOf(r) === "Email");
  const emailNew = sum(cur, "new_customers", (r) => online(r) && salesGroupOf(r) === "Email");
  const newRevenue = sum(cur, "new_customer_revenue", online);
  const cohort = (metric: string) => cur.filter((r) => r.metric === metric).sort((a, b) => b.date.localeCompare(a.date))[0]?.value ?? null;
  const customers = {
    fresh,
    returning,
    costToWin: fresh && onlineAdSpend ? onlineAdSpend / fresh : null,
    firstOrder: fresh && newRevenue ? newRevenue / fresh : null,
    returningOrder: returning && newRevenue ? (onlineSales - newRevenue) / returning : null,
    returningFromEmail: returning ? Math.max(0, emailOrders - emailNew) / returning : null,
    firstYearValue: cohort("customer_value_12m"),
  };

  return { currency: L.currency, numbers, from, customers, sources: { sales: L.sourcesOf(cur, ["revenue", "won_value"]), orders: L.sourcesOf(cur, ["orders"]), spend: L.sourcesOf(cur, ["spend"], isAd) }, onlineSales };
}
export type SalesTab = Awaited<ReturnType<typeof loadSalesTab>>;
