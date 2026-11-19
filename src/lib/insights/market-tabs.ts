import { sitesOf } from "@/lib/competitor-logo";
import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { clientVisible } from "@/lib/opportunities";
import { shortTitle } from "@/lib/insight-records";
import type { PlatformTier } from "@/lib/entitlements";

/**
 * Insights → Competitors and Trends (Phase X v2, designs Ins4Competitors, Ins4Trends). Stored checks only (ad
 * libraries, AI-answer checks, site audits, market signals, trend topics): nothing is fetched on a page load.
 */
const DAY = 86400000;

/** How many competitors a plan tracks (Phase X: 3 on Pro and Basic, 4 on Enterprise). */
/** A competitor move's type tag, from its wording: New product, Price cut or Campaign. */
/** What an ad theme is about, as a tag: Launch, Discount, Sustainability or Brand. */
export function adTag(theme: string): "Launch" | "Discount" | "Sustainability" | "Brand" {
  if (/\d+\s*%|\boff\b|discount|sale|deal/i.test(theme)) return "Discount";
  if (/refill|rebuy|recycl|eco|sustain|plastic/i.test(theme)) return "Sustainability";
  if (/new|launch|spf|introduc|disappear/i.test(theme)) return "Launch";
  return "Brand";
}

export type MoveKind = "New product" | "Price cut" | "Campaign";
export function moveKind(title: string): MoveKind {
  if (/\d+\s*%|\bprice|discount|\boff\b|\bsale\b/i.test(title)) return "Price cut";
  if (/launch|\bnew\b|introduc|pouch|refill|range|product/i.test(title)) return "New product";
  return "Campaign";
}

export const competitorLimit = (tier: PlatformTier) => (tier === "enterprise" ? 4 : 3);
/** How many trends a plan sees (the top ones on Pro and Basic; all on Enterprise). */
export const trendLimit = (tier: PlatformTier) => (tier === "enterprise" ? 12 : 3);

/** A brand as the client sees it: demo accounts' competitors carry "(demo)" in their stored name, never on screen. */
export const brandLabel = (b: string) => b.replace(/\s*\(demo\)\s*$/i, "");
const mentionsBrand = (text: string, brand: string) => text.toLowerCase().includes(brandLabel(brand).toLowerCase());

