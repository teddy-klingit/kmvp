import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/platform-settings";
import { categoryFor, isCategory } from "@/lib/output-categories";

/**
 * Insights → Revenue (Phase V, design InsightsRevenue): from first click to revenue, worked out in code from the
 * data layer (MetricDaily) only. Every number has its sources; nothing is estimated or filled in. When a source is
 * missing, the page says what can't be seen yet.
 *
 * Credit for a sale ("model"): first touch, last touch, or shared (the average of the two, the default). A source
 * that only reports last touch is used as-is under every model, and the page says so.
 */

export type CreditModel = "first" | "last" | "shared";
export type RevenuePeriod = 30 | 90 | 365;
export const parsePeriod = (v: string | undefined): RevenuePeriod => (v === "30" ? 30 : v === "365" ? 365 : 90);
export const parseModel = (v: string | undefined): CreditModel => (v === "first" ? "first" : v === "last" ? "last" : "shared");

/** Metrics that are credited to a channel (stored per model); the rest are counts the source reports as they are. */
const CREDITED = new Set(["orders", "new_customers", "revenue", "leads", "qualified", "deals", "won", "won_value"]);
const AD_SOURCES = new Set(["Meta", "Google", "LinkedIn", "TikTok"]);
const SALES_SOURCES = ["Shopify", "HubSpot", "Klaviyo"];
export { sourceLabel } from "@/lib/revenue-labels";
import { sourceLabel } from "@/lib/revenue-labels";

