import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { DEMO_ACCOUNT, guessStage, type SalesSettings } from "@/lib/sales-sources";
import { upsertCombinedOpportunity } from "@/lib/combined";

/**
 * Phase V demo (V6): ouhers' sales sources. Shopify (online), HubSpot (retail and wholesale pipeline) and Klaviyo are
 * connected demo sources; a staff-only switch shows HubSpot as "Setting up" (step 2, map stages) instead.
 */

const MIN = 60000;

function settingsFor(source: "Shopify" | "HubSpot" | "Klaviyo", login: string): SalesSettings {
  const d = DEMO_ACCOUNT[source];
  return { login, domain: d.domain, stages: d.stages?.map((s) => ({ ...s, mapTo: guessStage(s.name) })), pipelines: d.pipelines.map((name) => ({ name, selected: true })), currency: d.currency, historyMonths: 12 };
}

export async function seedPhaseVSources(ctx: { clientId: string; now: Date; login: string }) {
  const { clientId, now, login } = ctx;
  const rows = [
    { source: "Shopify" as const, account: "ouhers.com", lastSyncAt: new Date(now.getTime() - 10 * MIN) },
    { source: "HubSpot" as const, account: "ouhers (retail & wholesale)", lastSyncAt: new Date(now.getTime() - 25 * MIN) },
    { source: "Klaviyo" as const, account: "ouhers", lastSyncAt: new Date(now.getTime() - 60 * MIN) },
  ];
  for (const r of rows) {
    const data = { status: "connected", account: r.account, lastSyncAt: r.lastSyncAt, connectedAt: new Date(now.getTime() - 120 * 86400000), settings: settingsFor(r.source, login), health: DEMO_ACCOUNT[r.source].health ?? undefined, isDemo: true };
    await prisma.dataSource.upsert({ where: { clientId_source: { clientId, source: r.source } }, update: data, create: { clientId, source: r.source, ...data } });
  }
}

/** The second demo state: HubSpot half-way through its set-up (logged in, mapping stages), or back to connected. */
export async function setDemoHubSpotState(clientId: string, state: "connected" | "setting_up") {
  const ds = await prisma.dataSource.findUnique({ where: { clientId_source: { clientId, source: "HubSpot" } } });
  if (!ds?.isDemo) return false;
  const settings = (ds.settings ?? {}) as SalesSettings;
  await prisma.dataSource.update({ where: { id: ds.id }, data: { status: state, settings: { ...settings, step: state === "setting_up" ? 2 : undefined } } });
  return true;
}

// ─── Revenue: the InsightsRevenue design's numbers, consistent across tiles, funnels and table ─────────────────

/**
 * The last 90 days, "shared" credit (the average of first and last touch). First touch leans to the channels that
 * start a journey (Meta, LinkedIn, fairs), last touch to the ones that close it (Google, Klaviyo); both total the
 * same. The 90 days before are 1/1.18 of these, so revenue is +18% vs the previous 90 days.
 */
