import { z } from "zod";
import type { Opportunity, OpportunityRoute, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { marketingPm } from "@/lib/contact-person";
import { notify } from "@/lib/notifier";
import { jsonArray } from "@/lib/utils";
import { runAgentTask } from "@/lib/ai/run-agent";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { loadBrandForAgents } from "@/lib/brand-rules";
import { checkCopy, type CopyCheck } from "@/lib/rule-check";
import { loadMeasuredAssets } from "@/lib/insights-data";
import { briefByFor, loadLeadTimes, teamCreditsFor } from "@/lib/plan";
import { insightSources, refreshInsights } from "@/lib/insight-records";

/**
 * Plan → Opportunities (Phase R step 4, designs 06–07). What used to be Insights ideas, calendar suggestions and
 * project inspiration, as one object: why now (evidence from the client's own data, the Market feed and the
 * key-moments table — never typed by a model), when (a best window and, for Klingit, a brief-by date), and 2–3
 * routes, each with a sample line in the client's voice that went through the shared rule check.
 *
 * Every read here is scoped to one client: an opportunity, its evidence and its routes never reach another client.
 */

const DAY = 86400000;

export const SOURCES = {
  seasonal: { label: "Seasonal moment", pill: "bg-brand-peach-pale text-brand-ink" },
  data: { label: "Your data", pill: "bg-[#E9F2C9] text-brand-ink" },
  trend: { label: "Trend", pill: "bg-[#F6E3F6] text-brand-ink" },
  competitor: { label: "Competitor", pill: "bg-[#E6ECF5] text-brand-ink" },
} as const;
export type Source = keyof typeof SOURCES;
export const isSource = (s: unknown): s is Source => typeof s === "string" && s in SOURCES;

/** Phase W: the stepper. Dismissed sits before In plan, so adding a set-aside one to the Planner brings it back. */
export const STATUSES = ["new", "considering", "in_plan", "running", "result"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status | "dismissed", string> = { new: "New", considering: "Considering", in_plan: "In plan", running: "Running", result: "Result", dismissed: "Not for us" };
export const statusRank = (s: string) => ["new", "considering", "dismissed", "in_plan", "running", "result"].indexOf(s);

/** Phase W: what kind of move it is. */
export const KINDS = { budget: "Budget", competitor: "Competitor", trend: "Trend", seasonal: "Seasonal", content: "Content" } as const;
export type Kind = keyof typeof KINDS;
export const kindFor = (sources: string[], origin?: string | null): Kind =>
  origin === "combined" ? "budget" : sources.includes("seasonal") ? "seasonal" : sources.includes("competitor") ? "competitor" : sources.includes("trend") ? "trend" : "content";
export const kindOf = (o: Pick<Opportunity, "kind" | "sources" | "origin">): Kind => (o.kind && o.kind in KINDS ? (o.kind as Kind) : kindFor(sourcesOf(o), o.origin));

export const DISMISS_REASONS = ["Not our audience", "Wrong timing", "Off-brand", "Already planned", "Budget is fixed", "Don't trust the data"] as const;
/** Phase V: the reasons offered on an opportunity built from several sources (OpportunityCombined). */
export const COMBINED_DISMISS_REASONS = ["Budget is fixed", "Wrong timing", "Don't trust the data"] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];

export type Evidence = { value: string; text: string; source: string; kind: "moment" | "data" | "market"; ref?: string | null; demo?: boolean };
export type Chart = { title: string; subtitle?: string; bars: { label: string; value: number }[]; highlight?: string; source?: string };
export type RouteCheck = { ok: boolean; violations: { rule: string; words: string[] }[] };

export const evidenceOf = (o: Pick<Opportunity, "evidence">) => jsonArray<Evidence>(o.evidence);
export const sourcesOf = (o: Pick<Opportunity, "sources">) => jsonArray<string>(o.sources).filter(isSource);
export const chartOf = (o: Pick<Opportunity, "chart">): Chart | null => {
  const c = o.chart as Chart | null;
  return c && Array.isArray(c.bars) && c.bars.length ? c : null;
};

/**
 * What the client may see: not hidden by staff, and built from at least one insight (Phase W: an opportunity without
 * a linked insight stays with staff until they link one or archive it).
 */
export const clientVisible = (clientId: string): Prisma.OpportunityWhereInput => ({ clientId, hiddenAt: null, insights: { some: {} } });
/** Shown to the client: visible and not dismissed. */
const shown = (clientId: string): Prisma.OpportunityWhereInput => ({ ...clientVisible(clientId), status: { not: "dismissed" } });

export async function listOpportunities(clientId: string, opts: { source?: Source | null } = {}) {
  const rows = await prisma.opportunity.findMany({ where: shown(clientId), include: { routes: { orderBy: { sortOrder: "asc" } } } });
  const filtered = opts.source ? rows.filter((o) => sourcesOf(o).includes(opts.source!)) : rows;
  // Soonest window first (its end, or its start); "any time" after the dated ones; newest first among equals.
  const key = (o: Opportunity) => (o.windowEnd ?? o.windowStart)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return filtered.sort((a, b) => key(a) - key(b) || b.createdAt.getTime() - a.createdAt.getTime());
}

export async function countBySource(clientId: string) {
  const rows = await prisma.opportunity.findMany({ where: shown(clientId), select: { sources: true } });
  const out: Record<Source | "all", number> = { all: rows.length, seasonal: 0, data: 0, trend: 0, competitor: 0 };
  for (const r of rows) for (const s of sourcesOf(r)) out[s]++;
  return out;
}

/** "New": not opened by the client yet (Phase W: opening one makes it Considering). */
export const newWhere = (clientId: string): Prisma.OpportunityWhereInput => ({ ...shown(clientId), status: "new" });
export const isNew = (o: Pick<Opportunity, "status">) => o.status === "new";

export async function newOpportunities(clientId: string, take = 3) {
  const where = newWhere(clientId);
  const [count, newest] = await Promise.all([prisma.opportunity.count({ where }), prisma.opportunity.findMany({ where, orderBy: { createdAt: "desc" }, take })]);
  return { count, newest };
}

/** Phase W: someone at the client opened it: a new one becomes Considering (once). */
export async function markViewed(clientId: string, id: string, now = new Date()) {
  await prisma.opportunity.updateMany({ where: { id, ...clientVisible(clientId), status: "new" }, data: { status: "considering", viewedAt: now } });
}

/** One opportunity, only for its own client (and never one staff hid). */
export async function loadOpportunity(clientId: string, id: string, opts: { staff?: boolean } = {}) {
  return prisma.opportunity.findFirst({ where: { id, ...(opts.staff ? { clientId } : clientVisible(clientId)) }, include: { routes: { orderBy: { sortOrder: "asc" } } } });
}

export const routeCost = (r: Pick<OpportunityRoute, "teamCreditsLow" | "teamCreditsHigh" | "aiCredits">) => {
  const team = r.teamCreditsLow != null ? (r.teamCreditsHigh != null && r.teamCreditsHigh !== r.teamCreditsLow ? `${r.teamCreditsLow}–${r.teamCreditsHigh}` : `${r.teamCreditsLow}`) : null;
  return [team ? `≈ ${team} creative credits` : null, r.aiCredits != null ? `≈ ${r.aiCredits} AI` : null].filter(Boolean).join(" or ");
};

/** The card's cost range across the routes. */
export function costRange(routes: Pick<OpportunityRoute, "teamCreditsLow" | "teamCreditsHigh" | "aiCredits">[]) {
  const lows = routes.flatMap((r) => (r.teamCreditsLow != null ? [r.teamCreditsLow] : []));
  const highs = routes.flatMap((r) => (r.teamCreditsHigh ?? r.teamCreditsLow) ?? []);
  const ai = routes.flatMap((r) => (r.aiCredits != null ? [r.aiCredits] : []));
  const team = lows.length ? (Math.min(...lows) === Math.max(...highs) ? `${Math.min(...lows)}` : `${Math.min(...lows)}–${Math.max(...highs)}`) : null;
  if (team && ai.length) return `≈ ${Math.min(...ai)} AI credits or ${Math.min(...lows)} creative credits`;
  return team ? `≈ ${team} creative credits` : ai.length ? `≈ ${Math.min(...ai)} AI credits` : null;
}

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
const wday = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);

