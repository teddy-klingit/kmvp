import { randomBytes } from "node:crypto";
import type { ClientCalendarItem, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { notify } from "@/lib/notifier";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { loadProjectStates } from "@/lib/project-state-loader";
import { briefByFor, daysUntil } from "@/lib/plan-dates";

export { addWorkingDays, briefByFor, daysUntil, subtractWorkingDays, teamCreditsFor } from "@/lib/plan-dates";

/**
 * Plan (Phase R step 3, designs 04–05): what the client makes and when. Every plan item has an owner — the client
 * ("You make it"), Klingit's help ("Klingit helps": a brief-by date and reminders) or a Klingit project — and a
 * status. Read and written only here (and plan-actions.ts).
 */

export type Maker = "client" | "klingit_help" | "klingit_project";
export const MAKERS: { maker: Maker; label: string; short: string }[] = [
  { maker: "client", label: "You make it", short: "You make it" },
  { maker: "klingit_help", label: "Klingit's help needed", short: "Klingit helps" },
  { maker: "klingit_project", label: "Already a Klingit project", short: "Klingit projects" },
];
export const STATUSES = ["idea", "planned", "briefed", "in_production", "ready", "published"] as const;
export type PlanStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<PlanStatus, string> = { idea: "Idea", planned: "Planned", briefed: "Briefed", in_production: "In production", ready: "Ready", published: "Published" };
export const PLAN_CHANNELS = ["Instagram", "TikTok", "Facebook", "LinkedIn", "Newsletter", "Web"] as const;

const DAY = 86400000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// ─── Brief-by ─────────────────────────────────────────────────────────────

/**
 * Plan's lead times per format. When a format points at a Price List item that has a lead time, the item's wins
 * (Phase S: brief-by uses the Price List); otherwise the per-format table's working days are the fallback.
 */
export async function loadLeadTimes() {
  const [rows, items] = await Promise.all([prisma.planLeadTime.findMany({ orderBy: { sortOrder: "asc" } }), prisma.priceListItem.findMany({ where: { archivedAt: null, sourceKey: { not: null }, leadTimeDays: { not: null } }, select: { sourceKey: true, leadTimeDays: true } })]);
  const lead = new Map(items.map((i) => [i.sourceKey, i.leadTimeDays!]));
  return rows.map((r) => ({ ...r, workingDays: (r.priceListKey ? lead.get(r.priceListKey) : undefined) ?? r.workingDays, fromPriceList: Boolean(r.priceListKey && lead.has(r.priceListKey)) }));
}

// ─── Add, move, change ────────────────────────────────────────────────────

export type PlanInput = { title: string; date: Date; endDate?: Date | null; channels: string[]; formats: string[]; maker: Maker; notes?: string | null; projectId?: string | null; opportunityId?: string | null; route?: string | null; status?: PlanStatus };

/**
 * Adds a plan item. Idempotent: the dialog sends one request key per open, so a double click (or a retry) returns
 * the item the first click made instead of a second one.
 */
export async function addPlanItem(clientId: string, userId: string, input: PlanInput, requestKey: string) {
  const existing = await prisma.clientCalendarItem.findUnique({ where: { clientId_requestKey: { clientId, requestKey } } });
  if (existing) return { item: existing, created: false };
  const leadTimes = await loadLeadTimes();
  const data = {
    clientId,
    title: input.title.trim().slice(0, 140),
    date: input.date,
    endDate: input.endDate && input.endDate > input.date ? input.endDate : null,
    channel: input.channels[0] ?? "Other",
    channels: input.channels,
    formats: input.formats,
    maker: input.maker,
    status: input.status ?? (input.maker === "klingit_project" ? "briefed" : "planned"),
    briefBy: input.maker === "klingit_help" ? briefByFor(input.date, input.formats, leadTimes).briefBy : null,
    notes: input.notes?.trim() || null,
    projectId: input.projectId ?? null,
    opportunityId: input.opportunityId ?? null,
    route: input.route ?? null,
    createdByUserId: userId,
    requestKey,
  };
  try {
    return { item: await prisma.clientCalendarItem.create({ data }), created: true };
  } catch (e) {
    // Two clicks in the same instant: the unique key lets one through; the other gets that one.
    const again = await prisma.clientCalendarItem.findUnique({ where: { clientId_requestKey: { clientId, requestKey } } });
    if (again) return { item: again, created: false };
    throw e;
  }
}

/** Drag to reschedule: a new live date (a range keeps its length) and, when Klingit helps, a new brief-by. */
export async function movePlanItem(clientId: string, id: string, date: Date) {
  const item = await prisma.clientCalendarItem.findFirst({ where: { id, clientId, archivedAt: null } });
  if (!item) return null;
  const length = item.endDate ? item.endDate.getTime() - item.date.getTime() : null;
  const leadTimes = await loadLeadTimes();
  return prisma.clientCalendarItem.update({
    where: { id },
    data: { date, endDate: length != null ? new Date(date.getTime() + length) : null, briefBy: item.maker === "klingit_help" ? briefByFor(date, jsonArray<string>(item.formats), leadTimes).briefBy : item.briefBy, reminded: undefined },
  });
}

// ─── Status from a linked project ─────────────────────────────────────────

/** A Klingit item's status follows its project; a client's own item keeps its own. */
export function statusFromProject(projectStatus: string | null | undefined, live: Date, now = new Date()): PlanStatus {
  switch (projectStatus) {
    case "DRAFT":
      return "planned";
    case "BRIEFING":
    case "ESTIMATING":
    case "STAFFING":
      return "briefed";
    case "IN_PRODUCTION":
    case "QA":
    case "PAUSED":
      return "in_production";
    case "AWAITING_REVIEW":
    case "IN_FEEDBACK":
      return "ready";
    case "DELIVERED":
      return live <= now ? "published" : "ready";
    default:
      return "planned";
  }
}

// ─── The calendar ─────────────────────────────────────────────────────────

export type PlanEntry = {
  id: string;
  kind: "item" | "project" | "post";
  itemId: string | null;
  title: string;
  date: Date;
  endDate: Date | null;
  maker: Maker;
  status: PlanStatus;
  channels: string[];
  formats: string[];
  briefBy: Date | null;
  href: string | null;
  notes: string | null;
  draggable: boolean;
};
export type KeyMomentEntry = { id: string; date: Date; name: string; markets: string[]; kind: string };
export type GapWarning = { weekStart: Date; week: number; channel: string; planned: number; agreed: number };

/** ISO week number. */
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y.getTime()) / DAY + 1) / 7);
}
/** Monday of `d`'s week. */
export const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

