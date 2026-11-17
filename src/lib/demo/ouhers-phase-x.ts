import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { linkInsights, upsertInsight } from "@/lib/insight-records";
import { upsertCombinedOpportunity } from "@/lib/combined";
import { WORK_TZ } from "@/lib/working-hours";

/**
 * Phase X v2 on top of the ouhers pack: Insights at the designs' numbers (Ins4Overview … Ins4Trends), consistent
 * across tabs. "This month" is the 30 days to today and "last month" the 30 before; the designs' October dates move
 * with it (the design's 31 Oct is today), so every date and month name is the real one.
 *
 * - Sales: €141k from marketing = €88k online (1,480 orders: Meta €32k, Email €26k, Google €20k, Search & direct €6k,
 *   Organic €4k) + €53k from 11 retail deals (LinkedIn €9k of it); 930 new customers.
 * - Ads: €30.6k spent (Meta €17.4k, Google €10.2k, LinkedIn €3.0k) of a €34k plan; click rate 1.4%; one Feed ad tired.
 * - Organic: account reach 640k (−9%), followers 48.2k (+1.2k), Reels 9 → 4. Website: 41k visits, 3.6% buy, Google
 *   16.4k, AI assistants 1.1k. Email: €26k (flows €15k, newsletters €11k), 38.2k subscribers, 9.4k asleep.
 * - Market: four competitors as today (the designs' Brand X is Plume Skin); share of AI answers 18% vs 31%.
 * Only ouhers' own rows are replaced; the 90-day and 12-month views keep Phase V's older history.
 */
const DAY = 86400000;
type Ctx = { clientId: string; now: Date; teddyUserId: string | null };

const COMPETITORS = ["Plume Skin (demo)", "Dewlab (demo)", "Kind Ritual (demo)", "Nord Bare (demo)"];