export function windowLabel(o: Pick<Opportunity, "windowStart" | "windowEnd" | "windowNote">, opts: { weekday?: boolean } = {}) {
  const f = opts.weekday ? wday : day;
  if (o.windowStart && o.windowEnd && o.windowStart.toDateString() !== o.windowEnd.toDateString()) {
    const sameMonth = !opts.weekday && o.windowStart.getMonth() === o.windowEnd.getMonth();
    return `${sameMonth ? o.windowStart.getDate() : f(o.windowStart)} – ${f(o.windowEnd)}`.replace(/^(\d+) – /, "$1–");
  }
  const one = o.windowStart ?? o.windowEnd;
  return one ? f(one) : (o.windowNote ?? "Any time");
}

/** Brief-by for Klingit to make it: the window's last day minus the longest route's lead time. */
export async function opportunityBriefBy(o: Pick<Opportunity, "windowStart" | "windowEnd">, route?: Pick<OpportunityRoute, "formats"> | null) {
  const live = o.windowEnd ?? o.windowStart;
  if (!live) return null;
  return briefByFor(live, route ? jsonArray<string>(route.formats) : [], await loadLeadTimes()).briefBy;
}

// ─── Quarter stats (06, side) ─────────────────────────────────────────────

export async function quarterStats(clientId: string, now = new Date()) {
  const from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const rows = await prisma.opportunity.findMany({ where: { ...clientVisible(clientId), createdAt: { gte: from } }, select: { id: true, status: true, routes: { select: { planItemId: true } } } });
  const live = rows.filter((r) => r.status === "live");
  // Top performers: live ones whose published plan item is an asset measured above the client's average CTR.
  const itemIds = live.flatMap((r) => r.routes.flatMap((x) => (x.planItemId ? [x.planItemId] : [])));
  let top = 0;
  if (itemIds.length) {
    const [items, { measured }] = await Promise.all([prisma.clientCalendarItem.findMany({ where: { id: { in: itemIds }, clientId }, select: { publishedAssetId: true } }), loadMeasuredAssets(clientId)]);
    const avg = measured.length ? measured.reduce((a, m) => a + m.ctr, 0) / measured.length : null;
    top = avg == null ? 0 : items.filter((i) => measured.some((m) => m.id === i.publishedAssetId && m.ctr > avg)).length;
  }
  return {
    suggested: rows.length,
    added: rows.filter((r) => ["added", "briefed", "live"].includes(r.status)).length,
    briefed: rows.filter((r) => ["briefed", "live"].includes(r.status)).length,
    live: live.length,
    top,
  };
}

