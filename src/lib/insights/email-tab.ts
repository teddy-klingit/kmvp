import { prisma } from "@/lib/prisma";
import { changePct, loadLayer, salesGroupOf, type LayerRow } from "@/lib/insights/layer";

/**
 * Insights → Email (Phase X v2, design Ins4Email): do the newsletters and automatic emails sell. "Sales from email"
 * is the same number as Email on Sales (the shop's orders, same credit rule). The split into flows and newsletters,
 * the best and worst sends, and list health are Klaviyo's own numbers: per flow (campaignId "flow:…") or send
 * ("send:…"), with sends, opens, clicks, reported_revenue and unsubscribes; subscribers and inactive_90d as daily
 * list snapshots.
 */
const kl = (r: LayerRow) => r.source === "Klaviyo";
const isFlow = (r: LayerRow) => r.campaignId.startsWith("flow:");
const isSend = (r: LayerRow) => r.campaignId.startsWith("send:");
/** Discount wording in a subject line. */
const DISCOUNT = /%|\boff\b|sale|discount|last chance|deal/i;

export async function loadEmailTab(clientId: string, opts: { days: number; now?: Date }) {
  const L = await loadLayer(clientId, { days: opts.days, now: opts.now });
  const { cur, prev, sum, sales } = L;
  const start = L.start;
  const asLayer = cur.filter(kl);
  const email = (r: LayerRow) => r.path === "online" && salesGroupOf(r) === "Email";
  const slices = L.slices();

  const total = (metric: string, where: (r: LayerRow) => boolean = () => true) => asLayer.reduce((a, r) => (r.metric === metric && where(r) ? a + r.value : a), 0);
  const rate = (metric: string, xs: LayerRow[]) => {
    const s = sum(xs, "sends", kl);
    return s ? (sum(xs, metric, kl) / s) * 100 : null;
  };
  const latest = (metric: string, before?: string) => [...asLayer].filter((r) => r.metric === metric && (!before || r.date < before)).sort((a, b) => b.date.localeCompare(a.date))[0]?.value ?? null;
  const subscribersNow = latest("subscribers");
  const subscribersAtStart = (await prisma.metricDaily.findFirst({ where: { clientId, source: "Klaviyo", metric: "subscribers", date: { lt: start } }, orderBy: { date: "desc" }, select: { value: true } }))?.value ?? null;

  const numbers = {
    sales: { value: sales(cur, email), change: L.coversPrev ? changePct(sales(cur, email), sales(prev, email)) : null, spark: slices.map((xs) => sales(xs, email)) },
    subscribers: { value: subscribersNow, growth: subscribersNow !== null && subscribersAtStart !== null ? subscribersNow - subscribersAtStart : null },
    open: { value: rate("opens", cur), previous: L.coversPrev ? rate("opens", prev) : null, spark: slices.map((xs) => rate("opens", xs) ?? 0) },
    click: { value: rate("clicks", cur), previous: L.coversPrev ? rate("clicks", prev) : null, spark: slices.map((xs) => rate("clicks", xs) ?? 0) },
  };

  // Flows vs newsletters, as Klaviyo reports what each sold.
  const flowNames = [...new Set(asLayer.filter(isFlow).map((r) => r.campaignId))];
  const flows = flowNames
    .map((id) => ({ id, name: asLayer.find((r) => r.campaignId === id)?.campaignName || id.slice(5), sales: total("reported_revenue", (r) => r.campaignId === id) }))
    .filter((f) => f.sales > 0)
    .sort((a, b) => b.sales - a.sales);
  const sendIds = [...new Set(asLayer.filter(isSend).map((r) => r.campaignId))];
  const newsletters = sendIds
    .map((id) => {
      const s = total("sends", (r) => r.campaignId === id);
      const r0 = asLayer.find((r) => r.campaignId === id)!;
      return { id, subject: r0.campaignName || id.slice(5), date: asLayer.filter((r) => r.campaignId === id).map((r) => r.date).sort()[0], sales: total("reported_revenue", (r) => r.campaignId === id), openRate: s ? (total("opens", (r) => r.campaignId === id) / s) * 100 : null, unsubscribes: total("unsubscribes", (r) => r.campaignId === id), sends: s };
    })
    .filter((n) => n.sends > 0);
  const flowSales = flows.reduce((a, f) => a + f.sales, 0);
  const newsletterSales = newsletters.reduce((a, n) => a + n.sales, 0);

  // Best and worst sends: the two that sold most, and the one with the fewest opens.
  const bySales = [...newsletters].sort((a, b) => b.sales - a.sales);
  const weakest = [...newsletters].filter((n) => n.openRate !== null).sort((a, b) => a.openRate! - b.openRate!)[0];
  const best = newsletters.length >= 3 ? [...bySales.slice(0, 2).map((n) => ({ ...n, tag: "Best" as const })), ...(weakest && !bySales.slice(0, 2).includes(weakest) ? [{ ...weakest, tag: "Weakest" as const }] : [])] : [];
  const discount = newsletters.filter((n) => DISCOUNT.test(n.subject) && n.openRate !== null);
  const calm = newsletters.filter((n) => !DISCOUNT.test(n.subject) && n.openRate !== null);
  const avg = (xs: typeof newsletters) => xs.reduce((a, n) => a + n.openRate!, 0) / xs.length;
  const discountRead = discount.length && calm.length && avg(calm) - avg(discount) >= 5 ? { discount: avg(discount), calm: avg(calm) } : null;

  // List health.
  const recipients = newsletters.reduce((a, n) => a + n.sends, 0);
  const unsubscribes = newsletters.reduce((a, n) => a + n.unsubscribes, 0);
  const inactive = latest("inactive_90d");
  const list = {
    subscribers: subscribersNow,
    growth: numbers.subscribers.growth,
    unsubscribeRate: recipients ? (unsubscribes / recipients) * 100 : null,
    inactive,
    inactiveShare: inactive !== null && subscribersNow ? inactive / subscribersNow : null,
  };

  const klaviyo = await prisma.dataSource.findUnique({ where: { clientId_source: { clientId, source: "Klaviyo" } }, select: { status: true, updatedAt: true } });
  return { currency: L.currency, numbers, flows, flowSales, newsletters, newsletterSales, best, discountRead, list, klaviyo, hasKlaviyoNumbers: asLayer.length > 0 };
}
export type EmailTab = Awaited<ReturnType<typeof loadEmailTab>>;
