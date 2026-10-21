import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/platform-settings";
import { briefByFor, loadLeadTimes, teamCreditsFor } from "@/lib/plan";
import { jsonArray } from "@/lib/utils";
import { linkInsights, upsertInsight, type InsightInput } from "@/lib/insight-records";

/**
 * Phase V: rules for AI on combined data. An opportunity, takeaway or answer built from several sources:
 *  - every claim shows its sources and how much data is behind it;
 *  - confidence (High / Medium / Low) comes from rules, never the model's opinion: enough data (staff-set minimums),
 *    sources agree (within a staff-set share), and the result holds across credit models. Below the minimums there's
 *    no recommendation, only "not enough data yet";
 *  - every number has its maths and a range, blind spots are listed, disagreements shown;
 *  - numbers are computed here, from the data layer; a model only ever writes words around them.
 */

export type Claim = { title: string; text: string; sources: string[]; size: string };
export type Check = { ok: boolean; text: string };
export type Confidence = "high" | "medium" | "low";
export type Combined = {
  kind: "budget-shift";
  headline: string;
  effect: { low: number; high: number; point: number; currency: string; days: number; text: string };
  cost: { spend: number; credits: number | null; text: string };
  decideBy: string | null;
  evidence: Claim[];
  maths: { label: string; text: string }[];
  mathsNote: string;
  checks: Check[];
  blind: string[];
  disagree: { text: string; a: { source: string; value: number }; b: { source: string; value: number } } | null;
  actions: { addToPlan: { planItemId: string; label: string; formats: string[] } | null; brief: { label: string; href: string }; askPm: boolean };
  sources: string[];
  dataSize: string;
};

/** High: all three checks hold. Medium: enough data and one other. Low: enough data only. Null: not enough data. */
export function confidenceFrom(c: { enough: boolean; agree: boolean | null; holds: boolean | null }): Confidence | null {
  if (!c.enough) return null;
  const others = [c.agree, c.holds].filter((x) => x === true).length;
  return others === 2 ? "high" : others === 1 ? "medium" : "low";
}
export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };

const n0 = (n: number) => Math.round(n).toLocaleString("en-GB");
const k1 = (n: number, sym: string) => (Math.abs(n) >= 1000 ? `${sym}${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${sym}${Math.round(n)}`);
const symOf = (c: string) => (c === "EUR" ? "€" : c === "USD" ? "$" : c === "GBP" ? "£" : `${c} `);


/** Story or Feed, from a piece of work's format. */
const family = (format: string | null | undefined) => (/story|9:16|reel/i.test(format ?? "") ? "Story" : /feed|4:5|1:1|square|post|link ad/i.test(format ?? "") ? "Feed" : null);

/**
 * Move a test budget to the placement that sells better, before an upcoming plan item that only uses the weaker one.
 * Everything below is computed from the data layer, the Planner and the Output library; null when the data isn't
 * enough or there's nothing upcoming to change (then there's no recommendation).
 */