// ─── Client actions' effects ─────────────────────────────────────────────

export async function dismissOpportunity(clientId: string, userId: string | null, id: string, reason: string) {
  const r = (DISMISS_REASONS as readonly string[]).includes(reason) ? reason : "Not for us";
  const res = await prisma.opportunity.updateMany({ where: { id, clientId }, data: { status: "dismissed", dismissReason: r, dismissedAt: new Date(), dismissedByUserId: userId } });
  if (res.count) await prisma.opportunityRoute.updateMany({ where: { opportunityId: id, status: "new" }, data: { status: "dismissed" } });
  // Phase V: "Don't trust the data" is logged and goes to the Marketing PM, who can check the numbers with the client.
  if (res.count && r === "Don't trust the data") {
    const o = await prisma.opportunity.findUnique({ where: { id }, select: { title: true } });
    await prisma.auditLog.create({ data: { clientId, actorUserId: userId, area: "opportunities", action: `Doesn't trust the data behind “${o?.title ?? id}”` } });
    const pm = await marketingPm(clientId);
    const who = userId ? (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name : null;
    if (pm) await notify({ userId: pm.userId, clientId, type: "SYSTEM", title: `${who?.split(" ")[0] ?? "The client"} doesn't trust the data behind an opportunity`, body: `“${o?.title ?? "An opportunity"}” was set aside: “Don't trust the data”. Worth a look at its sources together.`, actionUrl: `/ops/clients/${clientId}/opportunities`, actionLabel: "Open opportunities" });
  }
  return res.count > 0;
}

/**
 * A plan item was made from a route: the route moves on (added, then briefed) and the opportunity is In plan
 * (never backwards: a running one or one with a result stays where it is; a dismissed one comes back).
 */
export async function markRoute(clientId: string, opportunityId: string, letter: string | null, step: "added" | "briefed", link: { planItemId?: string; projectId?: string }) {
  const o = await prisma.opportunity.findFirst({ where: { id: opportunityId, clientId }, select: { id: true, status: true } });
  if (!o) return;
  if (statusRank("in_plan") > statusRank(o.status)) await prisma.opportunity.update({ where: { id: o.id }, data: { status: "in_plan" } });
  const routeRank = (s: string) => ["new", "dismissed", "added", "briefed", "live"].indexOf(s);
  const route = letter ? await prisma.opportunityRoute.findFirst({ where: { opportunityId: o.id, letter } }) : null;
  if (route) await prisma.opportunityRoute.update({ where: { id: route.id }, data: { status: routeRank(step) > routeRank(route.status) ? step : route.status, planItemId: link.planItemId ?? route.planItemId, projectId: link.projectId ?? route.projectId } });
}

/** Add to plan prefilled from an opportunity (and a route). */
export async function prefillFromOpportunity(clientId: string, id: string, letter?: string | null) {
  const o = await loadOpportunity(clientId, id);
  if (!o) return null;
  const route = o.routes.find((r) => r.letter === letter) ?? o.routes[0] ?? null;
  const live = o.windowEnd ?? o.windowStart;
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    title: o.title,
    date: live ? iso(live) : undefined,
    channels: route ? jsonArray<string>(route.channels) : [],
    formats: route ? jsonArray<string>(route.formats) : [],
    maker: "klingit_help" as const,
    notes: route ? `${route.name}: ${route.description}` : o.summary,
    opportunityId: o.id,
    route: route?.letter,
    source: `From the opportunity “${o.title}”${route ? ` · route ${route.letter}` : ""}`,
  };
}