export async function loadCompetitorsTab(clientId: string, opts: { days: number; now?: Date }) {
  const now = opts.now ?? new Date();
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true, competitorBrands: true, competitorSites: true } });
  const brands = jsonArray<string>(client.competitorBrands);
  const sites = sitesOf(client.competitorSites);
  const logos: Record<string, string | null> = Object.fromEntries(brands.map((b) => [b, sites[b.toLowerCase()]?.logo ?? null]));
  const isOwn = (b: string) => b.toLowerCase() === client.name.toLowerCase();
  const [checks, audits, snaps, profiles, signals] = await Promise.all([
    prisma.aiVisibilityCheck.findMany({ where: { clientId }, orderBy: { checkedAt: "desc" }, take: 400 }),
    prisma.siteAudit.findMany({ where: { clientId } }),
    prisma.competitorSnapshot.findMany({ where: { clientId, capturedAt: { gte: new Date(now.getTime() - 14 * DAY) } }, orderBy: { capturedAt: "desc" } }),
    prisma.competitorProfile.findMany({ where: { clientId } }),
    prisma.marketSignal.findMany({ where: { clientId, type: "COMPETITOR", archivedAt: null, publishedAt: { gte: new Date(now.getTime() - Math.max(opts.days, 60) * DAY) } }, orderBy: { publishedAt: "desc" } }),
  ]);

  // The latest AI-answer run: every check within a day of the newest.
  const newest = checks[0]?.checkedAt.getTime() ?? 0;
  const run = checks.filter((c) => newest - c.checkedAt.getTime() < DAY).map((c) => ({ ...c, list: jsonArray<{ brand: string; mentioned: boolean }>(c.mentions) }));
  const aiShare = (brand: string) => (run.length ? run.filter((c) => c.list.some((m) => m.brand.toLowerCase() === brand.toLowerCase() && m.mentioned)).length / run.length : null);
  const questions = [...new Set(run.map((c) => c.question))].map((q) => {
    const c = run.find((x) => x.question === q)!;
    const named = c.list.filter((m) => m.mentioned).map((m) => m.brand);
    const own = named.findIndex(isOwn);
    return { question: q, named, ownPosition: own >= 0 ? own + 1 : null };
  });
  const engines = [...new Set(run.map((c) => c.engine))];

  // Ads live per brand: the newest snapshot per platform.
  const adsLive = (brand: string) => {
    const seen = new Set<string>();
    let n = 0;
    for (const s of snaps.filter((x) => x.brand.toLowerCase() === brand.toLowerCase())) {
      if (seen.has(s.platform)) continue;
      seen.add(s.platform);
      n += s.totalAds ?? jsonArray(s.adIds).length;
    }
    return seen.size ? n : null;
  };
  const ownAds = new Set((await prisma.metricDaily.findMany({ where: { clientId, source: { in: ["Meta", "Google", "LinkedIn", "TikTok"] }, metric: "impressions", value: { gt: 0 }, date: { gte: new Date(now.getTime() - 7 * DAY).toISOString().slice(0, 10) } }, select: { outputId: true, campaignId: true } })).map((r) => r.outputId ?? r.campaignId).filter(Boolean)).size;
  // A brand's own move names it in the headline; a market-wide signal that only lists it in passing isn't its move.
  const latestMove = (brand: string) => signals.find((s) => mentionsBrand(s.title, brand)) ?? null;
  const seo = (subject: string) => audits.find((a) => a.subject.toLowerCase() === subject.toLowerCase())?.seoScore ?? null;

  // Phase X 2b: ranked by share of AI answers (then Google visibility), each with its gap to you.
  const ownShare = aiShare(client.name);
  const table = [
    { brand: client.name, own: true, aiShare: ownShare, google: seo("Own site"), ads: ownAds || null, move: null as null | { title: string; at: Date; kind: MoveKind } },
    ...brands.map((b) => {
      const m = latestMove(b);
      return { brand: b, own: false, aiShare: aiShare(b), google: seo(b), ads: adsLive(b), move: m ? { title: m.title, at: m.publishedAt, kind: moveKind(m.title) } : null };
    }),
  ]
    .sort((a, b) => (b.aiShare ?? -1) - (a.aiShare ?? -1) || (b.google ?? -1) - (a.google ?? -1))
    .map((r, i) => ({ ...r, rank: i + 1, vsYou: !r.own && r.aiShare !== null && ownShare !== null ? Math.round((r.aiShare - ownShare) * 100) : null }));
  const leaders = { aiShare: Math.max(...table.map((r) => r.aiShare ?? -1)), google: Math.max(...table.map((r) => r.google ?? -1)), ads: Math.max(...table.map((r) => r.ads ?? -1)) };

  // Who AI assistants recommend, in three numbers: questions you win, where you're top 3, where you're not named.
  const answers = { win: questions.filter((x) => x.ownPosition === 1).length, top3: questions.filter((x) => x.ownPosition !== null && x.ownPosition <= 3).length, notNamed: questions.filter((x) => x.ownPosition === null).length, total: questions.length };

  const advertise = brands
    .map((b) => {
      const p = profiles.find((x) => x.brand.toLowerCase() === b.toLowerCase());
      const theme = p ? jsonArray<{ theme: string; evidence?: string }>(p.themes)[0]?.theme : undefined;
      const platforms = [...new Set(snaps.filter((s) => s.brand.toLowerCase() === b.toLowerCase()).map((s) => s.platform))];
      const first = [...snaps].reverse().find((s) => s.brand.toLowerCase() === b.toLowerCase() && jsonArray(s.adIds).length);
      return theme ? { brand: b, theme, tag: adTag(theme), ads: adsLive(b), since: first?.capturedAt ?? null, platforms } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const moves = signals
    .filter((s) => s.publishedAt.getTime() >= now.getTime() - opts.days * DAY)
    .map((s) => ({ id: s.id, at: s.publishedAt, brand: brands.find((b) => mentionsBrand(s.title, b)) ?? null, title: s.title, kind: moveKind(s.title) }))
    // Only moves a tracked brand made; market-wide headlines belong to Trends and the findings.
    .filter((m) => m.brand)
    .slice(0, 6);

  // "For you": what a move means for the client, and the opportunity it feeds. Stored on the signal when staff or the
  // weekly check wrote one; else the opportunity built from a finding about that brand.
  const brandInsights = await prisma.insight.findMany({ where: { clientId, status: "active" }, select: { title: true, opportunities: { select: { opportunity: { select: { id: true, title: true, whyNow: true, status: true, hiddenAt: true, combined: true } } } } } });
  const signalData = new Map(signals.map((x) => [x.id, (x.data ?? {}) as { forYou?: string; opportunityId?: string }]));
  const oppIds = [...signalData.values()].map((d) => d.opportunityId).filter((x): x is string => Boolean(x));
  const linkedOpps = oppIds.length ? await prisma.opportunity.findMany({ where: { clientId, id: { in: oppIds }, hiddenAt: null }, select: { id: true, title: true, whyNow: true, combined: true } }) : [];
  const movesForYou = moves.map((m) => {
    const d = signalData.get(m.id) ?? {};
    const linked = linkedOpps.find((o) => o.id === d.opportunityId);
    const viaInsight = linked ? null : brandInsights.find((i) => mentionsBrand(i.title, m.brand!) && i.opportunities.some((l) => !l.opportunity.hiddenAt && l.opportunity.status !== "dismissed"));
    const opp = linked ?? viaInsight?.opportunities.find((l) => !l.opportunity.hiddenAt && l.opportunity.status !== "dismissed")?.opportunity ?? null;
    return { ...m, forYou: d.forYou ?? opp?.whyNow ?? null, opportunity: opp ? { id: opp.id, title: shortTitle(opp) } : null };
  });

  return { brand: client.name, brands, logos, table, leaders, answers, questions, engines, advertise, moves: movesForYou, checksInRun: run.length };
}
export type CompetitorsTab = Awaited<ReturnType<typeof loadCompetitorsTab>>;

export async function loadTrendsTab(clientId: string, opts: { now?: Date; tier: PlatformTier }) {
  const now = opts.now ?? new Date();
  const [topics, brief, moments, plan, opps] = await Promise.all([
    prisma.trendTopic.findMany({ where: { clientId }, orderBy: [{ capturedAt: "desc" }, { sortOrder: "asc" }], take: 40 }),
    prisma.trendBrief.findUnique({ where: { clientId } }),
    prisma.keyMoment.findMany({ where: { date: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + 90 * DAY) }, OR: [{ clientId: null }, { clientId }] }, orderBy: { date: "asc" } }),
    prisma.clientCalendarItem.findMany({ where: { clientId, date: { gte: new Date(now.getTime() - 14 * DAY), lte: new Date(now.getTime() + 100 * DAY) } }, select: { title: true, date: true, status: true, briefBy: true, opportunityId: true } }),
    prisma.opportunity.findMany({ where: { ...clientVisible(clientId), status: { notIn: ["dismissed", "result"] } }, select: { id: true, title: true, combined: true, windowStart: true, windowEnd: true } }),
  ]);
  // The newest batch only (a check writes all its topics together).
  const newest = topics[0]?.capturedAt.getTime() ?? 0;
  const batch = topics.filter((t) => newest - t.capturedAt.getTime() < DAY).sort((a, b) => a.sortOrder - b.sortOrder);
  const shown = batch.slice(0, trendLimit(opts.tier));
  const oppTitle = new Map(opps.map((o) => [o.id, shortTitle(o)]));
  const rows = shown.map((t) => ({ ...t, series: jsonArray<number>(t.series), opportunity: t.opportunityId && oppTitle.has(t.opportunityId) ? { id: t.opportunityId, title: oppTitle.get(t.opportunityId)! } : null }));

  // Moments in the next 90 days, and whether anything is planned for them.
  const momentRows = moments.slice(0, 8).map((m) => {
    // Planned when a Planner item names the moment (dates alone match too much in a busy season).
    const item = plan.find((p) => mentionsBrand(p.title, m.name));
    const opp = opps.find((o) => mentionsBrand(o.title, m.name));
    return { id: m.id, name: m.name, date: m.date, planned: item ? { status: item.status, briefed: Boolean(item.briefBy) } : null, opportunity: !item && opp ? { id: opp.id } : null, briefBy: new Date(m.date.getTime() - 28 * DAY), briefPassed: m.date.getTime() - 28 * DAY < now.getTime() };
  });

  const demand = brief?.categoryDemand as { series?: { label: string; value: number }[]; change?: number; label?: string; note?: string } | null;
  return { rows, hidden: Math.max(0, batch.length - shown.length), moments: momentRows, demand: demand?.series?.length ? { series: demand.series, change: demand.change ?? null, label: demand.label ?? null, note: demand.note ?? null } : null };
}
export type TrendsTab = Awaited<ReturnType<typeof loadTrendsTab>>;