type Row = { channel: string; path: "online" | "retail"; output?: string; campaign: string; m: Record<string, number> };
const ONLINE: Row[] = [
  // Stories sell at €62 an order, Feed at €45 (the OpportunityCombined design's numbers).
  { channel: "Meta", path: "online", output: "whipped", campaign: "q4-cloud-cream-push", m: { orders: 1160, new_customers: 860, revenue: 71920 } },
  { channel: "Meta", path: "online", output: "summerFeed", campaign: "summer", m: { orders: 750, new_customers: 545, revenue: 33750 } },
  { channel: "Google Ads", path: "online", campaign: "search-brand", m: { orders: 1390, new_customers: 1020, revenue: 56000 } },
  { channel: "Klaviyo email", path: "online", output: "newsletter", campaign: "newsletter", m: { orders: 410, new_customers: 90, revenue: 26000 } },
  { channel: "Klaviyo email", path: "online", campaign: "welcome-flow", m: { orders: 200, new_customers: 73, revenue: 21330 } },
  { channel: "Instagram (organic)", path: "online", output: "glass", campaign: "dew-drop-creators", m: { orders: 210, new_customers: 155, revenue: 9000 } },
  { channel: "Unattributed", path: "online", campaign: "", m: { orders: 190, new_customers: 127, revenue: 8000 } },
];
const RETAIL: Row[] = [
  { channel: "Meta", path: "retail", output: "deck", campaign: "retail-sell-in", m: { leads: 0, qualified: 0, deals: 4, won: 3, won_value: 36000 } },
  { channel: "Meta", path: "retail", campaign: "retail-leads", m: { leads: 400, qualified: 190, deals: 18, won: 9, won_value: 36000 } },
  { channel: "Google Ads", path: "retail", output: "deck", campaign: "retail-sell-in", m: { leads: 0, qualified: 0, deals: 4, won: 3, won_value: 35000 } },
  { channel: "Google Ads", path: "retail", campaign: "retail-search", m: { leads: 350, qualified: 165, deals: 16, won: 8, won_value: 30000 } },
  { channel: "LinkedIn (organic)", path: "retail", campaign: "linkedin-organic", m: { leads: 190, qualified: 90, deals: 10, won: 6, won_value: 38000 } },
  { channel: "Retail fairs", path: "retail", campaign: "retail-fairs", m: { leads: 120, qualified: 55, deals: 9, won: 2, won_value: 11000 } },
  { channel: "Unattributed", path: "retail", campaign: "", m: { leads: 180, qualified: 78, deals: 13, won: 0, won_value: 0 } },
];
/** Spend in the 90 days (Meta and Google come from their ad rows; these are the rest). */
const OTHER_SPEND = [
  { source: "Klaviyo", channel: "Klaviyo email", campaign: "newsletter", spend: 3100 },
  { source: "Offline", channel: "Retail fairs", campaign: "retail-fairs", spend: 15200 },
];
const SESSIONS: Record<string, number> = { Meta: 32000, "Google Ads": 64000, "Klaviyo email": 15000, Unattributed: 10000 };
const LEAN: Record<string, number> = { Meta: 0.12, "Google Ads": -0.1, "Klaviyo email": -0.25, "Instagram (organic)": 0.2, "LinkedIn (organic)": 0.2, "Retail fairs": 0.15, Unattributed: 0 };
const MARKETS = ["SE", "SE", "SE", "SE", "SE", "NO", "NO", "NO", "DK", "DK"];
const META_90 = { spend: 41200, impressions: 3_980_000 };
/** Meta spend per campaign in the 90 days: €17 an order on Stories (Q4, always-on), €19 on Feed (summer). */
const META_CAMPAIGN_SPEND: Record<string, number> = { "always-on | best performers | SE-NO-DK": 19720, "summer | sun day | SE-NO-DK": 14250 };
/** Meta's own count of the Story orders: 4% above Shopify's 1,160. */
const META_STORY_ORDERS = 1206;
const GOOGLE_90 = { spend: 29500, impressions: 2_220_000, clicks: 108_250 };
export const DEMO_REVENUE = { online: 226000, retail: 186000, spend: 89000, orders: 4310, openDeals: 38, openValue: 214000 };

/** Spreads a total over `n` days (index 0 = oldest) with a weekly rhythm; whole numbers add up exactly. */
function spread(total: number, n: number, whole: boolean, phase = 0) {
  const w = Array.from({ length: n }, (_, i) => 1 + 0.22 * Math.sin((2 * Math.PI * (i + phase)) / 7) + 0.004 * i);
  const sum = w.reduce((a, b) => a + b, 0);
  const raw = w.map((x) => (total * x) / sum);
  if (!whole) return raw.map((v) => Math.round(v * 100) / 100);
  const floor = raw.map(Math.floor);
  let left = Math.round(total) - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floor[i]++;
    left--;
  }
  return floor;
}

/** First and last touch totals for one metric across rows: they average to the shared value and keep its total. */
function credit(rows: Row[], metric: string) {
  const shared = rows.map((r) => r.m[metric] ?? 0);
  const total = shared.reduce((a, b) => a + b, 0);
  const lean = rows.map((r, i) => shared[i] * (LEAN[r.channel] ?? 0));
  const mean = total ? lean.reduce((a, b) => a + b, 0) / total : 0;
  const first = shared.map((s, i) => Math.round(s + lean[i] - s * mean));
  // Rounding: the first-touch total stays the shared total (the biggest row takes the difference).
  const diff = total - first.reduce((a, b) => a + b, 0);
  if (diff) first[shared.indexOf(Math.max(...shared))] += diff;
  return rows.map((_, i) => ({ first: first[i], last: 2 * shared[i] - first[i] }));
}