/** What the brief assistant gets on top of the plan item: the route and the evidence, in words. */
export async function briefExtras(clientId: string, opportunityId: string, letter: string | null) {
  const o = await loadOpportunity(clientId, opportunityId);
  if (!o) return {};
  const route = o.routes.find((r) => r.letter === letter) ?? null;
  return {
    routeText: route ? `Route ${route.letter}, ${route.name}: ${route.description}${route.sampleLine ? ` Sample line: “${route.sampleLine}”` : ""}` : null,
    evidence: evidenceOf(o).map((e) => `${e.value} ${e.text} (${e.source}${e.demo ? ", demo" : ""}).`),
  };
}

// ─── Facts: the only things evidence can be made of ─────────────────────

export type Fact = Evidence & { id: string; signalType?: string; insightId: string };

/**
 * The client's own facts for a scan, as insight records (Phase W): key moments in the next ten weeks, CTR by
 * delivered format, campaigns that are tiring, the Market feed and revenue findings. A real client's findings are
 * refreshed first; a demo client's are seeded. Scoped to this client; a demo client's facts say demo.
 */
export async function opportunityFacts(clientId: string, now = new Date()): Promise<Fact[]> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { isDemo: true } });
  await refreshInsights(clientId, now).catch(() => null);
  const insights = await prisma.insight.findMany({ where: { clientId, status: "active", OR: [{ kind: "moment" }, { foundAt: { gte: new Date(now.getTime() - 60 * DAY) } }] }, orderBy: [{ kind: "asc" }, { foundAt: "desc" }], take: 40 });
  const signalIds = insights.flatMap((i) => (i.key.startsWith("signal:") ? [i.key.slice("signal:".length)] : []));
  const types = new Map((await prisma.marketSignal.findMany({ where: { clientId, id: { in: signalIds } }, select: { id: true, type: true } })).map((s) => [s.id, s.type]));
  return insights.map((i, n) => {
    const kind: Evidence["kind"] = i.kind === "moment" ? "moment" : i.kind === "market" ? "market" : "data";
    return {
      id: `${kind === "moment" ? "M" : kind === "market" ? "S" : "D"}${n + 1}`,
      insightId: i.id,
      kind,
      signalType: i.key.startsWith("signal:") ? types.get(i.key.slice("signal:".length)) : undefined,
      value: i.value,
      text: `${i.title}${i.comparison ? `${kind === "moment" ? " (" : ". "}${i.comparison}${kind === "moment" ? ")" : ""}` : ""}`.slice(0, 240),
      source: insightSources(i).join(" + ") || "Klingit",
      ref: i.key.startsWith("signal:") || i.key.startsWith("moment:") ? i.key : i.href,
      demo: client.isDemo,
    };
  });
}