export async function seedPhaseX(ctx: Ctx) {
  const { clientId, now } = ctx;
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY).toISOString().slice(0, 10);
  /** The design's "d Oct", with 31 Oct = today. */
  const oct = (d: number, hour = 10) => new Date(new Date(now.getTime() - (31 - d) * DAY).setHours(hour, 0, 0, 0));
  const ago = (d: number, hour = 10) => new Date(new Date(now.getTime() - d * DAY).setHours(hour, 0, 0, 0));
  const rows: Prisma.MetricDailyCreateManyInput[] = [];
  const add = (r: Omit<Prisma.MetricDailyCreateManyInput, "clientId" | "currency"> & { currency?: string }) => rows.push({ clientId, currency: "EUR", ...r });

  /** Spread `total` over the days [from, to) ago (a gentle rise towards today), whole numbers unless `money`. */
  const spread = (total: number, from: number, to: number, opts: { money?: boolean; tilt?: number } = {}) => {
    const n = to - from;
    const w = Array.from({ length: n }, (_, i) => 1 + (opts.tilt ?? 0.15) * ((n - 1 - i) / Math.max(1, n - 1) - 0.5) * -2);
    const sum = w.reduce((a, b) => a + b, 0);
    const raw = w.map((x) => (x / sum) * total);
    const out = opts.money ? raw.map((x) => Math.round(x * 100) / 100) : raw.map(Math.floor);
    if (!opts.money) for (let i = 0, rest = total - out.reduce((a, b) => a + b, 0); rest > 0; i = (i + 1) % n, rest--) out[n - 1 - i] += 1;
    return out.map((value, i) => ({ daysAgo: from + i, value }));
  };
  const both = (r: Omit<Prisma.MetricDailyCreateManyInput, "clientId" | "currency" | "model">, first: number, last: number, from: number, to: number) => {
    for (const p of spread(first, from, to, { money: r.metric === "revenue" || r.metric === "won_value" })) if (p.value) add({ ...r, date: iso(p.daysAgo), model: "first", value: p.value });
    for (const p of spread(last, from, to, { money: r.metric === "revenue" || r.metric === "won_value" })) if (p.value) add({ ...r, date: iso(p.daysAgo), model: "last", value: p.value });
  };
  const CUR = [0, 30] as const;
  const PREV = [30, 60] as const;
  /** Days 60–89: Meta's ads only, so the 90-day Story vs Feed maths (the combined opportunity) reads one model. */
  const OLDER = [60, 90] as const;

  // ─── Competitors as today, four of them ─────────────────────────────────────
  await prisma.client.update({ where: { id: clientId }, data: { competitorBrands: COMPETITORS } });

  // ─── Clear ouhers' last 60 days in the sources Insights reads (older history stays) ──────────────────────────
  // Phase V's repeat-buyer cohorts (the combined opportunity reads them) stay.
  await prisma.metricDaily.deleteMany({ where: { clientId, date: { gte: iso(59) }, source: { in: ["Meta", "Google", "LinkedIn", "TikTok", "Shopify", "HubSpot", "Klaviyo", "GA4", "Instagram"] }, NOT: { campaignId: { startsWith: "cohort:" } } } });
  await prisma.metricDaily.deleteMany({ where: { clientId, date: { gte: iso(89), lt: iso(59) }, NOT: { campaignId: { startsWith: "cohort:" } }, OR: [{ source: "Meta" }, { source: "Shopify", channel: "Meta" }] } });

  // ─── Ads: Meta per ad (so a tired ad can be seen), Google and LinkedIn per campaign ──────────────────────────
  // Asset names are stored as the concept ("sun day, every day"); match without case.
  const allAssets = await prisma.asset.findMany({ where: { clientId }, select: { id: true, name: true, format: true } });
  const asset = async (name: string, format: string) => allAssets.find((a) => a.name.toLowerCase() === name.toLowerCase() && (a.format ?? "").startsWith(format)) ?? null;
  // Meta: Story ads sell at €62 an order for about €17 each, Feed at €45 for about €19 (the combined opportunity's
  // numbers, Phase V); an awareness campaign carries the rest of the €17.4k and sells nothing directly.
  const ads = [
    { key: "ww-story", a: await asset("Whipped, weightless.", "Story 9:16"), utm: "q4-stories", spend: 3900, ctr: 1.9, orders: 230 },
    { key: "sunday-story", a: await asset("Sun day, every day", "Story 9:16"), utm: "q4-stories", spend: 2400, ctr: 1.6, orders: 140 },
    { key: "first-five", a: await asset("Meet the first five", "Story 9:16"), utm: "q4-stories", spend: 1400, ctr: 1.3, orders: 83 },
    { key: "ww-feed", a: await asset("Whipped, weightless.", "Feed 4:5"), utm: "q4-feed", spend: 812, ctr: 1.0, orders: 40 },
    { key: "ww-square", a: await asset("Whipped, weightless.", "Square 1:1"), utm: "q4-feed", spend: 500, ctr: 1.2, orders: 30 },
    { key: "shade-vote", a: await asset("Shade vote carousel, slide 1", "Carousel 1:1"), utm: "q4-feed", spend: 350, ctr: 0.8, orders: 17 },
  ].map((ad) => ({ ...ad, revenue: ad.orders * (ad.utm === "q4-stories" ? 62 : 45) }));
  const CPM = 11;
  for (const ad of [...ads, { key: "awareness", a: null, utm: "awareness", spend: 8038, ctr: 1.35, orders: 0, revenue: 0 }]) {
    const base = { source: "Meta", channel: "Meta", campaignId: `ad:${ad.key}`, campaignName: ad.key === "awareness" ? "brand awareness | Nordics" : "Q4 | always-on | SE-NO-DK", accountName: "ouhers (demo)", outputId: ad.a?.id ?? null, utmContent: ad.a?.id ?? ad.key, utmCampaign: ad.utm };
    const impressions = Math.round((ad.spend / CPM) * 1000);
    for (const p of spread(ad.spend, ...CUR, { money: true })) add({ ...base, date: iso(p.daysAgo), metric: "spend", value: p.value });
    const imp = spread(impressions, ...CUR);
    for (const p of imp) {
      add({ ...base, date: iso(p.daysAgo), metric: "impressions", value: p.value });
      // The Feed ad wears out: 1.4% three weeks ago, 0.9% this week.
      const ctr = ad.key === "ww-feed" ? 1.4 - Math.max(0, Math.min(1, (24 - p.daysAgo) / 17)) * 0.5 : ad.ctr;
      add({ ...base, date: iso(p.daysAgo), metric: "clicks", value: Math.round((p.value * ctr) / 100) });
    }
    // The 30 days before: the same cost per order on Stories and Feed, more on awareness, a lower click rate.
    const prevFactor = ad.utm === "q4-stories" ? 0.84 : ad.utm === "q4-feed" ? 0.8 : 1.1;
    for (const [from, to] of [PREV, OLDER]) {
      for (const p of spread(ad.spend * prevFactor, from, to, { money: true })) add({ ...base, date: iso(p.daysAgo), metric: "spend", value: p.value });
      for (const p of spread(Math.round(impressions * 0.95), from, to)) {
        add({ ...base, date: iso(p.daysAgo), metric: "impressions", value: p.value });
        add({ ...base, date: iso(p.daysAgo), metric: "clicks", value: Math.round((p.value * (ad.key === "ww-feed" ? 1.4 : ad.ctr * 0.85)) / 100) });
      }
    }
  }
  const feedAd = ads.find((a) => a.key === "ww-feed")!;
  add({ source: "Meta", channel: "Meta", campaignId: "ad:ww-feed", utmContent: feedAd.a?.id ?? "ww-feed", utmCampaign: feedAd.utm, outputId: feedAd.a?.id ?? null, date: iso(0), metric: "frequency", value: 4.2 });
  for (const [source, channel, camp, spend, prevSpend, ctr, prevCtr] of [
    ["Google", "Google Ads", "brand terms", 3200, 3200, 2.4, 2.2],
    ["Google", "Google Ads", "generic skincare", 7000, 7100, 0.95, 0.8],
    ["LinkedIn", "LinkedIn", "retail buyers | Nordics", 3000, 2900, 1.39, 1.2],
  ] as const) {
    const base = { source, channel, campaignId: `c:${camp}`, campaignName: camp, accountName: "ouhers (demo)" };
    for (const [[from, to], sp, c] of [[CUR, spend, ctr], [PREV, prevSpend, prevCtr]] as const) {
      for (const p of spread(sp, from, to, { money: true })) add({ ...base, date: iso(p.daysAgo), metric: "spend", value: p.value });
      for (const p of spread(Math.round((sp / CPM) * 1000), from, to)) {
        add({ ...base, date: iso(p.daysAgo), metric: "impressions", value: p.value });
        add({ ...base, date: iso(p.daysAgo), metric: "clicks", value: Math.round((p.value * c) / 100) });
      }
    }
  }

  // ─── Online sales (Shopify), credited first and last touch; shared = the average = the design ───────────────
  const online = { source: "Shopify", path: "online", accountName: "ouhers.com" };
  // Meta per ad (shared credit = the design's €32k, 540 orders; first touch credits Meta more than last touch).
  for (const ad of ads) {
    const r = { ...online, channel: "Meta", utmContent: ad.a?.id ?? ad.key, utmCampaign: ad.utm, outputId: ad.a?.id ?? null };
    both({ ...r, metric: "revenue", value: 0, date: "" }, ad.revenue * 1.125, ad.revenue * 0.875, ...CUR);
    both({ ...r, metric: "orders", value: 0, date: "" }, ad.orders, ad.orders, ...CUR);
    // Meta's own count of the purchases it drove, close to the shop's (the sources agree).
    const conv = { source: "Meta", channel: "Meta", campaignId: `ad:${ad.key}`, campaignName: "Q4 | always-on | SE-NO-DK", accountName: "ouhers (demo)", outputId: ad.a?.id ?? null, utmContent: ad.a?.id ?? ad.key, utmCampaign: ad.utm };
    for (const p of spread(Math.round(ad.orders * 1.04), ...CUR)) if (p.value) add({ ...conv, date: iso(p.daysAgo), metric: "conversions", value: p.value });
    // The 30 days before: 380 Story and 70 Feed orders, at the same order values.
    const prevOrders = Math.round(ad.orders * (ad.utm === "q4-stories" ? 380 / 453 : 70 / 87));
    const prevRevenue = prevOrders * (ad.utm === "q4-stories" ? 62 : 45);
    for (const [from, to] of [PREV, OLDER]) {
      both({ ...r, metric: "revenue", value: 0, date: "" }, prevRevenue * 1.125, prevRevenue * 0.875, from, to);
      both({ ...r, metric: "orders", value: 0, date: "" }, prevOrders, prevOrders, from, to);
      for (const p of spread(Math.round(prevOrders * 1.04), from, to)) if (p.value) add({ ...conv, date: iso(p.daysAgo), metric: "conversions", value: p.value });
    }
  }
  for (const [from, to] of [PREV, OLDER]) both({ ...online, channel: "Meta", utmContent: "", metric: "new_customers", value: 0, date: "" }, 345, 345, from, to);
  both({ ...online, channel: "Meta", utmContent: "", metric: "new_customers", value: 0, date: "" }, 380, 380, ...CUR);
  const channelSales: [string, number, number, number, number][] = [
    // channel, revenue first, revenue last, orders, new customers
    ["Klaviyo email", 22000, 30000, 440, 150],
    ["Google Ads", 20000, 20000, 340, 260],
    ["Google organic", 3500, 3500, 58, 46],
    ["AI assistants", 1000, 1000, 17, 14],
    ["Unattributed", 1500, 1500, 25, 20],
    ["Instagram (organic)", 4000, 4000, 60, 60],
  ];
  for (const [channel, first, last, orders, fresh] of channelSales) {
    const r = { ...online, channel, utmContent: "" };
    both({ ...r, metric: "revenue", value: 0, date: "" }, first, last, ...CUR);
    both({ ...r, metric: "orders", value: 0, date: "" }, orders, orders, ...CUR);
    both({ ...r, metric: "new_customers", value: 0, date: "" }, fresh, fresh, ...CUR);
  }
  // The 30 days before: €75.4k online from 1,358 orders, 838 new customers.
  for (const [channel, revenue, orders, fresh] of [["Klaviyo email", 23200, 404, 135], ["Google Ads", 16800, 358, 238], ["Google organic", 3600, 60, 48], ["AI assistants", 600, 11, 9], ["Unattributed", 1400, 23, 19], ["Instagram (organic)", 3300, 52, 44]] as const) {
    const r = { ...online, channel, utmContent: "" };
    both({ ...r, metric: "revenue", value: 0, date: "" }, revenue, revenue, ...PREV);
    both({ ...r, metric: "orders", value: 0, date: "" }, orders, orders, ...PREV);
    both({ ...r, metric: "new_customers", value: 0, date: "" }, fresh, fresh, ...PREV);
  }

  // ─── Retail and wholesale (HubSpot): 410 leads → 190 qualified → 26 proposals → 11 won, €53k ────────────────
  const retail = { source: "HubSpot", path: "retail", accountName: "ouhers (retail & wholesale)" };
  for (const [channel, leads, qualified, deals, won, value, prevWon, prevValue] of [["LinkedIn", 123, 57, 8, 2, 9000, 2, 8100], ["Retail fairs", 102, 48, 6, 3, 14000, 2, 11000], ["Trade press", 62, 28, 4, 2, 10000, 2, 9000], ["Unattributed", 123, 57, 8, 4, 20000, 3, 16000]] as const) {
    const r = { ...retail, channel, utmContent: "" };
    both({ ...r, metric: "leads", value: 0, date: "" }, leads, leads, ...CUR);
    both({ ...r, metric: "qualified", value: 0, date: "" }, qualified, qualified, ...CUR);
    both({ ...r, metric: "deals", value: 0, date: "" }, deals, deals, ...CUR);
    both({ ...r, metric: "won", value: 0, date: "" }, won, won, ...CUR);
    both({ ...r, metric: "won_value", value: 0, date: "" }, value, value, ...CUR);
    both({ ...r, metric: "won", value: 0, date: "" }, prevWon, prevWon, ...PREV);
    both({ ...r, metric: "won_value", value: 0, date: "" }, prevValue, prevValue, ...PREV);
  }
  add({ ...retail, channel: "All", date: iso(0), metric: "open_value", value: 214000 });
  add({ ...retail, channel: "All", date: iso(0), metric: "open_deals", value: 38 });

  // ─── Email (Klaviyo): flows €15k, newsletters €11k (4 sends), 38.2k subscribers, 9.4k asleep ────────────────
  const kl = { source: "Klaviyo", channel: "Klaviyo email", accountName: "ouhers" };
  for (const [key, name, revenue, sends, prevRevenue] of [["welcome", "Welcome flow", 7200, 6000, 6400], ["abandoned-cart", "Abandoned cart", 4900, 9000, 4300], ["post-purchase", "Post-purchase", 1800, 4000, 1600], ["win-back", "Win-back", 1100, 1000, 900]] as const) {
    const base = { ...kl, campaignId: `flow:${key}`, campaignName: name };
    for (const [[from, to], rev, s, openRate, clickRate] of [[CUR, revenue, sends, 0.49, 0.045], [PREV, prevRevenue, sends * 0.95, 0.45, 0.04]] as const) {
      for (const p of spread(rev, from, to, { money: true })) add({ ...base, date: iso(p.daysAgo), metric: "reported_revenue", value: p.value });
      for (const p of spread(Math.round(s), from, to)) {
        add({ ...base, date: iso(p.daysAgo), metric: "sends", value: p.value });
        add({ ...base, date: iso(p.daysAgo), metric: "opens", value: Math.round(p.value * openRate) });
        add({ ...base, date: iso(p.daysAgo), metric: "clicks", value: Math.round(p.value * clickRate) });
      }
    }
  }
  const sends = [
    { d: 3, subject: "your skin, but softer", open: 0.48, revenue: 4900 },
    { d: 13, subject: "11 days of self-care", open: 0.44, revenue: 3100 },
    { d: 20, subject: "the refill is back", open: 0.38, revenue: 2200 },
    { d: 27, subject: "last chance: 20% off", open: 0.29, revenue: 800 },
  ];
  for (const s of sends) {
    const base = { ...kl, campaignId: `send:${s.subject}`, campaignName: s.subject, date: iso(31 - s.d) };
    add({ ...base, metric: "sends", value: 38000 });
    add({ ...base, metric: "opens", value: Math.round(38000 * s.open) });
    add({ ...base, metric: "clicks", value: Math.round(38000 * 0.03) });
    add({ ...base, metric: "reported_revenue", value: s.revenue });
    add({ ...base, metric: "unsubscribes", value: 76 });
  }
  for (const [i, s] of [["autumn routine", 0.4, 2900], ["cloud cream, whipped", 0.4, 3000], ["sun day, last call", 0.38, 2500], ["meet the shade vote winner", 0.41, 2800]].entries()) {
    const base = { ...kl, campaignId: `send:${s[0]}`, campaignName: String(s[0]), date: iso(33 + i * 7) };
    add({ ...base, metric: "sends", value: 37000 });
    add({ ...base, metric: "opens", value: Math.round(37000 * Number(s[1])) });
    add({ ...base, metric: "clicks", value: Math.round(37000 * 0.027) });
    add({ ...base, metric: "reported_revenue", value: Number(s[2]) });
    add({ ...base, metric: "unsubscribes", value: 70 });
  }
  // Weekly list sizes, with one exactly at the start of the month: 37,260 → 38,200 (+940).
  for (const d of [0, 7, 14, 21, 30, 37, 44, 51, 58]) add({ ...kl, campaignId: "", date: iso(d), metric: "subscribers", value: Math.round(38200 - (940 / 30) * d) });
  add({ ...kl, campaignId: "", date: iso(0), metric: "inactive_90d", value: 9400 });

  // ─── Website (GA4): 41k visits (+6%), 24k product views, 3.9k carts, 1,480 purchases; pages that sell ───────
  const ga = { source: "GA4", accountName: "ouhers.com", path: "online" };
  for (const [channel, visits, purchases, prevVisits, prevPurchases] of [
    ["Google organic", 16400, 476, 15770, 430],
    ["Meta", 7600, 283, 7300, 250],
    ["Google Ads", 4500, 165, 4300, 150],
    ["Klaviyo email", 6200, 347, 5900, 320],
    ["Instagram (organic)", 3900, 82, 3900, 80],
    ["AI assistants", 1100, 56, 800, 38],
    ["Unattributed", 1300, 71, 730, 48],
  ] as const) {
    for (const p of spread(visits, ...CUR)) add({ ...ga, channel, date: iso(p.daysAgo), metric: "sessions", value: p.value });
    for (const p of spread(purchases, ...CUR)) if (p.value) add({ ...ga, channel, date: iso(p.daysAgo), metric: "purchases", value: p.value });
    for (const p of spread(prevVisits, ...PREV)) add({ ...ga, channel, date: iso(p.daysAgo), metric: "sessions", value: p.value });
    for (const p of spread(prevPurchases, ...PREV)) if (p.value) add({ ...ga, channel, date: iso(p.daysAgo), metric: "purchases", value: p.value });
  }
  for (const [metric, cur, prev] of [["product_views", 24000, 22300], ["add_to_cart", 3900, 3600]] as const) {
    for (const p of spread(cur, ...CUR)) add({ ...ga, channel: "", date: iso(p.daysAgo), metric, value: p.value });
    for (const p of spread(prev, ...PREV)) add({ ...ga, channel: "", date: iso(p.daysAgo), metric, value: p.value });
  }
  for (const [page, visits, purchases] of [["/cloud-cream", 9200, 497], ["/refill", 4100, 197], ["/sun-day-stick", 3600, 76], ["/dew-drop", 3000, 99], ["/milk-wash", 2400, 79]] as const) {
    for (const p of spread(visits, ...CUR)) add({ ...ga, channel: "", page, date: iso(p.daysAgo), metric: "sessions", value: p.value });
    for (const p of spread(purchases, ...CUR)) if (p.value) add({ ...ga, channel: "", page, date: iso(p.daysAgo), metric: "purchases", value: p.value });
  }

  // ─── Organic: account reach 640k (703k before), as the platforms report it ─────────────────────────────────
  for (const [source, channel, cur, prev] of [["Instagram", "Instagram (organic)", 560000, 600000], ["LinkedIn", "LinkedIn (organic)", 80000, 75000], ["TikTok", "TikTok (organic)", 0, 28000]] as const) {
    if (cur) for (const p of spread(cur, ...CUR, { tilt: -0.1 })) add({ source, channel, accountName: "ouhers", date: iso(p.daysAgo), metric: "reach", value: p.value });
    for (const p of spread(prev, ...PREV)) add({ source, channel, accountName: "ouhers", date: iso(p.daysAgo), metric: "reach", value: p.value });
  }
  await prisma.metricDaily.createMany({ data: rows });
  // The combined opportunity (Phase V) is worked out again from these numbers, so its maths matches the tabs.
  await upsertCombinedOpportunity(clientId, now, { isDemo: true });

  // ─── Organic posts: 17 this month (4 Reels, 6 carousels, 7 images), 23 the month before (9 Reels) ──────────
  await prisma.contentPost.deleteMany({ where: { clientId, channelType: "ORGANIC", status: "PUBLISHED", publishedDate: { gte: ago(60) } } });
  const weekendMorning = (d: number) => {
    // The nearest Saturday or Sunday morning at or before d days ago.
    for (let k = d; k < d + 7; k++) {
      const x = ago(k, 9);
      const wd = new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, weekday: "short" }).format(x);
      if (wd === "Sat" || wd === "Sun") return x;
    }
    return ago(d, 9);
  };
  const posts: Prisma.ContentPostCreateManyInput[] = [];
  const post = (title: string, contentType: string, theme: string, reach: number, saves: number, when: Date, platform = "Instagram") =>
    posts.push({ clientId, platform, channelType: "ORGANIC", status: "PUBLISHED", title, contentType, theme, publishedDate: when, reach, impressions: Math.round(reach * 1.4), engagements: Math.round(reach * 0.041), engagementRate: 4.1, saves, shares: Math.round(saves * 0.47), comments: Math.round(reach * 0.004) });
  post("two minutes, one dew drop", "Reel", "Rituals & how-to", 112000, 1340, oct(6, 19));
  post("real skin.", "Carousel", "Real people", 58000, 920, oct(7, 18));
  post("morning milk wash", "Reel", "Rituals & how-to", 6000, 300, weekendMorning(10));
  post("Maja's shelf", "Reel", "Real people", 4000, 300, ago(15, 18));
  post("20% this weekend", "Reel", "Offers", 2000, 80, weekendMorning(3));
  post("how to layer dew drop", "Carousel", "Rituals & how-to", 6000, 150, ago(19, 12));
  post("your shelfies", "Carousel", "Real people", 6000, 200, ago(12, 18));
  post("the full range", "Carousel", "Product shots", 6000, 200, weekendMorning(17));
  post("evening routine", "Carousel", "Rituals & how-to", 4000, 150, ago(8, 19));
  post("shade vote winners", "Carousel", "Real people", 4000, 180, ago(4, 12));
  for (const [i, [title, theme, saves]] of ([["cloud cream, close up", "Product shots", 150], ["sun day stick", "Product shots", 130], ["milk wash bottle", "Product shots", 120], ["gift set offer", "Offers", 60], ["free shipping week", "Offers", 40], ["texture friday", "Rituals & how-to", 110], ["meet Elin", "Real people", 200]] as const).entries()) {
    post(title, "Static post", theme, 8000, saves, i < 3 ? weekendMorning(5 + i * 7) : ago(2 + i * 3, i % 2 ? 12 : 18));
  }
  // The refill day Reel on TikTok: views only (TikTok disconnected on 8 Oct, so no reach after it).
  posts.push({ clientId, platform: "TikTok", channelType: "ORGANIC", status: "PUBLISHED", title: "refill day", contentType: "Reel", theme: "Rituals & how-to", publishedDate: oct(2, 18), videoViews: 44000 });
  for (let i = 0; i < 23; i++) {
    const type = i < 9 ? "Reel" : i < 15 ? "Carousel" : "Static post";
    const reach = type === "Reel" ? 33000 : type === "Carousel" ? 14000 : 8000;
    post(`${type.toLowerCase()} ${i + 1}`, type, ["Rituals & how-to", "Real people", "Product shots", "Offers"][i % 4], reach, Math.round(reach * 0.009), ago(31 + Math.round(i * 1.25), i % 3 ? 18 : 12));
  }
  await prisma.contentPost.createMany({ data: posts });

  // Followers: 47.0k → 48.2k over the month; activity peaks on Thursday evenings; the community this month.
  await prisma.followerSnapshot.deleteMany({ where: { clientId, capturedAt: { gte: ago(70) } } });
  const followers: Prisma.FollowerSnapshotCreateManyInput[] = [];
  for (const d of [63, 56, 49, 42, 37, 30, 21, 14, 7, 0]) {
    const ig = Math.round(41600 - (1200 / 30) * d);
    followers.push({ clientId, platform: "Instagram", followerCount: ig, capturedAt: ago(d, 6) }, { clientId, platform: "TikTok", followerCount: 4000, capturedAt: ago(d, 6) }, { clientId, platform: "LinkedIn", followerCount: 2600, capturedAt: ago(d, 6) });
  }
  await prisma.followerSnapshot.createMany({ data: followers });
  await prisma.audienceActivity.deleteMany({ where: { clientId } });
  await prisma.audienceActivity.create({
    data: { clientId, platform: "Instagram", capturedAt: ago(1), grid: [[30, 45, 60], [32, 55, 72], [40, 58, 75], [42, 70, 100], [38, 66, 80], [18, 40, 55], [15, 35, 50]] },
  });
  await prisma.communityManagementSnapshot.create({
    data: { clientId, periodStart: ago(30), periodEnd: ago(0), commentVolume: 1500, dmVolume: 360, sentimentPositivePct: 71, sentimentNeutralPct: 22, sentimentNegativePct: 7, themes: [{ theme: "sensitive skin", count: 120 }, { theme: "refills", count: 80 }], questions: [{ question: "Is it safe for sensitive skin?", count: 94 }, { question: "When is the refill back?", count: 61 }, { question: "Do you ship to Finland?", count: 38 }] },
  });

  // ─── The month's ad budget (€34k: Meta 18k, Google 11k, LinkedIn 5k) ───────────────────────────────────────
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: WORK_TZ, year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
  await prisma.adBudget.deleteMany({ where: { clientId } });
  await prisma.adBudget.createMany({ data: [["", 34000], ["Meta", 18000], ["Google", 11000], ["LinkedIn", 5000]].map(([channel, amount]) => ({ clientId, month, channel: String(channel), amount: Number(amount), setByUserId: ctx.teddyUserId })) });

  // ─── TikTok's token expired on 8 Oct ─────────────────────────────────────────────────────────────────────
  await prisma.dataSource.updateMany({ where: { clientId, source: "TikTok" }, data: { status: "needs_reconnect", lastError: "Token expired" } });
  await prisma.$executeRaw`UPDATE "DataSource" SET "updatedAt" = ${oct(8)} WHERE "clientId" = ${clientId} AND "source" = 'TikTok'`;

  // ─── Google rankings: 40 tracked keywords ─────────────────────────────────────────────────────────────────
  await prisma.searchRanking.deleteMany({ where: { clientId } });
  const keywords: [string, number | null, number | null][] = [
    ["fragrance free moisturiser", 4, 6], ["cloud cream", 1, 1], ["refill skincare", 3, 8], ["tinted spf sensitive skin", null, null], ["whipped moisturiser", 2, 3], ["dew drop serum", 1, 1],
    ["hyaluronic serum sweden", 7, 9], ["niacinamide serum 3%", 11, 12], ["gentle cleanser", 14, 13], ["milk cleanser", 5, 5], ["lip balm tinted", 18, 22], ["spf 30 fluid", 23, 21],
    ["no white cast spf", null, 48], ["skincare refills nordic", 2, 4], ["everyday skincare", 9, 10], ["skin barrier cream", 16, 25], ["squalane moisturiser", 12, 15], ["ceramide cream", 19, 20],
    ["oat milk cleanser", 6, 7], ["fragrance free skincare", 8, 8], ["vegan skincare sweden", 27, 30], ["skincare gift set", 13, 17], ["shade vote lip balm", 1, 2], ["sun day stick", 1, 1],
    ["lightweight moisturiser", 21, 19], ["serum for dull skin", 31, null], ["glass skin routine", 44, 39], ["skin cycling routine", null, null], ["sensitive skin moisturiser", 15, 18], ["daily spf", 35, 33],
    ["milky toner", 26, 28], ["refill pouch skincare", 3, 9], ["moisturiser under makeup", 22, 24], ["dewy skin", 10, 11], ["nordic skincare brand", 6, 6], ["clean skincare", 29, 27],
    ["skincare for men", 38, 41], ["cloud cream review", 2, 2], ["dew drop review", 3, 3], ["ouhers", 1, 1],
  ];
  await prisma.searchRanking.createMany({ data: keywords.map(([keyword, position, previousPosition], i) => ({ clientId, keyword, position, previousPosition, capturedAt: new Date(ago(2).getTime() + i * 1000) })) });

  // ─── Site audits: Google visibility for you and the four competitors ──────────────────────────────────────
  for (const [subject, domain, seo] of [["Own site", "ouhers.demo", 34], [COMPETITORS[0], "plumeskin.demo", 41], [COMPETITORS[1], "dewlab.demo", 29], [COMPETITORS[2], "kindritual.demo", 22], [COMPETITORS[3], "nordbare.demo", 18]] as const) {
    await prisma.siteAudit.upsert({ where: { clientId_subject: { clientId, subject } }, update: { seoScore: seo, auditedAt: ago(3) }, create: { clientId, subject, domain, seoScore: seo, performanceScore: 71, onPageChecks: { hasTitle: true, titleLength: 52, hasMetaDescription: true, metaDescriptionLength: 140, h1Count: 1, structuredDataTypes: ["Product"], hasSitemap: true, aiCrawlerAccess: { GPTBot: "allowed", ClaudeBot: "allowed", PerplexityBot: "allowed", "Google-Extended": "allowed", CCBot: "blocked" }, lcpSeconds: 2.6 }, auditedAt: ago(3) } });
  }

  // ─── Who AI assistants recommend: 40 buying questions this week, 100 answers ──────────────────────────────
  // Named in: ouhers 18, Plume Skin 31, Dewlab 22, Kind Ritual 14, Nord Bare 9 (of 100).
  await prisma.aiVisibilityCheck.deleteMany({ where: { clientId } });
  const [P, D, K, N] = COMPETITORS;
  const O = "ouhers";
  const shown: [string, string, string[]][] = [
    ["best fragrance-free moisturiser", "chatgpt", [P, O, D]],
    ["tinted SPF for sensitive skin", "chatgpt", [P, N]],
    ["refill skincare Sweden", "claude", [O, N]],
  ];
  // The other 97 answers: each brand named in exactly its remaining count, spread evenly.
  const rest: Record<string, number> = { [O]: 18 - 2, [P]: 31 - 2, [D]: 22 - 1, [K]: 14, [N]: 9 - 2 };
  const engines = ["chatgpt", "claude", "perplexity"];
  const checks: Prisma.AiVisibilityCheckCreateManyInput[] = shown.map(([question, engine, named], i) => ({ clientId, engine, grounded: true, question, answer: "", mentions: [...named.map((brand) => ({ brand, mentioned: true })), ...[O, ...COMPETITORS].filter((b) => !named.includes(b)).map((brand) => ({ brand, mentioned: false }))], checkedAt: new Date(ago(1).getTime() - i * 1000) }));
  const QUESTIONS = ["gentle cleanser for dry skin", "best serum under 400 kr", "hyaluronic serum Nordic brand", "moisturiser for sensitive skin", "vegan skincare Sweden", "skincare gift set Christmas", "lip balm with colour", "SPF that doesn't leave a white cast", "best niacinamide serum", "skincare for teenagers", "cleanser without fragrance", "ceramide moisturiser", "squalane cream", "skin barrier repair", "daily SPF for face", "refillable skincare", "clean beauty Scandinavia", "dewy skin products", "glass skin routine products", "moisturiser under makeup", "night cream for 20s", "skincare for men Sweden", "best cheap skincare", "skincare subscription Nordic", "eco skincare brands", "cruelty-free moisturiser", "toner for sensitive skin", "lightweight SPF", "tinted lip balm vegan", "serum for dull skin", "skin cycling products", "minimal skincare routine", "skincare for winter", "oily skin moisturiser", "skincare with oat", "best Swedish skincare", "SPF stick"];
  const EXTRA = 97;
  const named: string[][] = Array.from({ length: EXTRA }, () => []);
  for (const [k, [brand, n]] of Object.entries(rest).entries()) for (let i = 0; i < n; i++) named[(Math.floor((i * EXTRA) / n) + k * 7) % EXTRA].push(brand);
  for (let i = 0; i < EXTRA; i++) {
    checks.push({ clientId, engine: engines[i % 3], grounded: true, question: QUESTIONS[i % QUESTIONS.length], answer: "", mentions: [...named[i].map((brand) => ({ brand, mentioned: true })), ...[O, ...COMPETITORS].filter((b) => !named[i].includes(b)).map((brand) => ({ brand, mentioned: false }))], checkedAt: new Date(ago(1).getTime() - (i + 5) * 1000) });
  }
  await prisma.aiVisibilityCheck.createMany({ data: checks });

  // ─── Their ads and moves ─────────────────────────────────────────────────────────────────────────────────
  await prisma.competitorSnapshot.deleteMany({ where: { clientId, capturedAt: { gte: ago(40) } } });
  const ids = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}-${i + 1}`);
  await prisma.competitorSnapshot.createMany({
    data: [
      { clientId, brand: P, platform: "Meta", adIds: ids(3, "plume-spf"), capturedAt: oct(5, 12) },
      { clientId, brand: P, platform: "Meta", adIds: ids(9, "plume-meta"), capturedAt: ago(1) },
      { clientId, brand: P, platform: "TikTok", adIds: ids(3, "plume-tt"), capturedAt: ago(1) },
      { clientId, brand: D, platform: "Meta", adIds: ids(8, "dewlab-meta"), capturedAt: ago(1) },
      { clientId, brand: K, platform: "TikTok", adIds: ids(3, "kind-tt"), capturedAt: ago(1) },
      { clientId, brand: N, platform: "Meta", adIds: ids(2, "nord-refill"), capturedAt: oct(14, 12) },
      { clientId, brand: N, platform: "Meta", adIds: ids(3, "nord-meta"), capturedAt: ago(1) },
      { clientId, brand: N, platform: "TikTok", adIds: ids(2, "nord-tt"), capturedAt: ago(1) },
    ],
  });
  await prisma.competitorProfile.deleteMany({ where: { clientId } });
  await prisma.competitorProfile.createMany({
    data: [
      { clientId, brand: P, positioning: "A tinted SPF that disappears on skin.", themes: [{ theme: "SPF that disappears", evidence: "3 ads since the launch" }], activityLevel: "High" },
      { clientId, brand: D, positioning: "Discount-led serums ahead of Black Friday.", themes: [{ theme: "−20% on all serums", evidence: "5 discount ads" }], activityLevel: "High" },
      { clientId, brand: N, positioning: "Refills as the reason to switch.", themes: [{ theme: "refill, don't rebuy", evidence: "TikTok + Meta" }], activityLevel: "Medium" },
    ],
  });
  // The pack's older competitor headlines give way to the designs' moves (Kind Ritual has none this month).
  await prisma.marketSignal.updateMany({ where: { clientId, type: "COMPETITOR", archivedAt: null, OR: COMPETITORS.map((b) => ({ title: { startsWith: b } })) }, data: { archivedAt: now } });
  for (const [title, at] of [[`${P} launched a tinted SPF fluid`, oct(5)], [`${D} put 20% off all serums`, oct(12)], [`${N} launched refill pouches, 2 weeks before yours`, oct(14)]] as const) {
    await prisma.marketSignal.create({ data: { clientId, type: "COMPETITOR", title, summary: title, source: "Ad libraries", relevance: "High relevance", publishedAt: at } });
  }

  // ─── Trends: what's rising in Nordic beauty, and demand for the category ──────────────────────────────────
  const [spfOpp, refillOpp, storiesOpp] = await Promise.all([
    prisma.opportunity.findFirst({ where: { clientId, sourceKey: "w:spf-answer" }, select: { id: true } }),
    prisma.opportunity.findFirst({ where: { clientId, title: { startsWith: "Test a refill ritual" } }, select: { id: true } }),
    prisma.opportunity.findFirst({ where: { clientId, origin: "combined" }, select: { id: true } }),
  ]);
  const pouch = await prisma.clientCalendarItem.findFirst({ where: { clientId, title: "Refill pouch launch" }, select: { date: true } });
  const dm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(d);
  await prisma.trendTopic.deleteMany({ where: { clientId } });
  const rise = (from: number, to: number) => Array.from({ length: 12 }, (_, i) => Math.round(from + ((to - from) * i * i) / 121));
  await prisma.trendTopic.createMany({
    data: [
      { topic: "“refill with me” videos", measure: "views", change: 1.8, series: rise(100, 280), stage: "Rising", fit: 3, fitNote: pouch ? `Your refill pouch launches ${dm(pouch.date)}` : "Your refill pouch is coming", opportunityId: refillOpp?.id ?? null },
      { topic: "“skin barrier” searches", measure: "searches", change: 0.64, series: rise(100, 164), stage: "Rising", fit: 3, fitNote: "cloud cream is barrier-friendly" },
      { topic: "Tinted SPF", measure: "searches", change: 0.52, series: [100, 108, 118, 128, 136, 142, 146, 149, 151, 152, 152, 152], stage: "Peaking", fit: 2, fitNote: "Plume Skin got there first", opportunityId: spfOpp?.id ?? null },
      { topic: "“skin cycling” routines", measure: "views", change: 0.2, series: [100, 104, 103, 107, 110, 109, 113, 115, 114, 118, 119, 120], stage: "Early", fit: 1, fitNote: "Fits your ritual content" },
      { topic: "Glass skin", measure: "searches", change: -0.15, series: [100, 99, 98, 96, 95, 93, 92, 90, 89, 87, 86, 85], stage: "Fading", fit: 1, fitNote: "Fading, skip it" },
    ].map((t, i) => ({ ...t, clientId, sortOrder: i, capturedAt: ago(1) })),
  });
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 15)));
  const monthLabel = (d: Date) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(d);
  await prisma.trendBrief.upsert({
    where: { clientId },
    update: { categoryDemand: { series: months.map((d, i) => ({ label: monthLabel(d), value: Math.round(100 + i * 2 * (i > 6 ? 1.4 : 0.8)) })), change: 0.22, note: "Searches for moisturisers in the Nordics are up 22% on last year and usually peak in December. More people are looking, so it's a good month to be visible." } },
    create: { clientId, takeaway: "Refills and barrier care are rising in Nordic beauty.", themes: [], categoryDemand: { series: months.map((d, i) => ({ label: monthLabel(d), value: Math.round(100 + i * 2 * (i > 6 ? 1.4 : 0.8)) })), change: 0.22, note: "Searches for moisturisers in the Nordics are up 22% on last year and usually peak in December. More people are looking, so it's a good month to be visible." } },
  });

  // ─── Goals for the year (set with Teddy) ─────────────────────────────────────────────────────────────────
  await prisma.clientGoal.deleteMany({ where: { clientId } });
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 12));
  const yearEnd = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 12));
  await prisma.clientGoal.createMany({
    data: [
      { clientId, title: `+40% online sales vs ${now.getUTCFullYear() - 1}`, measure: "manual", target: 40, current: 34, unit: "% so far", startAt: yearStart, dueAt: yearEnd, note: "line = where you should be by now", sortOrder: 0, setByUserId: ctx.teddyUserId },
      { clientId, title: "10,000 community members", measure: "manual", target: 10000, current: 6100, unit: "members", startAt: yearStart, dueAt: yearEnd, note: "sign-ups slowed since August", sortOrder: 1, setByUserId: ctx.teddyUserId },
      { clientId, title: "Launch in Finland by March", measure: "manual", target: 1, current: 0.3, startAt: new Date(now.getTime() - 77 * DAY), dueAt: new Date(Date.UTC(now.getUTCFullYear() + 1, 2, 31, 12)), note: "Brand OS ready · first FI campaign in the Planner for February", sortOrder: 2, setByUserId: ctx.teddyUserId },
    ],
  });

  // ─── Findings per tab, each linked to its opportunity (Phase W) ───────────────────────────────────────────
  await prisma.insight.updateMany({ where: { clientId, key: "combined:aov-story-feed" }, data: { href: "/insights/paid", title: "Story ads bring 38% bigger orders", foundAt: ago(2, 9) } });
  await prisma.insight.updateMany({ where: { clientId, key: "combined:welcome-repeat" }, data: { href: "/insights/email", title: "Welcome flow: 41% buy again vs 17% without", foundAt: ago(2, 8) } });
  await prisma.insight.updateMany({ where: { clientId, key: "seed:ritual-saves" }, data: { href: "/insights/organic" } });
  await prisma.insight.updateMany({ where: { clientId, key: "seed:tinted-spf-searches" }, data: { href: "/insights/trends" } });
  await prisma.insight.updateMany({ where: { clientId, key: "seed:refill-with-me" }, data: { href: "/insights/trends" } });
  await prisma.insight.updateMany({ where: { clientId, key: "seed:competitor-spf-launch" }, data: { href: "/insights/competitors" } });
  const f = (key: string, title: string, value: string, sources: string[], href: string, kind: "data" | "market" = "data", d = 3) => upsertInsight(clientId, { key, kind, title, value, sources, href, origin: "seed", foundAt: ago(d, 9) }, { isDemo: true, now });
  const leads = await f("x:plume-leads-ai", "Plume Skin leads AI answers for “tinted SPF”", "31% vs 18%", ["AI answers"], "/insights/competitors", "market", 1);
  const refills = await f("x:nord-refills-first", "Nord Bare launches refills 2 weeks before you", "14 Oct", ["Ad libraries"], "/insights/competitors", "market", 4);
  const missing = await f("x:missing-tinted-spf", "Missing from “tinted SPF” searches", "not in top 50", ["Search Console"], "/insights/website", "data", 3);
  await f("x:reels-reach", "Reels reach 3× more than posts", "3×", ["Instagram"], "/insights/organic", "data", 5);
  await f("x:sensitive-skin", "“Is it safe for sensitive skin?” asked 94 times", "94", ["Instagram"], "/insights/organic", "data", 6);
  if (spfOpp) await linkInsights(clientId, spfOpp.id, [leads.id, missing.id]);
  if (refillOpp) await linkInsights(clientId, refillOpp.id, [refills.id]);
  if (storiesOpp) {
    const wr = await prisma.insight.findFirst({ where: { clientId, key: "combined:welcome-repeat" }, select: { id: true } });
    if (wr) await linkInsights(clientId, storiesOpp.id, [wr.id]);
  }
  return rows.length;
}
