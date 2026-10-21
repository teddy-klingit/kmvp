import type { BrandRuleType, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { insightsFromEvidence } from "@/lib/insight-records";
import { checkCopy } from "@/lib/rule-check";
import { briefByFor, loadLeadTimes, mondayOf, teamCreditsFor } from "@/lib/plan";
import { loadMeasuredAssets } from "@/lib/insights-data";
import { kindFor, routeCheckOf } from "@/lib/opportunities";
import { clientVisibleAsset } from "@/lib/qc/visibility";


/**
 * Phase R on top of the ouhers pack: Brand OS → Rules as design 01 shows them (24 rules, one member suggestion, a
 * short change history, word lists). Dated relative to the seed's "now". The "Used N× · caught M" counts are not
 * typed in: seedRuleCounts runs the real rule check (without the model) over ouhers' own copy.
 */

const DAY = 86400000;
type R = { type: BrandRuleType; text: string; words?: string[]; channels?: string[]; products?: string[] };

const RULES: R[] = [
  { type: "TONE", text: "brand and product names lowercase" },
  { type: "TONE", text: "headlines end with a full stop, no exclamation marks. one question mark is ok in social copy." },
  { type: "TONE", text: "say “we” and “you”, never “the consumer”" },
  { type: "TONE", text: "short sentences. one idea per line." },
  { type: "TONE", text: "calm, not urgent: no countdowns or “last chance”" },
  { type: "TONE", text: "talk about how it feels, not what it fixes" },
  { type: "TONE", text: "one emoji at most, only in social replies" },
  { type: "TONE", text: "write like a friend who knows skincare, not a lab" },
  { type: "DO", text: "show the product in use, on real skin" },
  { type: "DO", text: "name the texture: whipped, milky, dewy" },
  { type: "DO", text: "end with one clear action" },
  { type: "DO", text: "credit creators by name" },
  { type: "DO", text: "mention the refill when the product has one" },
  { type: "WORDS_AVOID", text: "never say “flawless”, “anti-ageing”, “miracle”", words: ["flawless", "anti-ageing", "miracle"] },
  { type: "WORDS_AVOID", text: "no “perfect skin” or “fix your skin”", words: ["perfect skin", "fix your skin"] },
  { type: "WORDS_AVOID", text: "no shouting words: “amazing”, “insane”, “obsessed”", words: ["amazing", "insane", "obsessed"] },
  { type: "WORDS_AVOID", text: "don't call people “users” or “the consumer”", words: ["users", "the consumer"] },
  { type: "CLAIMS", text: "claims need a number or a source" },
  { type: "CLAIMS", text: "SPF claims always say the SPF number", products: ["sun day"] },
  { type: "CLAIMS", text: "“clinically proven” only with the study named" },
  { type: "CHANNEL", text: "no hashtags in the first line", channels: ["TikTok"] },
  { type: "CHANNEL", text: "captions under 125 characters", channels: ["Instagram"] },
  { type: "CHANNEL", text: "subject lines under 45 characters", channels: ["Email"] },
];
const WORDS_USE = ["dewy", "soft", "ours", "real skin", "every day", "made with you"];
const WORDS_AVOID = ["flawless", "anti-ageing", "miracle", "perfect skin", "the consumer"];

export async function seedPhaseRRules(ctx: { clientId: string; now: Date; userId: (packUserId: string) => string; staffUserId: string | null; legalLines: { market: string; text: string }[] }) {
  const { clientId, now } = ctx;
  const maja = ctx.userId("ou-maja");
  const at = (daysAgo: number, hour = 10, minute = 0) => new Date(new Date(now.getTime() - daysAgo * DAY).setHours(hour, minute, 0, 0));
  const scope = (r: R) => (r.channels || r.products ? ({ channels: r.channels, products: r.products } as Prisma.InputJsonValue) : undefined);

  // The rules (one legal-line rule from the pack's must-include lines makes it 24).
  const all: R[] = [...RULES, { type: "CLAIMS", text: `legal line at the end of every ad: ${ctx.legalLines.map((l) => `${l.market} “${l.text}”`).join(", ")}` }];
  const ids = new Map<string, string>();
  for (const [i, r] of all.entries()) {
    const row = await prisma.brandRule.create({ data: { clientId, type: r.type, text: r.text, words: (r.words ?? []) as Prisma.InputJsonValue, scope: scope(r), source: "seed", sortOrder: i, createdByUserId: maja, createdAt: at(60) } });
    ids.set(r.text, row.id);
  }
  await prisma.brandRule.createMany({
    data: [
      { clientId, type: "WORDS_USE", text: "Words we use", words: WORDS_USE, source: "word_list", sortOrder: 900, createdAt: at(60) },
      { clientId, type: "WORDS_AVOID", text: "Words we avoid", words: WORDS_AVOID, source: "word_list", sortOrder: 901, createdAt: at(60) },
    ],
  });

  // A member's suggestion, waiting for an admin (orange row).
  const erik = ctx.userId("ou-erik");
  const suggestion = await prisma.brandRule.create({ data: { clientId, type: "CLAIMS", text: "always show the SPF number in the first frame", scope: { products: ["sun day"] }, status: "SUGGESTED", active: false, source: "suggestion", suggestedByUserId: erik, createdByUserId: erik, sortOrder: 50, createdAt: at(1, 14, 5) } });

  // A rule Maja removed (kept for the history, out of force).
  const removed = await prisma.brandRule.create({ data: { clientId, type: "DO", text: "use emojis in captions", source: "seed", deletedAt: at(9, 11, 20), createdByUserId: maja, createdAt: at(60) } });

  // Change history, newest first in the UI.
  const snap = (text: string, extra: Record<string, unknown> = {}) => ({ type: "TONE", text, words: [], scope: null, active: true, status: "ACTIVE", deletedAt: null, ...extra });
  const headline = all[1].text;
  await prisma.brandRuleChange.createMany({
    data: [
      { clientId, ruleId: removed.id, actorUserId: maja, action: "deleted", summary: "removed “use emojis in captions”", before: snap("use emojis in captions", { type: "DO" }), after: snap("use emojis in captions", { type: "DO", deletedAt: at(9, 11, 20).toISOString() }), createdAt: at(9, 11, 20) },
      ...(ctx.staffUserId ? [{ clientId, ruleId: ids.get("no hashtags in the first line")!, actorUserId: ctx.staffUserId, byKlingit: true, action: "added", summary: "added “no hashtags in the first line” (TikTok)", after: snap("no hashtags in the first line", { type: "CHANNEL", scope: { channels: ["TikTok"] } }), createdAt: at(3, 15, 40) }] : []),
      { clientId, ruleId: suggestion.id, actorUserId: erik, action: "suggested", summary: "suggested a sun day claims rule", after: snap("always show the SPF number in the first frame", { type: "CLAIMS", status: "SUGGESTED", active: false }), createdAt: at(1, 14, 5) },
      { clientId, ruleId: ids.get(headline)!, actorUserId: maja, action: "edited", summary: "edited “headlines end with a full stop…”", before: snap("headlines end with a full stop, no exclamation marks."), after: snap(headline), createdAt: at(0, 9, 12) },
    ],
  });
}

/**
 * "Used N× · caught M", counted for real: the shared rule check (words matched exactly, no model call) over every
 * piece of ouhers copy there is — skill outputs and the copy on delivered work.
 */
export async function seedRuleCounts(clientId: string) {
  const [outputs, assets] = await Promise.all([
    prisma.skillOutput.findMany({ where: { clientId }, select: { text: true, channel: true } }),
    prisma.asset.findMany({ where: { clientId }, select: { tags: true, platform: true } }),
  ]);
  const texts = [
    ...outputs.flatMap((o) => (o.text ? [{ text: o.text, channel: o.channel }] : [])),
    ...assets.flatMap((a) => Object.values(((a.tags as { copy?: Record<string, string> } | null)?.copy ?? {})).filter(Boolean).map((text) => ({ text, channel: a.platform }))),
  ];
  for (const t of texts) await checkCopy(clientId, t.text, { channel: t.channel, ai: false });
  return texts.length;
}


/**
 * Plan (design 04): the ouhers plan for the next five weeks — one of each owner, two "Klingit helps" items with
 * brief-due markers (the Halloween reel inside its reminder window), a campaign bar over two weeks, the key moments
 * from the shared layer, and one gap week (week 44: only the Halloween reel on Instagram). Dated relative to the
 * seed's "now"; items on a key moment sit on that moment's real date.
 */
export async function seedPhaseRPlan(ctx: { clientId: string; now: Date; userId: (packUserId: string) => string }) {
  const { clientId, now } = ctx;
  const maja = ctx.userId("ou-maja");
  const leadTimes = await loadLeadTimes();
  // Week 0 is the week the 5-week view opens on (on a Sunday, tomorrow's).
  const w0 = mondayOf(now.getDay() === 0 ? new Date(now.getTime() + DAY) : now);
  const day = (n: number) => new Date(w0.getFullYear(), w0.getMonth(), w0.getDate() + n, 10);
  const moment = async (name: string, fallback: number) => {
    const m = await prisma.keyMoment.findFirst({ where: { name, date: { gte: day(7), lt: day(35) } }, orderBy: { date: "asc" } });
    return m ? new Date(m.date.getFullYear(), m.date.getMonth(), m.date.getDate(), 10) : day(fallback);
  };
  const project = async (name: string) => (await prisma.project.findFirst({ where: { clientId, name }, select: { id: true } }))?.id ?? null;

  // The agreement: Instagram from the pack (2 a week), TikTok 1 a week.
  if (!(await prisma.contentPlanTarget.findFirst({ where: { clientId, platform: "TikTok" } }))) await prisma.contentPlanTarget.create({ data: { clientId, platform: "TikTok", weeklyVolume: 1 } });

  type Item = { title: string; date: Date; endDate?: Date; channels: string[]; formats: string[]; maker: "client" | "klingit_help" | "klingit_project"; status?: string; notes?: string; projectId?: string | null; publishedAssetId?: string | null; reminded?: Record<string, string> };
  const halloween = await moment("Halloween", 19);
  const singles = await moment("Singles Day", 30);
  const published = await prisma.asset.findFirst({ where: { clientId, ...clientVisibleAsset, project: { name: "lip ours: you voted" } }, select: { id: true } });
  const items: Item[] = [
    { title: "lip ours: you voted · recap", date: day(-4), channels: ["Instagram"], formats: ["Carousel"], maker: "client", status: "published", publishedAssetId: published?.id ?? null },
    { title: "Halloween glow reel", date: halloween, channels: ["Instagram", "TikTok"], formats: ["Reel / video"], maker: "klingit_help", notes: "the glow, not the scare: dew drop under candlelight.", reminded: { "7": new Date(now.getTime() - 2 * DAY).toISOString() } },
    { title: "Singles Day self-care set", date: singles, channels: ["Instagram", "TikTok"], formats: ["Carousel", "Stories", "Reel / video"], maker: "klingit_help", notes: "gift set: cloud cream + lip ours. calm, no countdowns." },
    { title: "Holiday: the soft set · in market", date: day(21), endDate: day(34), channels: ["Instagram", "TikTok"], formats: ["Reel / video", "Stories"], maker: "klingit_project", projectId: await project("Holiday: the soft set") },
    { title: "milk wash restock post", date: day(24), channels: ["Instagram"], formats: ["Post"], maker: "client", status: "planned" },
    { title: "Newsletter · gifting", date: day(32), channels: ["Newsletter"], formats: ["Email"], maker: "client", status: "planned" },
  ];
  for (const i of items) {
    await prisma.clientCalendarItem.create({
      data: {
        clientId,
        title: i.title,
        date: i.date,
        endDate: i.endDate ?? null,
        channel: i.channels[0],
        channels: i.channels,
        formats: i.formats,
        maker: i.maker,
        status: i.status ?? "planned",
        notes: i.notes ?? null,
        projectId: i.projectId ?? null,
        publishedAssetId: i.publishedAssetId ?? null,
        briefBy: i.maker === "klingit_help" ? briefByFor(i.date, i.formats, leadTimes).briefBy : null,
        reminded: i.reminded,
        createdByUserId: maja,
        requestKey: `seed-${i.title}`,
        createdAt: new Date(now.getTime() - 9 * DAY),
      },
    });
  }
  // The pack's own plan items say what they are.
  await prisma.clientCalendarItem.updateMany({ where: { clientId, title: { startsWith: "Newsletter" }, channel: "Email" }, data: { channel: "Newsletter", channels: ["Newsletter"], formats: ["Email"] } });
  return items.length;
}

/**
 * Opportunities (design 06, and 07 for Singles Day): five, dated relative to the seed's "now". Evidence points at
 * real rows where the demo has them (the key-moments table, Market feed signals seeded here, the measured CTR by
 * format) and says demo where it's the pack's numbers. Sample lines go through the real rule check (no model), and
 * Singles Day is the one on the plan (route A, linked to the seeded plan item).
 */
export async function seedPhaseROpportunities(ctx: { clientId: string; now: Date; staffUserId: string | null }) {
  const { clientId, now } = ctx;
  const leadTimes = await loadLeadTimes();
  const team = (formats: string[]) => teamCreditsFor(formats, leadTimes);
  const midday = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10);
  const plus = (n: number) => midday(new Date(now.getTime() + n * DAY));
  const moment = async (name: string) => prisma.keyMoment.findFirst({ where: { name, date: { gte: now } }, orderBy: { date: "asc" } });
  const signal = (type: string, title: string, summary: string, source: string, daysAgo: number) => prisma.marketSignal.create({ data: { clientId, type, title, summary, source, relevance: "High relevance", publishedAt: new Date(now.getTime() - daysAgo * DAY) } });
  const project = async (name: string) => prisma.project.findFirst({ where: { clientId, name }, select: { id: true, name: true } });

  const singles = await moment("Singles Day");
  const friday = await moment("Black Friday");
  const singlesDay = singles ? midday(singles.date) : plus(31);
  const fridayDay = friday ? midday(friday.date) : plus(47);
  const discounts = await signal("COMPETITOR", "4 of 5 tracked competitors ran 30–50% off on Singles Day last year", "Kind Ritual, Plume Skin, Dewlab and Nord Bare all ran site-wide discounts on 11.11; only one kept full price.", "Ad libraries (demo)", 6);
  const bf = await signal("COMPETITOR", "Competitors went 40% off on Black Friday last year", "Three of the tracked brands ran 40% off for the whole Black Friday week, with countdown timers.", "Ad libraries (demo)", 9);
  const refill = await signal("TREND", "“refill with me” videos up 180% in Nordic beauty this month", "Short videos of people refilling their skincare are the fastest-growing beauty format on Nordic TikTok.", "TikTok Creative Center (demo)", 3);
  const spf = await signal("COMPETITOR", "A competitor launched a tinted SPF fluid on 5 Oct", "Plume Skin's new tinted SPF 25 fluid is running on Meta and TikTok with a “no white cast” claim.", "Ad libraries (demo)", 6);

  // "More 9:16": the real CTR by format from ouhers' measured, delivered creative.
  const { measured } = await loadMeasuredAssets(clientId);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const tall = mean(measured.filter((m) => /9:16/.test(m.format)).map((m) => m.ctr));
  const wide = mean(measured.filter((m) => !/9:16/.test(m.format)).map((m) => m.ctr));
  const ratio = tall && wide ? Math.round((tall / wide) * 10) / 10 : null;
  const r1 = (n: number | null) => (n == null ? "–" : `${Math.round(n * 10) / 10}%`);

  type Route = { name: string; description: string; formats: string[]; channels: string[]; sampleLine: string; aiCredits?: number; status?: string };
  type Opp = { key: string; title: string; summary: string; whyNow: string; sources: string[]; evidence: { value: string; text: string; source: string; kind: string; ref?: string; demo?: boolean }[]; chart?: Prisma.InputJsonValue; windowStart: Date | null; windowEnd: Date | null; windowNote?: string; fits?: { id: string; name: string } | null; skillKey?: string; insightHref?: string; status?: string; createdDaysAgo: number; reviewed?: boolean; routes: Route[] };
  const singlesChart = { title: "Your audience on Instagram, 1–15 Nov last year", subtitle: "Engagement, index (1 Nov = 100)", bars: [100, 104, 98, 112, 118, 116, 121, 126, 140, 158, 230, 150, 128, 122, 118].map((value, i) => ({ label: String(i + 1), value })), highlight: "11", source: "Your Meta data (demo)" };

  const opps: Opp[] = [
    {
      key: `moment:${singles?.id ?? "singles"}`,
      title: "Singles Day: self-care, not discounts",
      summary: "Singles Day (11.11) is a big shopping moment in the Nordics. Most beauty brands push 30–50% off. A calm self-care angle fits your voice, protects your price and gives your audience something to save, not just buy.",
      whyNow: "Your audience was 2.3× more active on 11.11 last year, and the big brands shout discounts. A calm self-care angle stands out.",
      sources: ["seasonal", "data", "competitor"],
      evidence: [
        { value: "2.3×", text: "more active on 11.11 than on a normal November day", source: "your Meta data", kind: "data", ref: "/insights/audience", demo: true },
        { value: "4 of 5", text: "competitors ran 30–50% off last year", source: "Market feed", kind: "market", ref: `signal:${discounts.id}`, demo: true },
        { value: "+64%", text: "saves on your “ritual” posts vs. product posts", source: "last 90 days", kind: "data", ref: "/insights/audience", demo: true },
      ],
      chart: singlesChart,
      windowStart: new Date(singlesDay.getTime() - 7 * DAY),
      windowEnd: singlesDay,
      fits: await project("Holiday: the soft set"),
      skillKey: "carousel_builder",
      insightHref: "/insights/audience",
      status: "in_plan",
      createdDaysAgo: 2,
      reviewed: true,
      routes: [
        { name: "The gift set edit", description: "A calm carousel and stories around one gift set: cloud cream + lip ours, wrapped in apricot milk. Gift it to someone, or to yourself.", formats: ["Carousel", "Stories", "Reel / video"], channels: ["Instagram", "TikTok"], sampleLine: "a gift for you. or for you.", status: "added" },
        { name: "11 days of self-care", description: "A daily series from 1 to 11 Nov: one small ritual a day, ending with the gift set on 11.11.", formats: ["Stories", "Reel / video"], channels: ["Instagram", "TikTok"], sampleLine: "day 4. two minutes, one dew drop." },
        { name: "Community picks", description: "Ask your community which product they'd gift. Repost the answers as the 11.11 campaign. Lowest cost, slowest start.", formats: ["Post", "Stories"], channels: ["Instagram"], sampleLine: "what would you gift? we'll share ours.", aiCredits: 40 },
      ],
    },
    {
      key: `moment:${friday?.id ?? "black-friday"}`,
      title: "Black Friday: the no-rush edit",
      summary: "Black Friday week is the loudest of the year. Instead of a discount, a calm, refill-first message: buy what you'll use, refill what you love.",
      whyNow: "Competitors went 40% off last year. A no-countdown, refill-first message fits your “honest, light” voice.",
      sources: ["seasonal", "competitor"],
      evidence: [
        { value: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(fridayDay), text: "Black Friday (SE, NO, DK, FI)", source: "Key moments", kind: "moment", ref: `moment:${friday?.id ?? ""}` },
        { value: "40%", text: "off from three tracked competitors last Black Friday week", source: "Market feed", kind: "market", ref: `signal:${bf.id}`, demo: true },
      ],
      windowStart: new Date(fridayDay.getTime() - 7 * DAY),
      windowEnd: new Date(fridayDay.getTime() + 3 * DAY),
      skillKey: "carousel_builder",
      insightHref: "/insights/market",
      createdDaysAgo: 1,
      reviewed: true,
      routes: [
        { name: "The no-rush edit", description: "A carousel and an email: three products worth having, no countdown, no discount.", formats: ["Carousel", "Email"], channels: ["Instagram", "Newsletter"], sampleLine: "no rush. it'll be here on monday too." },
        { name: "Refill first", description: "Lead with the refill pouch: the same cream, less packaging, a softer price every day.", formats: ["Post", "Stories"], channels: ["Instagram", "TikTok"], sampleLine: "refill what you love." },
        { name: "Closed for Black Friday", description: "A short film: ouhers takes the day off, the shop stays open. Bigger, braver, more to make.", formats: ["Reel / video", "Banner set"], channels: ["Instagram", "TikTok", "Web"], sampleLine: "we're taking the day off. you can too." },
      ],
    },
    {
      key: "data:9x16-milk-wash",
      title: "More 9:16 for milk wash",
      summary: "Tall formats keep winning on your ads. milk wash, your newest product, has no 9:16 ads live yet.",
      whyNow: ratio ? `9:16 got ${ratio}× the click-through of wide formats in your delivered creative. milk wash has no 9:16 ads live.` : "9:16 stories keep winning on your ads. milk wash has no 9:16 ads live.",
      sources: ["data"],
      evidence: [
        { value: r1(tall), text: "average CTR for 9:16 formats (delivered creative)", source: "Insights · Performance", kind: "data", ref: "/insights/performance", demo: true },
        { value: r1(wide), text: "average CTR for wide and square formats", source: "Insights · Performance", kind: "data", ref: "/insights/performance", demo: true },
      ],
      windowStart: null,
      windowEnd: null,
      windowNote: "Any time · sooner is better",
      skillKey: "ad_gen",
      insightHref: "/insights/performance",
      createdDaysAgo: 3,
      routes: [
        { name: "Three 9:16 cuts", description: "Three story ads from the milk wash shoot, made with the Ad generator and checked against your rules.", formats: ["Stories"], channels: ["Instagram", "TikTok"], sampleLine: "milk wash. soft, every day.", aiCredits: 40 },
        { name: "Creator-shot 9:16", description: "Two creators film their evening wash. Klingit edits to 9:16 for both channels.", formats: ["Reel / video"], channels: ["Instagram", "TikTok"], sampleLine: "the wash that feels like nothing. in a good way." },
      ],
    },
    {
      key: `signal:${refill.id}`,
      title: "Refill rituals on TikTok",
      summary: "Refilling is turning into its own small ritual on TikTok. Your refill pouch launches soon: show the refill, not just the product.",
      whyNow: `“refill with me” videos are up 180% in Nordic beauty this month. Your refill pouch launches ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(plus(22))}.`,
      sources: ["trend"],
      evidence: [{ value: "+180%", text: "“refill with me” videos in Nordic beauty this month", source: "Market feed", kind: "market", ref: `signal:${refill.id}`, demo: true }],
      windowStart: plus(15),
      windowEnd: plus(29),
      insightHref: "/insights/market",
      createdDaysAgo: 4,
      routes: [
        { name: "Refill with me", description: "Three short TikToks: the first refill, the tenth, the hundredth.", formats: ["Reel / video"], channels: ["TikTok"], sampleLine: "refill no. 1. same cream, softer on the bin." },
        { name: "Duet the refill", description: "Invite creators to duet your refill video with their own.", formats: ["Reel / video"], channels: ["TikTok", "Instagram"], sampleLine: "show us your refill." },
        { name: "Refill in stories", description: "A four-frame story on how the pouch works. Lowest cost.", formats: ["Stories"], channels: ["Instagram"], sampleLine: "pour, close, done." },
      ],
    },
    {
      key: `signal:${spf.id}`,
      title: "Answer the new SPF launch",
      summary: "A competitor's tinted SPF launched with a “no white cast” claim. sun day already has the stronger claim: say it plainly, with the number.",
      whyNow: "A competitor launched a tinted SPF fluid on 5 Oct. sun day already has the stronger claim (SPF 30, no white cast).",
      sources: ["competitor"],
      evidence: [{ value: "5 Oct", text: "a competitor launched a tinted SPF fluid with a “no white cast” claim", source: "Market feed", kind: "market", ref: `signal:${spf.id}`, demo: true }],
      windowStart: midday(now),
      windowEnd: midday(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      createdDaysAgo: 20,
      routes: [
        { name: "Say the number", description: "Two static ads and a story: SPF 30, no white cast, every day.", formats: ["Post", "Stories"], channels: ["Instagram"], sampleLine: "spf 30. no white cast. every day." },
        { name: "Real skin test", description: "Three skin tones, one sun day, filmed outdoors.", formats: ["Reel / video"], channels: ["Instagram", "TikTok"], sampleLine: "real skin, real light, sun day spf 30." },
      ],
    },
  ];

  const singlesItem = await prisma.clientCalendarItem.findFirst({ where: { clientId, title: "Singles Day self-care set" }, select: { id: true } });
  for (const o of opps) {
    const created = new Date(now.getTime() - o.createdDaysAgo * DAY);
    const routes = [];
    for (const [i, r] of o.routes.entries()) {
      const check = await checkCopy(clientId, r.sampleLine, { channel: r.channels[0], ai: false });
      const t = team(r.formats);
      routes.push({
        letter: "ABC"[i],
        name: r.name,
        description: r.description,
        formats: r.formats,
        channels: r.channels,
        sampleLine: r.sampleLine,
        sampleCheck: routeCheckOf(check) as Prisma.InputJsonValue,
        teamCreditsLow: t,
        teamCreditsHigh: t != null ? Math.round(t * 1.5) : null,
        aiCredits: r.aiCredits ?? null,
        status: r.status ?? "new",
        planItemId: r.status === "added" && o.status === "in_plan" ? (singlesItem?.id ?? null) : null,
        sortOrder: i,
        createdAt: created,
      });
    }
    const row = await prisma.opportunity.create({
      data: {
        clientId,
        title: o.title,
        summary: o.summary,
        whyNow: o.whyNow,
        sources: o.sources,
        evidence: o.evidence as Prisma.InputJsonValue,
        chart: o.chart,
        windowStart: o.windowStart,
        windowEnd: o.windowEnd,
        windowNote: o.windowNote ?? null,
        fitsProjectId: o.fits?.id ?? null,
        fitsLabel: o.fits?.name ?? null,
        skillKey: o.skillKey ?? null,
        insightHref: o.insightHref ?? null,
        status: o.status ?? "new",
        kind: kindFor(o.sources),
        origin: "seed",
        reviewedAt: o.reviewed && ctx.staffUserId ? new Date(created.getTime() + 3 * 3600000) : null,
        reviewedByUserId: o.reviewed ? ctx.staffUserId : null,
        sourceKey: o.key,
        isDemo: true,
        createdAt: created,
        routes: { create: routes },
      },
    });
    if (o.status === "in_plan" && singlesItem) await prisma.clientCalendarItem.update({ where: { id: singlesItem.id }, data: { opportunityId: row.id, route: "A" } });
    // Phase W: built from its evidence, as insight records.
    await insightsFromEvidence(clientId, row.id);
  }
  return opps.length;
}