const sourceOfFact = (f: Fact): Source => (f.kind === "moment" ? "seasonal" : f.kind === "data" ? "data" : f.signalType === "COMPETITOR" ? "competitor" : "trend");

// ─── The scan ─────────────────────────────────────────────────────────────

const CHANNELS = ["Instagram", "TikTok", "Facebook", "Newsletter", "Web"];
const SKILL_FOR_FORMAT: Record<string, string> = { Carousel: "carousel_builder", Post: "ad_gen", Stories: "ad_gen", "Banner set": "ad_gen", Email: "email_copy_agent" };

const scanSchema = z.object({
  opportunities: z
    .array(
      z.object({
        title: z.string().describe("Short, in the brand's voice: 'Singles Day: self-care, not discounts'"),
        summary: z.string().describe("2–3 sentences: what it is and why it fits this brand"),
        whyNow: z.string().describe("One line for the card, using only numbers from the facts"),
        evidenceIds: z.array(z.string()).describe("1–3 fact ids (M1, D2, S3…) this rests on. Only ids from FACTS."),
        windowStart: z.string().describe("Best window start, YYYY-MM-DD, or '' for any time"),
        windowEnd: z.string().describe("Best window end, YYYY-MM-DD, or ''"),
        routes: z
          .array(
            z.object({
              name: z.string().describe("A short name: 'The gift set edit'"),
              description: z.string().describe("One or two sentences: what gets made"),
              formats: z.array(z.string()).describe("From FORMATS only"),
              channels: z.array(z.string()).describe("From CHANNELS only"),
              sampleLine: z.string().describe("One sample line in the brand's voice that follows every rule"),
            })
          )
          .min(2)
          .max(3),
      })
    )
    .max(3),
});

export type ScanResult = { created: number; error: string | null };

/**
 * Suggests up to `max` new opportunities from the client's facts. Weekly it's Klingit's work (no charge context);
 * "Ask for more" runs inside the client's withAiCharge. Recent "Not for us" reasons steer it away from repeats.
 */
