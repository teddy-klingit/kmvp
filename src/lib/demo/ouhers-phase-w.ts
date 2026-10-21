import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { addWorkingDays } from "@/lib/plan";
import { linkInsights, upsertInsight, type InsightInput } from "@/lib/insight-records";
import { buildPrediction } from "@/lib/opportunity-results";
import type { Prediction, Result } from "@/lib/opportunity-view";

/**
 * Phase W demo (ouhers only): the Opps, OppDetail and InsightsLinked designs, consistent with Phase V's numbers
 * (Story €62 vs €45, 41% vs 17%, +€4–5k). Three new opportunities (Black Friday Stories with Teddy's note, the SPF
 * response, the TikTok refill test with TikTok disconnected), one Considering, two In plan, one Running, nine results
 * (seven met or beat, two missed, with what we learned), four set aside, and the six findings on Insights Overview,
 * linked as in the design. Every estimate and confidence on them is still computed (opportunity-view.ts): the seed
 * writes the findings and past results they're computed from.
 */

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function seedPhaseW(ctx: { clientId: string; now: Date; teddyUserId: string | null; majaUserId: string }) {
  const { clientId, now } = ctx;
  const ago = (days: number, hour = 10, min = 0) => {
    const d = new Date(now.getTime() - days * DAY);
    d.setUTCHours(hour - 2, min, 0, 0);
    return d;
  };
  const insight = async (i: InsightInput) => (await upsertInsight(clientId, { origin: "seed", ...i }, { isDemo: true, now })).id;
  const opp = async (data: Omit<Prisma.OpportunityUncheckedCreateInput, "clientId" | "isDemo" | "origin" | "summary"> & { summary?: string }, insights: string[]) => {
    const o = await prisma.opportunity.create({ data: { clientId, isDemo: true, origin: "seed", summary: data.summary ?? `${data.title}.`, ...data } });
    await linkInsights(clientId, o.id, insights);
    return o;
  };
  const item = async (title: string, date: Date, data: Partial<Prisma.ClientCalendarItemUncheckedCreateInput> = {}) =>
    (await prisma.clientCalendarItem.findFirst({ where: { clientId, title, archivedAt: null } })) ?? (await prisma.clientCalendarItem.create({ data: { clientId, title, date, channel: "Instagram", channels: ["Instagram"], formats: ["Post"], maker: "client", status: "planned", ...data } }));

  // The Phase R suggestions the design replaces: the TikTok refill one and the SPF one come back as W's versions.
  await prisma.opportunity.deleteMany({ where: { clientId, isDemo: true, title: { in: ["Refill rituals on TikTok", "Answer the new SPF launch"] } } });

  // ─── The six findings on Insights Overview (InsightsLinked), newest first, and the ones behind the new cards ───
  const combined = await prisma.opportunity.findFirstOrThrow({ where: { clientId, origin: "combined" } });
  await prisma.insight.updateMany({ where: { clientId, key: "combined:aov-story-feed" }, data: { foundAt: ago(2, 9, 41) } });
  await prisma.insight.updateMany({ where: { clientId, key: "combined:welcome-repeat" }, data: { foundAt: ago(2, 9, 40) } });
  const spfSearch = await insight({ key: "seed:tinted-spf-searches", kind: "data", title: "“tinted SPF” searches are rising", value: "+52%", comparison: "Searches landing on your site", period: "30 days", sources: ["GA4"], dataSize: "1,840 searches", chart: { bars: [{ label: "W1", value: 210 }, { label: "W2", value: 240 }, { label: "W3", value: 262 }, { label: "W4", value: 290 }, { label: "W5", value: 318 }, { label: "W6", value: 320, highlight: true }] }, href: "/insights/audience", foundAt: ago(3) });
  await insight({ key: "seed:retail-fairs", kind: "data", title: "Retail fairs don't pay back", value: "0.7× return", comparison: "€15.2k spent, €11k revenue", period: "90 days", sources: ["HubSpot"], chart: { bars: [{ label: "Revenue", value: 11000, highlight: true }, { label: "Spend", value: 15200 }] }, href: "/insights/revenue", foundAt: ago(4) });
  const saves = await insight({ key: "seed:ritual-saves", kind: "data", title: "Saves on “ritual” posts", value: "+64%", comparison: "vs product posts", period: "last 90 days", sources: ["Meta"], dataSize: "38 posts", chart: { bars: [{ label: "Product", value: 100 }, { label: "Ritual", value: 164, highlight: true }] }, href: "/insights/audience", foundAt: ago(5) });
  await insight({ key: "seed:newsletter-opens", kind: "data", title: "Newsletter opens are steady", value: "41%", comparison: "Open rate", period: "last 6 sends", sources: ["Klaviyo"], chart: { bars: [{ label: "1", value: 40 }, { label: "2", value: 42 }, { label: "3", value: 41 }, { label: "4", value: 40 }, { label: "5", value: 41 }, { label: "6", value: 41, highlight: true }] }, href: "/insights/revenue", foundAt: ago(6) });
  const stick = await insight({ key: "seed:sun-day-stick", kind: "data", title: "sun day stick sells second best", value: "2nd of 14", comparison: "Products by revenue", period: "30 days", sources: ["Shopify"], dataSize: "1,910 orders", chart: { bars: [{ label: "cloud cream", value: 21 }, { label: "sun day stick", value: 17, highlight: true }, { label: "lip ours", value: 12 }] }, href: "/insights/revenue", foundAt: ago(9) });
  const launch = await insight({ key: "seed:competitor-spf-launch", kind: "market", title: "Competitor launch", value: "3 ads live", comparison: "A tinted SPF fluid with a “no white cast” claim, live since the 5th", period: "since launch", sources: ["Meta"], href: "/insights/market", foundAt: ago(16) });
  const refill = await insight({ key: "seed:refill-with-me", kind: "market", title: "“refill with me” videos", value: "+180% views", comparison: "In Nordic beauty, this month vs last", period: "30 days", sources: ["Meta"], chart: { bars: [{ label: "Last month", value: 100 }, { label: "This month", value: 280, highlight: true }] }, href: "/insights/market", foundAt: ago(19) });
  const pouchDay = new Date(now.getTime() + 21 * DAY);
  await item("Refill pouch launch", pouchDay, { formats: ["Post", "Stories"], channels: ["Instagram"] });
  const pouch = await insight({ key: "seed:refill-pouch-launch", kind: "plan", title: "Refill pouch launch", value: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(pouchDay), comparison: "In your Planner", sources: ["Planner"], href: "/planner", foundAt: ago(12) });

  // ─── Three new ones (Opps) ──────────────────────────────────────────────────────────────────────────────────────
  const updated = ago(2, 9, 40);
  await prisma.opportunity.update({
    where: { id: combined.id },
    data: { createdAt: updated, pmNote: "I'd do this one. Concept B is ready, so the brief is quick. Let's check the welcome flow on Thursday's call.", pmNoteByUserId: ctx.teddyUserId, pmNoteAt: updated },
  });
  // The SPF answer: decided by in two days (carousel + stories: 7 working days before it goes live, 8 credits).
  const spfLive = addWorkingDays(new Date(now.getTime() + 2 * DAY), 7);
  await opp(
    {
      title: "Answer the new SPF launch with your daily-glow story",
      summary: "A competitor launched a tinted SPF fluid on the 5th. Your sun day stick already has the stronger claim, and searches for “tinted SPF” are up.",
      kind: "competitor",
      sources: ["competitor", "data"],
      windowStart: new Date(spfLive.getTime() - 7 * DAY),
      windowEnd: spfLive,
      createdAt: ago(2, 9, 35),
      sourceKey: "w:spf-answer",
      routes: { create: [{ letter: "A", name: "The daily-glow story", description: "A carousel and three stories: sun day in a real morning, the claim said plainly, with the number.", formats: ["Carousel", "Stories"], channels: ["Instagram"], sampleLine: "spf 30, no white cast. just your skin, on a good day.", teamCreditsLow: 8, teamCreditsHigh: 8, sortOrder: 0 }] },
    },
    [launch, spfSearch, stick]
  );
  // The TikTok refill test: TikTok is disconnected, so it's Low and its effect is unclear (computed).
  await opp(
    {
      title: "Test a refill ritual video on TikTok before the refill pouch launch",
      summary: "“refill with me” videos are up 180% in Nordic beauty. Your refill pouch launches soon.",
      kind: "trend",
      sources: ["trend"],
      windowStart: new Date(pouchDay.getTime() - 7 * DAY),
      windowEnd: pouchDay,
      createdAt: ago(2, 9, 30),
      sourceKey: "w:refill-tiktok",
      skillKey: "ad_gen",
      routes: { create: [{ letter: "A", name: "Refill with me", description: "One vertical video: the pouch, the jar, thirty quiet seconds. Then two cut-downs.", formats: ["Stories"], channels: ["TikTok"], sampleLine: "same cream. less jar. refill with me.", teamCreditsLow: 4, teamCreditsHigh: 4, aiCredits: 40, sortOrder: 0 }] },
    },
    [refill, pouch]
  );

  // ─── Considering 1, In plan 2 ───────────────────────────────────────────────────────────────────────────────────
  await prisma.opportunity.updateMany({ where: { clientId, title: "More 9:16 for milk wash" }, data: { status: "considering", viewedAt: ago(1, 14) } });
  const bfPlan = await prisma.clientCalendarItem.findFirst({ where: { clientId, title: "Black Friday", archivedAt: null } });
  const noRush = await prisma.opportunity.findFirst({ where: { clientId, title: "Black Friday: the no-rush edit" } });
  if (noRush) {
    await prisma.opportunity.update({ where: { id: noRush.id }, data: { status: "in_plan" } });
    if (bfPlan && !bfPlan.opportunityId) await prisma.clientCalendarItem.update({ where: { id: bfPlan.id }, data: { opportunityId: noRush.id } });
  }
  // Singles Day rests on the ritual-posts finding: the one on Insights Overview (its older copy from its evidence goes).
  const singles = await prisma.opportunity.findFirst({ where: { clientId, title: "Singles Day: self-care, not discounts" }, include: { insights: { include: { insight: true }, orderBy: { sortOrder: "asc" } } } });
  if (singles) {
    const copy = singles.insights.filter((l) => /ritual/i.test(l.insight.title) && l.insightId !== saves).map((l) => l.insightId);
    await prisma.opportunityInsight.deleteMany({ where: { opportunityId: singles.id, insightId: { in: copy } } });
    await prisma.insight.updateMany({ where: { clientId, id: { in: copy } }, data: { status: "archived" } });
    await linkInsights(clientId, singles.id, [saves, ...singles.insights.filter((l) => !copy.includes(l.insightId) && l.insightId !== saves).map((l) => l.insightId)]);
  }

  // ─── Nine results: 7 met or beat, 2 missed (Recent results shows the newest three) ─────────────────────────────
  type Past = { title: string; kind: string; low: number; high: number; actual: number; unit?: "money" | "count"; label?: string; days: number; resultDaysAgo: number; learning?: string; finding: string };
  const past: Past[] = [
    { title: "Summer: sun day, every day · more Reels", kind: "content", low: 8000, high: 12000, actual: 14200, days: 60, resultDaysAgo: 9, finding: "Reels of sun day out-sold its feed posts" },
    { title: "lip ours: let the community vote", kind: "content", low: 400, high: 600, actual: 910, unit: "count", label: "sign-ups", days: 30, resultDaysAgo: 16, finding: "Polls got 3× the comments of other posts" },
    { title: "Pre-launch teaser on Pinterest", kind: "trend", low: 2000, high: 3000, actual: 900, days: 30, resultDaysAgo: 23, learning: "Pinterest suggestions now need 90 days of your own Pinterest data.", finding: "Beauty pins were up in the Nordics" },
    { title: "Back to routine: the September set", kind: "seasonal", low: 3000, high: 5000, actual: 4200, days: 30, resultDaysAgo: 30, finding: "Back-to-routine searches peak in early September" },
    { title: "Answer Glow & Co's serum launch", kind: "competitor", low: 2000, high: 3000, actual: 2400, days: 30, resultDaysAgo: 40, finding: "A competitor serum launched with 5 ads" },
    { title: "Respond to the mineral SPF review", kind: "competitor", low: 2000, high: 3000, actual: 3100, days: 30, resultDaysAgo: 55, finding: "A mineral SPF review went viral in Sweden" },
    { title: "Counter the cloud cream dupe", kind: "competitor", low: 2000, high: 3000, actual: 2900, days: 30, resultDaysAgo: 70, finding: "A cloud cream dupe ran 4 ads" },
    { title: "Midsummer: the light edit", kind: "seasonal", low: 8000, high: 10000, actual: 9900, days: 60, resultDaysAgo: 100, finding: "Midsummer week is the year's second sales peak" },
    { title: "A TikTok creator duet", kind: "trend", low: 1000, high: 2000, actual: 400, days: 30, resultDaysAgo: 120, learning: "TikTok suggestions now need a connected TikTok account.", finding: "Duets with creators were up in beauty" },
  ];
  for (const [n, p] of past.entries()) {
    const resultAt = ago(p.resultDaysAgo, 8);
    const end = new Date(resultAt.getTime() - 2 * DAY);
    const start = new Date(end.getTime() - (p.days - 1) * DAY);
    const unit = p.unit ?? "money";
    const fmt = (x: number) => (unit === "count" ? `${x.toLocaleString("en-GB")}` : x >= 1000 ? `€${(x / 1000).toFixed(1).replace(/\.0$/, "")}k` : `€${x}`);
    const range = unit === "count" ? `+${p.low}–${p.high}${p.label ? ` ${p.label}` : ""}` : `+€${p.low / 1000}–${p.high / 1000}k`;
    const prediction: Prediction = { metric: unit === "count" ? "sign_ups" : "work_revenue", unit, low: p.low, high: p.high, currency: "EUR", label: p.label, windowStart: iso(start), windowEnd: iso(end), baseline: 0, text: range };
    const outcome: Result["outcome"] = p.actual > p.high ? "beat" : p.actual >= p.low ? "met" : "missed";
    const result: Result = { outcome, actual: p.actual, unit, currency: "EUR", label: p.label, text: `+${fmt(p.actual)}${p.label ? ` ${p.label}` : ""}` };
    const f = await insight({ key: `seed:past-${n}`, kind: "data", title: p.finding, value: "", sources: [p.kind === "seasonal" ? "Shopify" : "Meta"], foundAt: new Date(start.getTime() - 20 * DAY) });
    await opp(
      {
        title: p.title,
        kind: p.kind,
        status: "result",
        sources: [p.kind === "content" ? "data" : p.kind],
        createdAt: new Date(start.getTime() - 14 * DAY),
        runningAt: start,
        prediction: prediction as unknown as Prisma.InputJsonValue,
        result: result as unknown as Prisma.InputJsonValue,
        resultAt,
        learning: p.learning ?? null,
        learningStatus: p.learning ? "approved" : null,
        learningByUserId: p.learning ? ctx.teddyUserId : null,
        sourceKey: `w:past-${n}`,
      },
      [f]
    );
  }
  await prisma.opportunityPrefs.upsert({ where: { clientId }, update: {}, create: { clientId } });
  await prisma.opportunityPrefs.update({ where: { clientId }, data: { minDataDays: { Pinterest: 90 } } });

  // ─── Running 1: the autumn routine reel went live six days ago; its prediction is computed from the results ─────
  const live = ago(6);
  const reel = await item("Autumn routine reel", live, { maker: "klingit_help", formats: ["Reel / video"], channels: ["Instagram"], status: "published" });
  const autumn = await insight({ key: "seed:autumn-routine", kind: "data", title: "Routine posts are saved most in October", value: "+41%", comparison: "Saves, routine posts vs the rest", period: "last October", sources: ["Meta"], foundAt: ago(40) });
  const running = await opp({ title: "Autumn routine, softer", summary: "October is when routines change: show the soft version.", kind: "seasonal", sources: ["seasonal", "data"], windowStart: live, windowEnd: live, createdAt: ago(35), sourceKey: "w:autumn-routine", routes: { create: [{ letter: "A", name: "The soft reset", description: "One reel and a carousel: an autumn routine in four steps.", formats: ["Reel / video"], channels: ["Instagram"], status: "added", planItemId: reel.id, sortOrder: 0 }] } }, [autumn]);
  await prisma.clientCalendarItem.update({ where: { id: reel.id }, data: { opportunityId: running.id } });
  const full = await prisma.opportunity.findUniqueOrThrow({ where: { id: running.id }, include: { routes: true, insights: { include: { insight: true } } } });
  await prisma.opportunity.update({ where: { id: running.id }, data: { status: "running", runningAt: live, prediction: (await buildPrediction(full, live)) as unknown as Prisma.InputJsonValue } });

  // ─── Not for us 4 (what the client told us), with the exclude list and the reasons in Activity ──────────────────
  const set: { title: string; reason: string; daysAgo: number; kind: string }[] = [
    { title: "A 30%-off countdown for Black Friday", reason: "Off-brand", daysAgo: 25, kind: "seasonal" },
    { title: "Boost the gift guide with paid social", reason: "Budget is fixed", daysAgo: 75, kind: "content" },
    { title: "Ride the “glass skin” trend", reason: "Not our audience", daysAgo: 44, kind: "trend" },
    { title: "A Midsummer teaser in October", reason: "Wrong timing", daysAgo: 12, kind: "seasonal" },
  ];
  for (const [n, s] of set.entries()) {
    const at = ago(s.daysAgo, 11);
    const f = await insight({ key: `seed:set-aside-${n}`, kind: "data", title: s.title, value: "", sources: ["Meta"], foundAt: new Date(at.getTime() - 5 * DAY) });
    await opp({ title: s.title, kind: s.kind, status: "dismissed", dismissReason: s.reason, dismissedAt: at, dismissedByUserId: ctx.majaUserId, sources: [s.kind === "content" ? "data" : s.kind], createdAt: new Date(at.getTime() - 3 * DAY), sourceKey: `w:set-aside-${n}` }, [f]);
    await prisma.auditLog.create({ data: { clientId, actorUserId: ctx.majaUserId, area: "opportunities", action: `Not for us: “${s.title}” (${s.reason}).${s.reason === "Off-brand" ? " Its topic is on the exclude list." : ""}`, createdAt: at } });
  }
  await prisma.opportunityPrefs.update({ where: { clientId }, data: { excludeTopics: [{ topic: set[0].title, at: ago(25, 11).toISOString(), opportunityId: null }] } });

  // The design's six are this month's newest findings; the rest (Phase R's evidence, the Market feed) found before them.
  const six = ["combined:aov-story-feed", "combined:welcome-repeat", "seed:tinted-spf-searches", "seed:retail-fairs", "seed:ritual-saves", "seed:newsletter-opens"];
  await prisma.insight.updateMany({ where: { clientId, key: { notIn: six }, foundAt: { gt: ago(7) } }, data: { foundAt: ago(8) } });

  return prisma.opportunity.count({ where: { clientId } });
}
