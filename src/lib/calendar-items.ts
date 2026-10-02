import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { loadProjectStates } from "@/lib/project-state-loader";
import type { ContentPost } from "@/generated/prisma";

/**
 * Everything on the client calendar (Calendar.dc.html), from real data only:
 * - klingit (ink): project due dates, first-draft ETAs, deliveries;
 * - plan (pink): the content plan's posts (planned and published) and the client's own items;
 * - suggested (dashed lime): the agent's pending plan suggestions on their proposed day, and inspiration
 *   ideas on their start-by day. Suggestions without a proposed day are not placed on the grid.
 */
export type CalendarKind = "klingit" | "plan" | "suggested";

export type CalendarItem = {
  id: string;
  kind: CalendarKind;
  date: Date;
  title: string;
  /** Second line in the list view. */
  sub: string;
  href?: string;
  post?: ContentPost;
};

const DAY = 86400000;

/** Monday-first 6×7 grid around a month: [first cell, day after the last cell). */
export function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const cells = Math.ceil((offset + last.getDate()) / 7) * 7;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + cells);
  return { start, end, cells };
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export async function loadCalendarItems(clientId: string, viewerId: string, from: Date, to: Date) {
  const inRange = { gte: from, lt: to };
  const [states, posts, ownItems, suggestions, inspirations] = await Promise.all([
    loadProjectStates({ status: { not: "ARCHIVED" }, ...projectVisibilityWhere(viewerId) }, clientId),
    prisma.contentPost.findMany({
      where: { clientId, OR: [{ status: "PLANNED", scheduledDate: inRange }, { status: "PUBLISHED", publishedDate: inRange }] },
      orderBy: { scheduledDate: "asc" },
    }),
    prisma.clientCalendarItem.findMany({ where: { clientId, date: inRange }, orderBy: { date: "asc" } }),
    prisma.contentPlanSuggestion.findMany({ where: { clientId, status: "PENDING", proposedDate: inRange } }),
    prisma.inspiration.findMany({ where: { clientId, targetDate: { not: null } } }),
  ]);

  const items: CalendarItem[] = [];
  const within = (d: Date | null | undefined): d is Date => Boolean(d && d >= from && d < to);

  for (const { project, state } of states) {
    if (state.draft) continue;
    const href = `/projects/${project.id}`;
    if (state.stage !== "closed" && within(state.keyFacts.dueDate)) items.push({ id: `due-${project.id}`, kind: "klingit", date: state.keyFacts.dueDate, title: `${project.name} due`, sub: "Due date", href });
    if ((state.stage === "staffing" || state.stage === "production") && within(state.keyFacts.firstDraftEta))
      items.push({ id: `draft-${project.id}`, kind: "klingit", date: state.keyFacts.firstDraftEta, title: `First draft · ${project.name}`, sub: "Klingit is producing it", href });
    if (state.stage === "closed" && within(project.deliveredAt)) items.push({ id: `delivered-${project.id}`, kind: "klingit", date: project.deliveredAt, title: `${project.name} delivered`, sub: "Delivered", href });
  }

  for (const p of posts) {
    const date = p.status === "PUBLISHED" ? p.publishedDate : p.scheduledDate;
    if (!date) continue;
    items.push({ id: `post-${p.id}`, kind: "plan", date, title: p.title, sub: `${p.platform}${p.contentType ? ` · ${p.contentType}` : ""} · ${p.status === "PUBLISHED" ? "published" : "planned"}`, post: p });
  }
  for (const i of ownItems) items.push({ id: `own-${i.id}`, kind: "plan", date: i.date, title: i.title, sub: `Your plan${i.channel ? ` · ${i.channel}` : ""}` });

  for (const s of suggestions) if (s.proposedDate) items.push({ id: `sug-${s.id}`, kind: "suggested", date: s.proposedDate, title: s.title, sub: s.reason ? `Suggested · ${s.reason}` : "Suggested by the agent", href: "#suggested" });
  for (const idea of inspirations) {
    const startBy = new Date(idea.targetDate!.getTime() - idea.leadTimeDays * DAY);
    if (within(startBy)) items.push({ id: `idea-${idea.id}`, kind: "suggested", date: startBy, title: `Start: ${idea.title}`, sub: "Brief now to be ready in time", href: "#suggested" });
  }

  return items.sort((a, b) => a.date.getTime() - b.date.getTime() || a.kind.localeCompare(b.kind));
}

/** "Planned this month" for plan coverage: the content plan's posts (planned + published) in that month. */
export async function plannedPostsInMonth(clientId: string, month: Date) {
  const from = new Date(month.getFullYear(), month.getMonth(), 1);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  return prisma.contentPost.count({
    where: { clientId, OR: [{ status: "PLANNED", scheduledDate: { gte: from, lt: to } }, { status: "PUBLISHED", publishedDate: { gte: from, lt: to } }] },
  });
}