export async function runOpportunityScan(clientId: string, opts: { origin: "weekly" | "ask" | "staff"; userId?: string | null; now?: Date; max?: number } = { origin: "weekly" }): Promise<ScanResult> {
  const now = opts.now ?? new Date();
  const [client, brand, facts, leadTimes, existing, dismissed, projects] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true, industry: true, brandSummary: true, isDemo: true } }),
    loadBrandForAgents(clientId),
    opportunityFacts(clientId, now),
    loadLeadTimes(),
    prisma.opportunity.findMany({ where: { clientId, createdAt: { gte: new Date(now.getTime() - 120 * DAY) } }, select: { title: true } }),
    prisma.opportunity.findMany({ where: { clientId, status: "dismissed", dismissReason: { not: null } }, orderBy: { dismissedAt: "desc" }, take: 8, select: { title: true, dismissReason: true } }),
    prisma.project.findMany({ where: { clientId, status: { in: ["BRIEFING", "ESTIMATING", "STAFFING", "IN_PRODUCTION", "AWAITING_REVIEW"] } }, select: { id: true, name: true } }),
  ]);
  if (!facts.length) return { created: 0, error: "Nothing to go on yet: no key moments ahead, no measured results and nothing in the Market feed." };
  const formats = leadTimes.map((l) => l.format);
  const r = await runAgentTask({
    agentKey: "opportunity_scan",
    clientId,
    requestedByUserId: opts.userId ?? undefined,
    system:
      "You are Klingit's strategist. Suggest what this brand should make next, each resting on the FACTS given (cite them by id). Never state a number that isn't in a fact you cite. Each opportunity gets 2–3 clearly different routes (e.g. a bigger campaign, a lighter series, a low-cost community idea). Sample lines are in the brand's voice and follow its rules.",
    prompt: [
      buildBrandContext(client, brand),
      "",
      `TODAY: ${now.toISOString().slice(0, 10)}`,
      "FACTS (id · kind · value · what · source):",
      ...facts.map((f) => `${f.id} · ${f.kind} · ${f.value} · ${f.text} · ${f.source}`),
      `FORMATS: ${formats.join(", ")}`,
      `CHANNELS: ${CHANNELS.join(", ")}`,
      projects.length ? `RUNNING PROJECTS: ${projects.map((p) => p.name).join("; ")}` : "",
      existing.length ? `ALREADY SUGGESTED (don't repeat): ${existing.map((e) => e.title).join("; ")}` : "",
      dismissed.length ? `THE CLIENT SAID NOT FOR US: ${dismissed.map((d) => `${d.title} (${d.dismissReason})`).join("; ")}` : "",
      "",
      `Suggest up to ${opts.max ?? 3} opportunities.`,
    ]
      .filter((l) => l !== "")
      .join("\n"),
    schema: scanSchema,
    summarize: (d) => `${d.opportunities.length} opportunities: ${d.opportunities.map((o) => o.title).join("; ")}`,
  });
  if (!r.ok) return { created: 0, error: "Couldn't look for opportunities right now. Try again later." };

  const byId = new Map(facts.map((f) => [f.id, f]));
  const taken = new Set(existing.map((e) => e.title.toLowerCase()));
  const parse = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T10:00:00`) : null);
  let created = 0;
  for (const o of r.data.opportunities.slice(0, opts.max ?? 3)) {
    // Evidence only from this client's facts; an opportunity without any is dropped.
    const evidence = [...new Set(o.evidenceIds)].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])).slice(0, 3);
    if (!evidence.length || taken.has(o.title.toLowerCase())) continue;
    taken.add(o.title.toLowerCase());
    let start = parse(o.windowStart);
    let end = parse(o.windowEnd) ?? start;
    const moment = evidence.find((e) => e.kind === "moment");
    if (!start && moment) {
      const m = await prisma.keyMoment.findUnique({ where: { id: moment.ref!.slice("moment:".length) } });
      if (m) [start, end] = [new Date(m.date.getTime() - 7 * DAY), m.date];
    }
    if (start && (start.getTime() < now.getTime() - DAY || start.getTime() > now.getTime() + 120 * DAY)) [start, end] = [null, null];
    const fits = projects.find((p) => o.summary.toLowerCase().includes(p.name.toLowerCase()));
    const sourceKey = moment ? `${moment.ref}:${o.title.toLowerCase().slice(0, 40)}` : `scan:${o.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
    const routes = await Promise.all(
      o.routes.slice(0, 3).map(async (route, i) => {
        const fmts = route.formats.filter((f) => formats.includes(f));
        const team = teamCreditsFor(fmts, leadTimes);
        const check = await checkCopy(clientId, route.sampleLine, { channel: route.channels[0] ?? null });
        const skill = fmts.map((f) => SKILL_FOR_FORMAT[f]).find(Boolean);
        const aiPerRun = skill ? (await prisma.agent.findUnique({ where: { key: skill }, select: { aiCreditsPerRun: true } }))?.aiCreditsPerRun : null;
        return {
          letter: "ABC"[i],
          name: route.name,
          description: route.description,
          formats: fmts,
          channels: route.channels.filter((c) => CHANNELS.includes(c)),
          // A line that broke a rule is shown fixed (the rule check's own fix), with what it caught.
          sampleLine: check.violations.length && check.fix ? check.fix : route.sampleLine,
          sampleCheck: routeCheckOf(check) as Prisma.InputJsonValue,
          teamCreditsLow: team,
          teamCreditsHigh: team != null ? Math.round(team * 1.5) : null,
          aiCredits: aiPerRun != null ? aiPerRun * 3 : null,
          sortOrder: i,
        };
      })
    );
    await prisma.opportunity
      .create({
        data: {
          clientId,
          title: o.title,
          summary: o.summary,
          whyNow: o.whyNow,
          sources: [...new Set(evidence.map(sourceOfFact))],
          kind: kindFor([...new Set(evidence.map(sourceOfFact))]),
          evidence: evidence.map((e) => ({ value: e.value, text: e.text, source: e.source, kind: e.kind, ref: e.ref ?? null, demo: e.demo ?? false })) as Prisma.InputJsonValue,
          windowStart: start,
          windowEnd: end,
          windowNote: start ? null : "Any time · sooner is better",
          fitsProjectId: fits?.id ?? null,
          fitsLabel: fits?.name ?? null,
          skillKey: routes.flatMap((x) => x.formats.map((f) => SKILL_FOR_FORMAT[f])).find(Boolean) ?? null,
          insightHref: evidence.find((e) => e.kind === "data")?.ref ?? (evidence.some((e) => e.kind === "market") ? "/insights/market" : null),
          origin: opts.origin,
          createdByUserId: opts.userId ?? null,
          sourceKey,
          isDemo: client.isDemo,
          routes: { create: routes },
          // Phase W: built from these insights (the ones it cited).
          insights: { create: evidence.map((e, i) => ({ insightId: e.insightId, sortOrder: i })) },
        },
      })
      .then(() => created++)
      .catch(() => null); // the same source already suggested: skip
  }
  return { created, error: null };
}