export async function budgetShiftOpportunity(clientId: string, now = new Date()): Promise<{ combined: Combined; confidence: Confidence | null; planItemId: string; title: string; summary: string; insights: InsightInput[] } | { notEnough: string } | null> {
  const days = 90;
  const start = new Date(now.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const [rows, minimums, within, budget, leadTimes] = await Promise.all([
    prisma.metricDaily.findMany({ where: { clientId, date: { gte: start } }, select: { source: true, channel: true, utmCampaign: true, campaignId: true, campaignName: true, outputId: true, model: true, metric: true, value: true, currency: true, date: true } }),
    getSetting("confidenceMinimums"),
    getSetting("sourcesAgreeWithin"),
    getSetting("opportunityTestBudget"),
    loadLeadTimes(),
  ]);
  const currency = rows.find((r) => r.metric === "revenue")?.currency ?? "EUR";
  const sym = symOf(currency);

  // Online orders and revenue from Meta, per placement (the format of the work their utm_content names).
  const outputIds = [...new Set(rows.filter((r) => r.outputId && r.source === "Shopify" && r.channel === "Meta").map((r) => r.outputId!))];
  const formats = new Map((await prisma.asset.findMany({ where: { id: { in: outputIds }, clientId }, select: { id: true, format: true, name: true } })).map((a) => [a.id, a]));
  const per = (model: "first" | "last" | "shared") => {
    const out = { Story: { orders: 0, revenue: 0, campaigns: new Set<string>() }, Feed: { orders: 0, revenue: 0, campaigns: new Set<string>() } };
    for (const r of rows) {
      if (r.source !== "Shopify" || r.channel !== "Meta" || !r.outputId || !["orders", "revenue"].includes(r.metric)) continue;
      const w = model === "shared" ? 0.5 : r.model === model ? 1 : 0;
      const f = family(formats.get(r.outputId)?.format) as "Story" | "Feed" | null;
      if (!f || !w) continue;
      out[f][r.metric as "orders" | "revenue"] += r.value * w;
      if (r.utmCampaign) out[f].campaigns.add(r.utmCampaign);
    }
    return out;
  };
  const shared = per("shared");
  const S = shared.Story;
  const F = shared.Feed;
  if (S.orders < minimums.orders || F.orders < minimums.orders) return { notEnough: `Not enough data yet: ${n0(S.orders)} Story and ${n0(F.orders)} Feed orders in ${days} days (at least ${minimums.orders} each).` };
  const aovS = S.revenue / S.orders;
  const aovF = F.revenue / F.orders;
  const gap = aovS / aovF - 1;
  if (gap < 0.2) return null;

  // Cost per order: Meta spend on the campaigns that sold each placement.
  const spendOf = (campaigns: Set<string>) => rows.filter((r) => r.source === "Meta" && r.metric === "spend" && campaigns.has(r.utmCampaign)).reduce((a, r) => a + r.value, 0);
  const cpoS = spendOf(S.campaigns) / S.orders;
  const cpoF = spendOf(F.campaigns) / F.orders;
  if (!Number.isFinite(cpoS) || !Number.isFinite(cpoF) || !cpoS || !cpoF) return null;

  // Repeat orders within 60 days for Story buyers, with and without the welcome flow (Klaviyo + Shopify cohorts).
  const cohort = (id: string, metric: string) => rows.filter((r) => r.campaignId === id && r.metric === metric).reduce((a, r) => a + r.value, 0);
  const flowBuyers = cohort("cohort:story:flow", "cohort_buyers");
  const flowRepeat = cohort("cohort:story:flow", "cohort_repeat_60d");
  const noBuyers = cohort("cohort:story:noflow", "cohort_buyers");
  const noRepeat = cohort("cohort:story:noflow", "cohort_repeat_60d");
  const repeatValue = (cohort("cohort:story:flow", "cohort_repeat_value") + cohort("cohort:story:noflow", "cohort_repeat_value")) / Math.max(1, flowRepeat + noRepeat);
  const rateFlow = flowBuyers ? flowRepeat / flowBuyers : 0;
  const rateNo = noBuyers ? noRepeat / noBuyers : 0;

  // The upcoming plan item that only uses Feed (no Stories), within 60 days.
  const items = await prisma.clientCalendarItem.findMany({ where: { clientId, archivedAt: null, date: { gte: now, lte: new Date(now.getTime() + 60 * 86400000) } }, orderBy: { date: "asc" } });
  const item = items.find((i) => {
    const f = jsonArray<string>(i.formats);
    // Planned paid Feed placements by name ("Feed ad"); a plain "Post" is organic, not a budget to move.
    return f.some((x) => /feed/i.test(x)) && !f.some((x) => /stor/i.test(x));
  });
  if (!item) return null;
  const itemFormats = jsonArray<string>(item.formats);
  const feedAds = itemFormats.filter((x) => /feed/i.test(x)).length;
  const emails = itemFormats.filter((x) => /email/i.test(x)).length;
  const itemDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(item.date);

  // ─── The maths (the point) and the range ─────────────────────────────────────
  const ordersS = Math.round(budget / cpoS);
  const ordersF = Math.round(budget / cpoF);
  const firstS = ordersS * aovS;
  const repeatS = ordersS * rateFlow * repeatValue;
  const onStories = firstS + repeatS;
  const onFeed = ordersF * aovF;
  const point = onStories - onFeed;
  // Low end: Black Friday clicks cost more (cost per order +10%), and Feed buyers' own repeat orders (no welcome flow).
  const lowS = Math.round(budget / (cpoS * 1.1));
  const lowF = Math.round(budget / (cpoF * 1.1));
  const low = lowS * aovS + lowS * rateFlow * repeatValue - (lowF * aovF + lowF * rateNo * repeatValue);
  // In whole thousands, so the range never reads more precise than the data is.
  const rangeLow = Math.round(Math.min(low, point) / 1000);
  const rangeHigh = Math.max(rangeLow + 1, Math.round(Math.max(low, point) / 1000));
  const credits = teamCreditsFor(["Stories"], leadTimes);
  const brief = briefByFor(item.date, ["Stories"], leadTimes).briefBy;

  // ─── Checks ──────────────────────────────────────────────────────────────────
  const metaReported = rows.filter((r) => r.source === "Meta" && r.metric === "conversions" && S.campaigns.has(r.utmCampaign)).reduce((a, r) => a + r.value, 0);
  const diff = metaReported ? Math.abs(metaReported - S.orders) / S.orders : null;
  const agree = diff === null ? null : diff <= within;
  const first = per("first");
  const holds = first.Story.orders && first.Feed.orders ? first.Story.revenue / first.Story.orders / (first.Feed.revenue / first.Feed.orders) - 1 >= 0.2 : null;
  const storeSales = rows.some((r) => r.metric === "store_revenue");
  const enough = S.orders >= minimums.orders;
  const confidence = confidenceFrom({ enough, agree, holds });
  const checks: Check[] = [
    { ok: enough, text: `Enough data: ${n0(S.orders)} Story orders, ${days} days` },
    agree === null ? { ok: false, text: "Meta didn't report its own order count, so it can't be checked against Shopify" } : { ok: agree, text: agree ? `Sources agree: Meta and Shopify order counts within ${Math.max(1, Math.round(diff! * 100))}%` : `Sources disagree: Meta counts ${n0(metaReported)} orders, Shopify ${n0(S.orders)}` },
    holds === null ? { ok: false, text: "Can't compare credit models: no first-touch numbers" } : { ok: holds, text: holds ? "Same result with first-touch and shared credit" : "The result changes with first-touch credit" },
  ];
  const blind = storeSales ? [] : ["Can't see in-store sales, so the real effect may be higher"];

  // The Story to reuse: the best measured Story by CTR, against the average of all measured pieces.
  const measured = await prisma.asset.findMany({ where: { clientId, performanceCtr: { not: null }, sentVersion: { not: null } }, select: { name: true, format: true, performanceCtr: true } });
  const stories = measured.filter((m) => family(m.format) === "Story").sort((a, b) => (b.performanceCtr ?? 0) - (a.performanceCtr ?? 0));
  const avgCtr = measured.length ? measured.reduce((a, m) => a + (m.performanceCtr ?? 0), 0) / measured.length : null;
  const best = stories[0];
  const pct = Math.round(gap * 100);

  const evidence: Claim[] = [
    { title: "Story ads bring bigger orders", text: `${sym}${Math.round(aovS)} average order from Meta Stories vs ${sym}${Math.round(aovF)} from Feed (+${pct}%)`, sources: ["Meta", "Shopify"], size: `${n0(S.orders)} orders` },
    ...(flowBuyers && noBuyers ? [{ title: "Email turns them into repeat buyers", text: `${Math.round(rateFlow * 100)}% of Story buyers order again within 60 days if they get the welcome flow, ${Math.round(rateNo * 100)}% if not`, sources: ["Klaviyo", "Shopify"], size: `${n0(flowBuyers + noBuyers)} customers` }] : []),
    { title: `${item.title} is planned with Feed only`, text: `${feedAds} Feed ad${feedAds === 1 ? "" : "s"}${emails ? ` and ${emails} email${emails === 1 ? "" : "s"}` : ""} planned for ${itemDay}, no Stories`, sources: ["Planner"], size: `${itemFormats.length} planned pieces` },
    ...(best && avgCtr ? [{ title: "The Story to reuse", text: `${best.name.replace(/\.$/, "")}: CTR ${best.performanceCtr}% vs ${avgCtr.toFixed(1)}% average`, sources: ["Output library", "Meta"], size: `${measured.length} measured pieces` }] : []),
  ];
  // Phase W: the findings it's built from, as insight records (the same numbers as the claims above).
  const insights: InsightInput[] = [
    { key: "combined:aov-story-feed", kind: "data", title: "Story ads bring bigger orders", value: `${sym}${Math.round(aovS)} vs ${sym}${Math.round(aovF)}`, comparison: "Average order, Meta Stories vs Feed", period: `${days} days`, sources: ["Meta", "Shopify"], dataSize: `${n0(S.orders)} orders`, chart: { bars: [{ label: "Feed", value: aovF }, { label: "Story", value: aovS, highlight: true }] }, href: "/insights/revenue", origin: "combined" },
    ...(flowBuyers && noBuyers
      ? [{ key: "combined:welcome-repeat", kind: "data" as const, title: "Email brings Story buyers back", value: `${Math.round(rateFlow * 100)}% vs ${Math.round(rateNo * 100)}%`, comparison: "Buy again within 60 days, with vs without the welcome flow", period: "60 days", sources: ["Klaviyo", "Shopify"], dataSize: `${n0(flowBuyers + noBuyers)} customers`, chart: { bars: [{ label: "Without", value: rateNo * 100 }, { label: "With", value: rateFlow * 100, highlight: true }] }, href: "/insights/revenue", origin: "combined" }]
      : []),
    { key: `combined:plan-feed-only:${item.id}`, kind: "plan", title: `${item.title} has no Stories`, value: `${feedAds} Feed · 0 Story`, comparison: `What's planned for ${itemDay}`, sources: ["Planner"], dataSize: `${itemFormats.length} planned pieces`, chart: { bars: [{ label: "Feed", value: feedAds, highlight: true }, { label: "Story", value: 0 }] }, href: "/planner", origin: "combined" },
  ];
  const maths = [
    { label: "On Stories", text: `${sym}${n0(budget)} ÷ ${sym}${Math.round(cpoS)} per order = ${ordersS} orders × ${sym}${Math.round(aovS)} = ${k1(firstS, sym)}, plus ${Math.round(rateFlow * 100)}% repeat orders × ${sym}${Math.round(repeatValue)} = ${k1(repeatS, sym)}. Total ≈ ${k1(onStories, sym)}.` },
    { label: "Kept on Feed", text: `${sym}${n0(budget)} ÷ ${sym}${Math.round(cpoF)} per order = ${ordersF} orders × ${sym}${Math.round(aovF)} = ${k1(onFeed, sym)}.` },
    { label: "Difference", text: `about ${k1(point, sym)} more over 60 days.` },
  ];
  const combined: Combined = {
    kind: "budget-shift",
    headline: `Move ${sym}${n0(budget)} of ${item.title} budget to Story ads, then catch buyers with the welcome email`,
    effect: { low: rangeLow * 1000, high: rangeHigh * 1000, point, currency, days: 60, text: `≈ +${sym}${rangeLow}–${rangeHigh}k revenue over 60 days` },
    cost: { spend: 0, credits, text: `${sym}0 extra spend${credits ? ` · ≈ ${credits} creative credits` : ""}` },
    decideBy: brief ? brief.toISOString() : null,
    evidence,
    maths,
    mathsNote: `Range, not a promise: the low end assumes ${item.title} costs per order 10% higher and counts Feed buyers' own repeat orders (${Math.round(rateNo * 100)}%). Based on ${days} days of data.`,
    checks,
    blind,
    disagree: agree === false ? { text: "Meta and Shopify count Story orders differently", a: { source: "Meta", value: metaReported }, b: { source: "Shopify", value: S.orders } } : null,
    actions: { addToPlan: { planItemId: item.id, label: `Add to ${item.title} plan`, formats: ["Stories"] }, brief: { label: best ? `Brief 3 Story versions of ${best.name.replace(/\.$/, "")}` : "Brief 3 Story versions", href: "/brief/new" }, askPm: true },
    sources: [...new Set(evidence.flatMap((e) => e.sources))],
    dataSize: `${n0(S.orders + F.orders)} orders · ${days} days`,
  };
  return {
    combined,
    confidence,
    planItemId: item.id,
    title: combined.headline,
    insights,
    summary: `Story ads bring ${pct}% bigger orders${flowBuyers ? ", and those buyers come back when the welcome email reaches them" : ""}. Your ${item.title} plan has no Stories yet.`,
  };
}

/**
 * Writes (or refreshes) the client's combined opportunity; a dismissed one is never brought back for the same plan
 * item. Below the minimums nothing is written: there's no recommendation, only "not enough data yet".
 */
export async function upsertCombinedOpportunity(clientId: string, now = new Date(), opts: { isDemo?: boolean } = {}) {
  const r = await budgetShiftOpportunity(clientId, now);
  if (!r || "notEnough" in r) return r;
  const sourceKey = `combined:budget-shift:${r.planItemId}`;
  const existing = await prisma.opportunity.findFirst({ where: { clientId, sourceKey } });
  if (existing?.status === "dismissed") return existing;
  const data = { title: r.title, summary: r.summary, whyNow: r.combined.evidence[0]?.text ?? null, combined: r.combined, confidence: r.confidence, sources: ["data"], evidence: [], windowEnd: r.combined.decideBy ? new Date(r.combined.decideBy) : null, origin: "combined", isDemo: Boolean(opts.isDemo) };
  const o = existing ? await prisma.opportunity.update({ where: { id: existing.id }, data }) : await prisma.opportunity.create({ data: { clientId, sourceKey, ...data } });
  // Phase W: built from its findings, written as insight records and linked.
  const insights = [];
  for (const i of r.insights) insights.push(await upsertInsight(clientId, i, { isDemo: opts.isDemo, now }));
  await linkInsights(clientId, o.id, insights.map((i) => i.id));
  return o;
}