/** The agreement's channels as the plan names them (ContentPlanTarget.platform → plan channel). */
const channelOf = (platform: string) => (/^(meta|facebook)$/i.test(platform) ? "Facebook" : /instagram/i.test(platform) ? "Instagram" : /newsletter|email/i.test(platform) ? "Newsletter" : platform);

export async function loadPlan(clientId: string, viewer: { id: string }, from: Date, to: Date, now = new Date()) {
  const [items, states, posts, moments, targets] = await Promise.all([
    prisma.clientCalendarItem.findMany({ where: { clientId, archivedAt: null, OR: [{ date: { gte: from, lt: to } }, { endDate: { gte: from }, date: { lt: to } }, { briefBy: { gte: from, lt: to } }] }, orderBy: { date: "asc" } }),
    loadProjectStates({ status: { not: "ARCHIVED" }, agentBuild: false, ...projectVisibilityWhere(viewer.id) }, clientId),
    prisma.contentPost.findMany({ where: { clientId, OR: [{ status: "PLANNED", scheduledDate: { gte: from, lt: to } }, { status: "PUBLISHED", publishedDate: { gte: from, lt: to } }] } }),
    prisma.keyMoment.findMany({ where: { date: { gte: from, lt: to } }, orderBy: { date: "asc" } }),
    prisma.contentPlanTarget.findMany({ where: { clientId } }),
  ]);
  const projectStatus = new Map(states.map(({ project }) => [project.id, project.status as string]));
  const linked = new Set(items.flatMap((i) => (i.projectId ? [i.projectId] : [])));

  const entries: PlanEntry[] = items.map((i) => ({
    id: `item-${i.id}`,
    kind: "item",
    itemId: i.id,
    title: i.title,
    date: i.date,
    endDate: i.endDate,
    maker: i.maker as Maker,
    status: i.projectId ? statusFromProject(projectStatus.get(i.projectId), i.date, now) : (i.status as PlanStatus),
    channels: jsonArray<string>(i.channels).length ? jsonArray<string>(i.channels) : [i.channel],
    formats: jsonArray<string>(i.formats),
    briefBy: i.briefBy,
    href: i.projectId ? `/projects/${i.projectId}` : null,
    notes: i.notes,
    draggable: !i.projectId,
  }));
  // Klingit's projects on the calendar: first drafts and due dates, unless a plan item already stands for them.
  for (const { project, state } of states) {
    if (state.draft || linked.has(project.id) || state.stage === "closed") continue;
    const at = state.keyFacts.firstDraftEta && (state.stage === "staffing" || state.stage === "production") ? { d: state.keyFacts.firstDraftEta, t: `${project.name} · draft` } : state.keyFacts.dueDate ? { d: state.keyFacts.dueDate, t: project.name } : null;
    if (at && at.d >= from && at.d < to) entries.push({ id: `project-${project.id}`, kind: "project", itemId: null, title: at.t, date: at.d, endDate: null, maker: "klingit_project", status: statusFromProject(project.status, at.d, now), channels: [], formats: [], briefBy: null, href: `/projects/${project.id}`, notes: null, draggable: false });
  }
  // The client's own posts from the content plan.
  for (const p of posts) {
    const d = p.status === "PUBLISHED" ? p.publishedDate : p.scheduledDate;
    if (d) entries.push({ id: `post-${p.id}`, kind: "post", itemId: null, title: p.title, date: d, endDate: null, maker: "client", status: p.status === "PUBLISHED" ? "published" : "planned", channels: [channelOf(p.platform)], formats: p.contentType ? [p.contentType] : [], briefBy: null, href: null, notes: null, draggable: false });
  }
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Gap warnings: a week (from this one on, unless it's nearly over) where a channel has fewer posts planned than the agreement.
  const gaps: GapWarning[] = [];
  for (let w = mondayOf(from); w < to; w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)) {
    const end = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7);
    if (end.getTime() - dayStart(now).getTime() <= 2 * DAY) continue; // the week is (nearly) over
    for (const t of targets.filter((x) => x.weeklyVolume > 0)) {
      const channel = channelOf(t.platform);
      // A campaign running across the week counts for every week it runs.
      const planned = entries.filter((e) => e.date < end && (e.endDate ?? e.date) >= w && e.channels.includes(channel)).length;
      if (planned < t.weeklyVolume) gaps.push({ weekStart: w, week: isoWeek(w), channel, planned, agreed: t.weeklyVolume });
    }
  }
  return { entries, moments: moments.map((m) => ({ id: m.id, date: m.date, name: m.name, markets: jsonArray<string>(m.markets), kind: m.kind })), gaps, targets: targets.map((t) => ({ channel: channelOf(t.platform), weekly: t.weeklyVolume })) };
}