type Row = { date: string; source: string; channel: string; campaignId: string; campaignName: string; utmCampaign: string; outputId: string | null; market: string; path: string; model: string; metric: string; value: number; currency: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86400000;

export async function loadRevenue(clientId: string, opts: { days?: RevenuePeriod; model?: CreditModel; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 90;
  const model = opts.model ?? "shared";
  const start = iso(new Date(now.getTime() - (days - 1) * DAY));
  const prevStart = iso(new Date(now.getTime() - (2 * days - 1) * DAY));
  const today = iso(now);

  const [sources, rows, typical] = await Promise.all([
    prisma.dataSource.findMany({ where: { clientId }, orderBy: { source: "asc" } }),
    prisma.metricDaily.findMany({
      where: { clientId, date: { gte: prevStart, lte: today } },
      select: { date: true, source: true, channel: true, campaignId: true, campaignName: true, utmCampaign: true, outputId: true, market: true, path: true, model: true, metric: true, value: true, currency: true },
    }),
    getSetting("funnelTypical"),
  ]);
  const salesConnected = sources.filter((s) => SALES_SOURCES.includes(s.source) && ["connected", "needs_reconnect", "error"].includes(s.status));
  const cur = rows.filter((r) => r.date >= start);
  const prev = rows.filter((r) => r.date < start);
  const currency = rows.find((r) => CREDITED.has(r.metric))?.currency || rows.find((r) => r.metric === "spend")?.currency || "EUR";

  // Sources that only report last touch: used as-is under every credit model.
  const lastOnly = [...new Set(rows.filter((r) => CREDITED.has(r.metric) && r.model === "last").map((r) => r.source))].filter((s) => !rows.some((r) => r.source === s && CREDITED.has(r.metric) && r.model === "first"));
  /** A row's weight under the chosen credit model (0 = not counted). */
  const weight = (r: Row) => {
    if (!CREDITED.has(r.metric)) return r.model === "" ? 1 : 0;
    if (r.model === "") return 1;
    if (lastOnly.includes(r.source)) return r.model === "last" ? 1 : 0;
    if (model === "shared") return 0.5;
    return r.model === model ? 1 : 0;
  };
  const total = (xs: Row[], metric: string, where: (r: Row) => boolean = () => true) => xs.reduce((a, r) => (r.metric === metric && where(r) ? a + r.value * weight(r) : a), 0);
  const sourcesOf = (xs: Row[], metrics: string[], where: (r: Row) => boolean = () => true) => [...new Set(xs.filter((r) => metrics.includes(r.metric) && where(r) && r.value).map((r) => r.source))];

  const online = (r: Row) => r.path === "online";
  const retail = (r: Row) => r.path === "retail";
  const revenueOf = (xs: Row[]) => total(xs, "revenue", online) + total(xs, "won_value", retail);
  const revenue = revenueOf(cur);
  const revenuePrev = revenueOf(prev);
  // The previous period only counts when the stored numbers cover all of it.
  const earliest = rows.filter((r) => CREDITED.has(r.metric)).reduce<string | null>((m, r) => (!m || r.date < m ? r.date : m), null);
  const coversPrev = earliest !== null && earliest <= prevStart;
  const spend = total(cur, "spend");
  const spendSources = sourcesOf(cur, ["spend"]);
  const newOnline = total(cur, "new_customers", online);
  const won = total(cur, "won", retail);

  // Open pipeline: the newest snapshot.
  const snap = (metric: string) => rows.filter((r) => r.metric === metric).sort((a, b) => b.date.localeCompare(a.date))[0]?.value ?? null;
  const openValue = snap("open_value");
  const openDeals = snap("open_deals");

  const tiles = {
    revenue: { value: revenue, previous: coversPrev && revenuePrev ? revenuePrev : null, change: coversPrev && revenuePrev ? (revenue - revenuePrev) / revenuePrev : null, sources: sourcesOf(cur, ["revenue", "won_value"]) },
    roas: { value: spend ? revenue / spend : null, spend, sources: [...spendSources, ...sourcesOf(cur, ["revenue", "won_value"])] },
    perCustomer: { online: newOnline && spend ? spend / newOnline : null, retail: won && spend ? spend / won : null, newOnline, won, sources: [...spendSources.slice(0, 1), ...sourcesOf(cur, ["new_customers", "won"])] },
    pipeline: { openValue, openDeals, won, sources: openValue !== null ? ["HubSpot"] : [] },
  };

  // ─── From first click to revenue ─────────────────────────────────────────────
  const step = (label: string, value: number) => ({ label, value });
  const kept = (steps: { label: string; value: number }[]) => steps.map((s, i) => ({ ...s, kept: i === 0 || !steps[i - 1].value ? null : (s.value / steps[i - 1].value) * 100 }));
  const adRow = (r: Row) => AD_SOURCES.has(r.source);
  const onlineSteps = kept([step("Impressions", total(cur, "impressions", adRow)), step("Clicks", total(cur, "clicks", adRow)), step("Sessions", total(cur, "sessions")), step("Orders", total(cur, "orders", online))]);
  const retailSteps = kept([step("Leads", total(cur, "leads", retail)), step("Qualified", total(cur, "qualified", retail)), step("Deals", total(cur, "deals", retail)), step("Won", total(cur, "won", retail))]);
  const funnels = {
    online: { steps: onlineSteps, revenue: total(cur, "revenue", online), sources: [...sourcesOf(cur, ["impressions", "clicks"], adRow), ...sourcesOf(cur, ["sessions"]), ...sourcesOf(cur, ["orders"], online)], has: onlineSteps[3].value > 0 },
    retail: { steps: retailSteps, revenue: total(cur, "won_value", retail), sources: sourcesOf(cur, ["leads", "deals", "won"], retail), has: retailSteps[0].value > 0 || retailSteps[3].value > 0 },
  };

  // The biggest drop: the step furthest below its usual rate (staff-set), across both paths.
  const STEP_KEY = (a: string, b: string) => `${a.toLowerCase()}→${b.toLowerCase()}`;
  const drops = (["online", "retail"] as const).flatMap((path) =>
    funnels[path].has
      ? funnels[path].steps.slice(1).flatMap((s, i) => {
          const from = funnels[path].steps[i];
          const usual = typical[STEP_KEY(from.label, s.label)];
          return s.kept !== null && usual ? [{ path, from: from.label, to: s.label, kept: s.kept, usual, ratio: s.kept / usual }] : [];
        })
      : []
  );
  const worst = drops.filter((d) => d.ratio < 1).sort((a, b) => a.ratio - b.ratio)[0] ?? null;

  // What moves deals on: a piece of work whose deals close clearly more often than the rest (at least 5 deals).
  const deckRows = cur.filter((r) => retail(r) && r.outputId);
  const byOutput = new Map<string, { deals: number; won: number }>();
  for (const r of deckRows) {
    const o = byOutput.get(r.outputId!) ?? { deals: 0, won: 0 };
    if (r.metric === "deals") o.deals += r.value * weight(r);
    if (r.metric === "won") o.won += r.value * weight(r);
    byOutput.set(r.outputId!, o);
  }
  const overallClose = retailSteps[2].value ? retailSteps[3].value / retailSteps[2].value : null;
  const mover = [...byOutput.entries()].filter(([, o]) => o.deals >= 5).map(([id, o]) => ({ id, ...o, rate: o.won / o.deals })).sort((a, b) => b.rate - a.rate)[0];
  const moverTitle = mover && overallClose && mover.rate / overallClose >= 1.5 ? await outputTitle(mover.id) : null;

  // ─── By channel / campaign / market ──────────────────────────────────────────
  const projects = await prisma.project.findMany({ where: { clientId, utmSlug: { not: null } }, select: { utmSlug: true, name: true } });
  const campaignName = (r: Row) => (r.utmCampaign ? (projects.find((p) => p.utmSlug === r.utmCampaign)?.name ?? r.utmCampaign) : AD_SOURCES.has(r.source) && r.campaignName ? `${r.campaignName} (not mapped)` : "Unattributed");
  const table = (key: (r: Row) => string, opts: { spend?: boolean } = {}) => {
    const groups = new Map<string, Row[]>();
    for (const r of cur) {
      if (!["spend", "orders", "new_customers", "won", "revenue", "won_value"].includes(r.metric)) continue;
      if (r.metric === "spend" && opts.spend === false) continue;
      const k = key(r);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups.entries()]
      .map(([name, xs]) => {
        const sp = total(xs, "spend");
        const rev = revenueOf(xs);
        const customers = total(xs, "new_customers", online) + total(xs, "won", retail);
        return { name, spend: sp || null, orders: total(xs, "orders", online) || null, deals: total(xs, "won", retail) || null, revenue: rev, return: sp ? rev / sp : null, perCustomer: sp && customers ? sp / customers : null };
      })
      .filter((r) => r.spend || r.revenue || r.orders || r.deals)
      .sort((a, b) => (a.name === "Unattributed" ? 1 : b.name === "Unattributed" ? -1 : b.revenue - a.revenue || (b.spend ?? 0) - (a.spend ?? 0)));
  };
  // Ad spend isn't split by market by the platforms, so the market view shows sales only (and says so).
  const tables = { channel: table((r) => r.channel), campaign: table(campaignName), market: table((r) => r.market || "Not known", { spend: false }) };

  // ─── Work that brought revenue (through utm_content) ─────────────────────────
  const work = new Map<string, { revenue: number; orders: number; won: number; channels: Set<string>; last: string }>();
  for (const r of cur) {
    if (!r.outputId || !["revenue", "won_value", "orders", "won"].includes(r.metric)) continue;
    const w = work.get(r.outputId) ?? { revenue: 0, orders: 0, won: 0, channels: new Set<string>(), last: r.date };
    const v = r.value * weight(r);
    if (r.metric === "revenue" || r.metric === "won_value") w.revenue += v;
    if (r.metric === "orders") w.orders += v;
    if (r.metric === "won") w.won += v;
    w.channels.add(r.channel);
    if (r.date > w.last) w.last = r.date;
    work.set(r.outputId, w);
  }
  const topWork = await Promise.all(
    [...work.entries()]
      .filter(([, w]) => w.revenue > 0)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 4)
      .map(async ([id, w]) => ({ id, ...(await outputInfo(id, clientId)), revenue: w.revenue, orders: Math.round(w.orders), won: Math.round(w.won), channels: [...w.channels] }))
  );

  // ─── Data health and what we can't see yet ───────────────────────────────────
  const health = (src: string) => {
    const h = sources.find((s) => s.source === src)?.health as { withSource?: number } | null | undefined;
    return typeof h?.withSource === "number" ? h.withSource : null;
  };
  const ordersHealth = health("Shopify");
  const dealsHealth = health("HubSpot");
  const blind: { text: string; reconnect?: string; upload?: boolean }[] = [];
  for (const s of sources.filter((x) => ["needs_reconnect", "error"].includes(x.status))) blind.push({ text: `${sourceLabel(s.source)}: ${(s.lastError ?? "access expired").replace(/^Token/, "token")}, so its revenue counts as "direct".`, reconnect: "/settings/connections" });
  if (dealsHealth !== null && dealsHealth < 0.98) blind.push({ text: `${Math.round((1 - dealsHealth) * 100)}% of retail deals have no source. Ask sales to fill "Original source" on new deals.` });
  if (ordersHealth !== null && ordersHealth < 0.95) blind.push({ text: `${Math.round((1 - ordersHealth) * 100)}% of orders have no source, so they count as Unattributed.` });
  const store = total(cur, "store_revenue");
  if (funnels.retail.has && !store) blind.push({ text: "In-store sales after retail work. Connect your POS or upload monthly store sales.", upload: true });
  if (!salesConnected.some((s) => s.source === "Shopify")) blind.push({ text: "Online orders: connect your shop to follow clicks to orders." });
  if (!salesConnected.some((s) => s.source === "HubSpot")) blind.push({ text: "Retail and B2B deals: connect your CRM to follow leads to deals." });
  for (const s of lastOnly) blind.push({ text: `${sourceLabel(s)} only reports last touch, so first touch and shared use its last touch.` });

  const based = sources.filter((s) => s.status === "connected" && s.source !== "Market" && rows.some((r) => r.source === s.source)).map((s) => s.source);
  const coverageFrom = earliest && earliest > start ? earliest : null;

  return {
    currency,
    period: { days, start, coverageFrom },
    model,
    lastOnly,
    connected: salesConnected.length > 0,
    based,
    health: { orders: ordersHealth, deals: dealsHealth },
    sources: sources.filter((s) => s.source !== "Market").map((s) => ({ source: s.source, status: s.status, lastSyncAt: s.lastSyncAt, lastError: s.lastError, health: health(s.source), numbers: cur.filter((r) => r.source === s.source).length })),
    tiles,
    funnels,
    biggestDrop: worst,
    mover: moverTitle && mover && overallClose ? { title: moverTitle, won: Math.round(mover.won), deals: Math.round(mover.deals), times: mover.rate / overallClose, overall: overallClose } : null,
    tables,
    work: topWork,
    blind,
    /** Uploaded in-store sales in the period (kept apart from marketing revenue). */
    store: store || null,
  };
}
export type Revenue = Awaited<ReturnType<typeof loadRevenue>>;

async function outputTitle(id: string) {
  const a = await prisma.asset.findUnique({ where: { id }, select: { name: true } });
  if (a) return a.name;
  return (await prisma.skillOutput.findUnique({ where: { id }, select: { title: true } }))?.title ?? "a piece of work";
}

async function outputInfo(id: string, clientId: string) {
  const a = await prisma.asset.findFirst({ where: { id, clientId }, select: { name: true, format: true, platform: true, type: true, category: true, thumbnailColor: true, project: { select: { type: true } } } });
  if (a) {
    const category = isCategory(a.category) ? a.category : categoryFor({ format: a.format, type: a.type, channel: a.platform, projectType: a.project.type, title: a.name });
    return { title: a.name, href: `/library/${id}`, category, color: a.thumbnailColor };
  }
  const o = await prisma.skillOutput.findFirst({ where: { id, clientId }, select: { title: true } });
  return { title: o?.title ?? "Removed piece", href: o ? `/library/output/${id}` : null, category: "Other" as const, color: "var(--avatar-5)" };
}