export async function seedPhaseVRevenue(ctx: { clientId: string; now: Date; projectSlug: (packProjectId: string) => Promise<string> }) {
  const { clientId, now } = ctx;
  const DAY = 86400000;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const day = (back: number) => iso(new Date(now.getTime() - back * DAY));
  const start90 = day(89);

  // ─── Ads: Meta to the design's scale in EUR (same campaigns, days and CTR); TikTok's token expired 12 days ago,
  // its last numbers are from before the window; Google Ads added. ───────────────────────────────────────────────
  const meta90 = await prisma.metricDaily.groupBy({ by: ["metric"], where: { clientId, source: "Meta", date: { gte: start90 } }, _sum: { value: true } });
  const sum = (m: string) => meta90.find((x) => x.metric === m)?._sum.value ?? 0;
  const fImp = sum("impressions") ? META_90.impressions / sum("impressions") : 0;
  await prisma.$executeRaw`UPDATE "MetricDaily" SET "value" = ROUND("value" * ${fImp}), "currency" = 'EUR' WHERE "clientId" = ${clientId} AND "source" = 'Meta' AND "metric" IN ('impressions', 'clicks', 'conversions')`;
  // Spend per campaign: the two named campaigns to their figures, the rest share what's left of the 90 days' total.
  const byCampaign = await prisma.metricDaily.groupBy({ by: ["campaignName"], where: { clientId, source: "Meta", metric: "spend", date: { gte: start90 } }, _sum: { value: true } });
  const rest = byCampaign.filter((c) => !(c.campaignName in META_CAMPAIGN_SPEND)).reduce((a, c) => a + (c._sum.value ?? 0), 0);
  const restTarget = META_90.spend - Object.values(META_CAMPAIGN_SPEND).reduce((a, b) => a + b, 0);
  for (const c of byCampaign) {
    const target = META_CAMPAIGN_SPEND[c.campaignName] ?? (rest ? ((c._sum.value ?? 0) / rest) * restTarget : 0);
    const f = c._sum.value ? target / c._sum.value : 0;
    await prisma.$executeRaw`UPDATE "MetricDaily" SET "value" = ROUND("value" * ${f}, 2), "currency" = 'EUR' WHERE "clientId" = ${clientId} AND "source" = 'Meta' AND "metric" = 'spend' AND "campaignName" = ${c.campaignName}`;
  }
  const storyConv = (await prisma.metricDaily.aggregate({ where: { clientId, source: "Meta", metric: "conversions", campaignName: "always-on | best performers | SE-NO-DK", date: { gte: start90 } }, _sum: { value: true } }))._sum.value ?? 0;
  if (storyConv) {
    const f = META_STORY_ORDERS / storyConv;
    await prisma.$executeRaw`UPDATE "MetricDaily" SET "value" = "value" * ${f} WHERE "clientId" = ${clientId} AND "source" = 'Meta' AND "metric" = 'conversions' AND "campaignName" = 'always-on | best performers | SE-NO-DK'`;
  }
  // The Meta spend rounding is settled on the newest day, so 90 days are exactly the design's figure.
  const metaSpend = (await prisma.metricDaily.aggregate({ where: { clientId, source: "Meta", metric: "spend", date: { gte: start90 } }, _sum: { value: true } }))._sum.value ?? 0;
  const newest = await prisma.metricDaily.findFirst({ where: { clientId, source: "Meta", metric: "spend" }, orderBy: [{ date: "desc" }, { value: "desc" }] });
  if (newest) await prisma.metricDaily.update({ where: { id: newest.id }, data: { value: Math.round((newest.value + META_90.spend - metaSpend) * 100) / 100 } });
  await prisma.metricDaily.updateMany({ where: { clientId, source: "Meta" }, data: { accountName: "ouhers EU (demo)" } });
  await prisma.metricDaily.deleteMany({ where: { clientId, source: "TikTok", date: { gte: start90 } } });
  await prisma.$executeRaw`UPDATE "MetricDaily" SET "value" = ROUND("value" / 11.5, 2), "currency" = 'EUR' WHERE "clientId" = ${clientId} AND "source" = 'TikTok' AND "metric" = 'spend'`;
  await prisma.metricDaily.updateMany({ where: { clientId, source: "TikTok" }, data: { currency: "EUR" } });

  const rows: Prisma.MetricDailyCreateManyInput[] = [];
  const push = (r: Omit<Prisma.MetricDailyCreateManyInput, "clientId">) => rows.push({ clientId, currency: "EUR", ...r });
  // Google Ads: three campaigns, 180 days (the 90 before at 85%).
  const GOOGLE = [
    { id: "g-brand", name: "search | brand | SE-NO-DK", share: 0.45 },
    { id: "g-skincare", name: "search | skincare | SE-NO-DK", share: 0.35 },
    { id: "g-shopping", name: "shopping | bestsellers | SE-NO-DK", share: 0.2 },
  ];
  for (const [w, factor, startBack] of [[0, 1, 89], [1, 0.85, 179]] as const) {
    for (const g of GOOGLE) {
      const n = 90;
      const s = spread(GOOGLE_90.spend * g.share * factor, n, false, w);
      const im = spread(GOOGLE_90.impressions * g.share * factor, n, true, w);
      const cl = spread(GOOGLE_90.clicks * g.share * factor, n, true, w);
      for (let i = 0; i < n; i++) {
        const date = day(startBack - i);
        const base = { date, source: "Google", channel: "Google Ads", campaignId: g.id, campaignName: g.name, accountName: "ouhers EU (demo)" };
        push({ ...base, metric: "spend", value: s[i] });
        push({ ...base, metric: "impressions", value: im[i] });
        push({ ...base, metric: "clicks", value: cl[i] });
      }
    }
  }

  // ─── Sales: Shopify (online), HubSpot (retail & wholesale), sessions (GA4), Klaviyo and the fairs ───────────
  const outputs = await prisma.asset.findMany({ where: { clientId, OR: [{ name: "whipped, weightless.", format: { startsWith: "Story" } }, { name: "sun day, every day", format: { startsWith: "Feed" } }, { name: { in: ["Launch deck for retail partners", "Summer newsletter", "Glass skin, minus the effort"] } }] }, select: { id: true, name: true, format: true } });
  const outputId: Record<string, string | undefined> = {
    whipped: outputs.find((o) => o.name.startsWith("whipped"))?.id,
    summerFeed: outputs.find((o) => o.name === "sun day, every day")?.id,
    deck: outputs.find((o) => o.name.startsWith("Launch deck"))?.id,
    newsletter: outputs.find((o) => o.name === "Summer newsletter")?.id,
    glass: outputs.find((o) => o.name.startsWith("Glass skin"))?.id,
  };
  const campaignSlug = { "q4-cloud-cream-push": await ctx.projectSlug("p04-q4-cloudcream"), summer: await ctx.projectSlug("p02-summer-sunday"), "dew-drop-creators": await ctx.projectSlug("p06-dewdrop-creators"), "retail-sell-in": await ctx.projectSlug("p09-retail-display") } as Record<string, string>;
  const SOURCE = { online: "Shopify", retail: "HubSpot" } as const;
  for (const [w, factor, startBack] of [[0, 1, 89], [3, 1 / 1.18, 179]] as const) {
    for (const group of [ONLINE, RETAIL]) {
      const metrics = Object.keys(group[0].m);
      for (const metric of metrics) {
        const scaled = group.map((r) => ({ ...r, m: { ...r.m, [metric]: Math.round((r.m[metric] ?? 0) * factor) } }));
        const credits = credit(scaled, metric);
        scaled.forEach((r, ri) => {
          for (const model of ["first", "last"] as const) {
            const v = credits[ri][model];
            if (!v) continue;
            const per = spread(v, 90, !/revenue|value/.test(metric), w + ri);
            for (let i = 0; i < 90; i++) {
              if (!per[i]) continue;
              const id = r.output ? outputId[r.output] : undefined;
              push({ date: day(startBack - i), source: SOURCE[r.path], channel: r.channel, utmCampaign: campaignSlug[r.campaign] ?? r.campaign, utmContent: id ?? "", outputId: id ?? null, market: MARKETS[(i + ri) % 10], path: r.path, model, metric, value: per[i] });
            }
          }
        });
      }
    }
    for (const [channel, total] of Object.entries(SESSIONS)) {
      const per = spread(total * factor, 90, true, w);
      for (let i = 0; i < 90; i++) push({ date: day(startBack - i), source: "GA4", channel, path: "online", metric: "sessions", value: per[i] });
    }
    for (const o of OTHER_SPEND) {
      const per = spread(o.spend * factor, 90, false, w);
      for (let i = 0; i < 90; i++) push({ date: day(startBack - i), source: o.source, channel: o.channel, campaignId: o.campaign, campaignName: o.campaign, utmCampaign: o.campaign, metric: "spend", value: per[i] });
    }
    // Klaviyo's own count of the revenue its emails brought (last touch, its own window): 8% above Shopify's.
    const kl = ONLINE.filter((r) => r.channel === "Klaviyo email").reduce((a, r) => a + r.m.revenue, 0);
    const per = spread(kl * 1.08 * factor, 90, false, w);
    for (let i = 0; i < 90; i++) push({ date: day(startBack - i), source: "Klaviyo", channel: "Klaviyo email", path: "online", model: "last", metric: "reported_revenue", value: per[i] });
  }
  // Story buyers' repeat orders within 60 days, with and without Klaviyo's welcome flow (cohort totals, no people).
  for (const [id, buyers, repeat] of [["cohort:story:flow", 1000, 410], ["cohort:story:noflow", 480, 82]] as const) {
    for (const [metric, value] of [["cohort_buyers", buyers], ["cohort_repeat_60d", repeat], ["cohort_repeat_value", repeat * 45]] as const) push({ date: day(0), source: "Shopify", channel: "Meta", campaignId: id, campaignName: id.endsWith(":flow") ? "Story buyers · welcome flow" : "Story buyers · no welcome flow", path: "online", metric, value });
  }
  // Open pipeline today (a snapshot, not a sum over days).
  push({ date: day(0), source: "HubSpot", channel: "All", path: "retail", metric: "open_deals", value: DEMO_REVENUE.openDeals });
  push({ date: day(0), source: "HubSpot", channel: "All", path: "retail", metric: "open_value", value: DEMO_REVENUE.openValue });
  await prisma.metricDaily.deleteMany({ where: { clientId, source: { in: ["Google", "Shopify", "HubSpot", "GA4", "Klaviyo", "Offline"] } } });
  for (let i = 0; i < rows.length; i += 1000) await prisma.metricDaily.createMany({ data: rows.slice(i, i + 1000) });

  // Staff's campaign mapping (Setup → Campaign mapping): the ad campaigns joined to the work. "lip ours" is left
  // unmapped, so it shows as not mapped.
  const MAP: [string, string, string][] = [
    ["Meta", "always-on | best performers | SE-NO-DK", campaignSlug["q4-cloud-cream-push"]],
    ["Meta", "summer | sun day | SE-NO-DK", campaignSlug.summer],
    ["Google", "search | brand | SE-NO-DK", "search-brand"],
    ["Google", "shopping | bestsellers | SE-NO-DK", "search-brand"],
    ["Google", "search | skincare | SE-NO-DK", "retail-search"],
  ];
  for (const [source, name, utmCampaign] of MAP) {
    const ad = await prisma.metricDaily.findFirst({ where: { clientId, source, campaignName: name }, select: { campaignId: true } });
    if (!ad) continue;
    await prisma.campaignMapping.upsert({ where: { clientId_source_campaignId: { clientId, source, campaignId: ad.campaignId } }, update: { utmCampaign, campaignName: name }, create: { clientId, source, campaignId: ad.campaignId, campaignName: name, utmCampaign } });
    await prisma.metricDaily.updateMany({ where: { clientId, source, campaignId: ad.campaignId }, data: { utmCampaign } });
  }

  // Black Friday in the Planner: 3 Feed ads and an email, no Stories (the opportunity's starting point).
  const friday = await prisma.keyMoment.findFirst({ where: { name: "Black Friday", date: { gte: now } }, orderBy: { date: "asc" } });
  const bf = await prisma.clientCalendarItem.findFirst({ where: { clientId, title: "Black Friday", archivedAt: null } });
  if (bf) await prisma.clientCalendarItem.update({ where: { id: bf.id }, data: { ...(friday ? { date: friday.date } : {}), formats: ["Feed ad", "Feed ad", "Feed ad", "Email"], channels: ["Meta", "Newsletter"], channel: "Meta", maker: "klingit_help" } });

  // ─── Sources: every one the tab is based on; TikTok's token expired 12 days ago ──────────────────────────────
  const expired = new Date(now.getTime() - 12 * DAY);
  const label = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(expired);
  const ds = [
    { source: "Meta", status: "connected", account: "ouhers EU (demo)" },
    { source: "Google", status: "connected", account: "ouhers EU (demo)" },
    { source: "GA4", status: "connected", account: "ouhers.com" },
    { source: "TikTok", status: "needs_reconnect", account: "ouhers tiktok (demo)", lastError: `Token expired ${label}` },
    { source: "Offline", status: "connected", account: "Retail fairs (uploaded)" },
  ];
  for (const d of ds) {
    const data = { status: d.status, account: d.account, lastError: d.lastError ?? null, lastSyncAt: d.status === "connected" ? new Date(now.getTime() - 20 * 60000) : expired, isDemo: true };
    await prisma.dataSource.upsert({ where: { clientId_source: { clientId, source: d.source } }, update: data, create: { clientId, source: d.source, connectedAt: new Date(now.getTime() - 120 * DAY), ...data } });
  }
  // The opportunity built from all of it (computed in code, lib/combined.ts).
  await upsertCombinedOpportunity(clientId, now, { isDemo: true });
  return rows.length;
}