export const routeCheckOf = (c: CopyCheck): RouteCheck => ({ ok: c.violations.length === 0, violations: c.violations.map((v) => ({ rule: v.rule, words: v.offending })) });

/** One more route on an existing opportunity ("Ask for another route", the client's AI credits). */
export async function addAnotherRoute(clientId: string, opportunityId: string, userId?: string | null) {
  const o = await loadOpportunity(clientId, opportunityId);
  if (!o) return { error: "Not found." };
  if (o.routes.length >= 5) return { error: "That's plenty of routes. Pick one, or brief Klingit." };
  const [brand, leadTimes, client] = await Promise.all([loadBrandForAgents(clientId), loadLeadTimes(), prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true, industry: true, brandSummary: true } })]);
  const formats = leadTimes.map((l) => l.format);
  const schema = z.object({ name: z.string(), description: z.string(), formats: z.array(z.string()), channels: z.array(z.string()), sampleLine: z.string() });
  const r = await runAgentTask({
    agentKey: "opportunity_scan",
    clientId,
    requestedByUserId: userId ?? undefined,
    system: "Suggest one more, clearly different route for this opportunity. The sample line is in the brand's voice and follows its rules.",
    prompt: [buildBrandContext(client, brand), "", `OPPORTUNITY: ${o.title}. ${o.summary}`, `ROUTES SO FAR: ${o.routes.map((x) => `${x.name}: ${x.description}`).join(" | ")}`, `FORMATS: ${formats.join(", ")}`, `CHANNELS: ${CHANNELS.join(", ")}`].join("\n"),
    schema,
    summarize: (d) => `Another route: ${d.name}`,
  });
  if (!r.ok) return { error: "Couldn't come up with another route right now." };
  const fmts = r.data.formats.filter((f) => formats.includes(f));
  const team = teamCreditsFor(fmts, leadTimes);
  const check = await checkCopy(clientId, r.data.sampleLine, { channel: r.data.channels[0] ?? null });
  await prisma.opportunityRoute.create({
    data: {
      opportunityId: o.id,
      letter: "ABCDE"[o.routes.length],
      name: r.data.name,
      description: r.data.description,
      formats: fmts,
      channels: r.data.channels.filter((c) => CHANNELS.includes(c)),
      sampleLine: check.violations.length && check.fix ? check.fix : r.data.sampleLine,
      sampleCheck: routeCheckOf(check) as Prisma.InputJsonValue,
      teamCreditsLow: team,
      teamCreditsHigh: team != null ? Math.round(team * 1.5) : null,
      sortOrder: o.routes.length,
    },
  });
  return { error: null };
}

/** Weekly, per client: one scan when the last one is a week old. Klingit's work (no client credits). */
export async function runWeeklyOpportunityScans(clientIds: string[], now = new Date()) {
  const done: string[] = [];
  for (const clientId of clientIds) {
    const recent = await prisma.agentRun.findFirst({ where: { clientId, agent: { key: "opportunity_scan" }, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } }, select: { id: true } });
    if (recent) continue;
    const r = await runOpportunityScan(clientId, { origin: "weekly", now }).catch((e: unknown) => ({ created: 0, error: e instanceof Error ? e.message : "failed" }));
    done.push(`${clientId}: ${r.error ?? `${r.created} new`}`);
    // Phase V: the opportunity built from several sources, computed in code (nothing below the minimums).
    const c = await import("@/lib/combined").then((m) => m.upsertCombinedOpportunity(clientId, now)).catch(() => null);
    if (c && "id" in c) done.push(`${clientId}: combined`);
  }
  return done;
}