/** Coverage this month per channel: planned (and published) vs the agreement (posts a week × weeks in the month). */
export async function coverageThisMonth(clientId: string, viewer: { id: string }, now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const { entries, targets } = await loadPlan(clientId, viewer, from, to, now);
  const weeks = (to.getTime() - from.getTime()) / DAY / 7;
  return targets
    .filter((t) => t.weekly > 0)
    .map((t) => ({ channel: t.channel, planned: entries.filter((e) => e.kind !== "project" && e.channels.includes(t.channel) && e.date >= from && e.date < to).length, agreed: Math.round(t.weekly * weeks) }));
}

// ─── Needs a brief ────────────────────────────────────────────────────────

/** Items Klingit helps with that still need a brief, soonest brief-by first. */
export async function needsBrief(clientId: string, within = 21, now = new Date()) {
  const items = await prisma.clientCalendarItem.findMany({ where: { clientId, archivedAt: null, maker: "klingit_help", projectId: null, briefBy: { not: null, lt: new Date(now.getTime() + within * DAY) } }, orderBy: { briefBy: "asc" } });
  return items.map((i) => ({ item: i, daysLeft: daysUntil(i.briefBy!, now), late: daysUntil(i.briefBy!, now) < 0 }));
}

/** What Home's Needs you shows for the plan: a brief due within 7 days (or late). */
export async function planNeedsYou(clientId: string, now = new Date()) {
  return (await needsBrief(clientId, 8, now)).filter((n) => n.daysLeft <= 7);
}

/** Home's Needs you rows for the plan (same shape as yourTurn's): "Brief: Halloween glow reel · Brief by Fri 16 Oct". */
export async function planTurns(clientId: string, now = new Date()) {
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
  return (await planNeedsYou(clientId, now)).map(({ item, daysLeft, late }) => ({
    id: `plan-${item.id}`,
    kind: "brief" as const,
    title: late ? `Late: brief ${item.title}` : `Brief: ${item.title}`,
    due: { label: late ? "Overdue" : daysLeft === 0 ? "Due today" : `By ${fmt(item.briefBy!)}`, tone: (late || daysLeft === 0 ? "danger" : "neutral") as "danger" | "neutral" },
    context: `Plan · live ${fmt(item.date)} · Klingit helps`,
    projectName: item.title,
    detail: "Klingit needs the brief",
    href: `/plan?item=${item.id}`,
    cta: "Start brief",
    dueAt: item.briefBy,
  }));
}

