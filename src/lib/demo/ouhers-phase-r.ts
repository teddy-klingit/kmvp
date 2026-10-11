import type { BrandRuleType, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { checkCopy } from "@/lib/rule-check";
import { briefByFor, loadLeadTimes, mondayOf } from "@/lib/plan";
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