/** Start brief: the brief assistant gets everything the plan already knows, so it doesn't ask again. */
export function startBriefText(item: Pick<ClientCalendarItem, "title" | "date" | "endDate" | "channels" | "formats" | "notes" | "route">, extra: { evidence?: string[]; routeText?: string | null } = {}) {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const channels = jsonArray<string>(item.channels);
  const formats = jsonArray<string>(item.formats);
  return [
    `${item.title}: ${formats.length ? formats.join(" and ").toLowerCase() : "content"}${channels.length ? ` for ${channels.join(" and ")}` : ""}, live ${iso(item.date)}${item.endDate ? ` until ${iso(item.endDate)}` : ""}.`,
    item.notes ? `Notes: ${item.notes}` : null,
    extra.routeText ?? (item.route ? `Route: ${item.route}` : null),
    extra.evidence?.length ? `Why now: ${extra.evidence.join(" ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Reminders ────────────────────────────────────────────────────────────

const fmtDay = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);

/**
 * 7 days and 2 days before brief-by, and on the day: a notification to whoever planned it (else the client's
 * admins). Once per threshold. Run hourly by the scheduler; demo accounts are skipped there.
 */
export async function sendPlanReminders(now = new Date(), clientIds?: string[]) {
  const items = await prisma.clientCalendarItem.findMany({ where: { archivedAt: null, maker: "klingit_help", projectId: null, briefBy: { not: null, gte: new Date(now.getTime() - DAY), lt: new Date(now.getTime() + 8 * DAY) }, ...(clientIds ? { clientId: { in: clientIds } } : {}) } });
  let sent = 0;
  for (const i of items) {
    const left = daysUntil(i.briefBy!, now);
    const threshold = left <= 0 ? "0" : left <= 2 ? "2" : left <= 7 ? "7" : null;
    const reminded = (i.reminded ?? {}) as Record<string, string>;
    if (!threshold || reminded[threshold]) continue;
    const to = i.createdByUserId ? [i.createdByUserId] : (await prisma.clientUser.findMany({ where: { clientId: i.clientId, permission: "OWNER" }, select: { userId: true } })).map((u) => u.userId);
    for (const userId of to) {
      await notify({ userId, clientId: i.clientId, type: "APPROVAL_NEEDED", title: threshold === "0" ? `Brief due today: ${i.title}` : `Brief by ${fmtDay(i.briefBy!)}: ${i.title}`, body: `Klingit needs the brief for “${i.title}” (live ${fmtDay(i.date)}) by ${fmtDay(i.briefBy!)}.`, actionUrl: `/plan?item=${i.id}`, actionLabel: "Start brief" });
      sent++;
    }
    await prisma.clientCalendarItem.update({ where: { id: i.id }, data: { reminded: { ...reminded, [threshold]: now.toISOString() } as Prisma.InputJsonValue } });
  }
  return sent;
}

// ─── iCal ─────────────────────────────────────────────────────────────────

export async function feedTokenFor(userId: string, clientId: string, renew = false) {
  if (renew) await prisma.planFeedToken.updateMany({ where: { userId, clientId, revokedAt: null }, data: { revokedAt: new Date() } });
  const live = await prisma.planFeedToken.findFirst({ where: { userId, clientId, revokedAt: null } });
  return live ?? prisma.planFeedToken.create({ data: { userId, clientId, token: randomBytes(24).toString("base64url") } });
}

/** The plan as an iCal feed: plan items (all-day), brief-by dates, Klingit's project dates. */
export async function planIcs(clientId: string, viewer: { id: string }, now = new Date()) {
  const from = new Date(now.getTime() - 30 * DAY);
  const to = new Date(now.getTime() + 180 * DAY);
  const { entries } = await loadPlan(clientId, viewer, from, to, now);
  const d8 = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const events = entries.flatMap((e) => {
    const end = new Date((e.endDate ?? e.date).getTime() + DAY);
    const main = [`BEGIN:VEVENT`, `UID:${e.id}@klingit`, `DTSTAMP:${d8(now)}T000000Z`, `DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${d8(end)}`, `SUMMARY:${esc(e.title)}${e.maker === "klingit_help" ? " (Klingit helps)" : e.maker === "klingit_project" ? " (Klingit)" : ""}`, `END:VEVENT`];
    const brief = e.briefBy && e.briefBy >= from ? [`BEGIN:VEVENT`, `UID:${e.id}-brief@klingit`, `DTSTAMP:${d8(now)}T000000Z`, `DTSTART;VALUE=DATE:${d8(e.briefBy)}`, `DTEND;VALUE=DATE:${d8(new Date(e.briefBy.getTime() + DAY))}`, `SUMMARY:Brief due: ${esc(e.title)}`, `END:VEVENT`] : [];
    return [...main, ...brief];
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Klingit//Plan//EN", "X-WR-CALNAME:Klingit plan", ...events, "END:VCALENDAR"].join("\r\n");
}
