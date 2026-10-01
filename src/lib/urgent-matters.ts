import type { Notification } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { attentionBucket, endOfDay, formatDay, type ProjectState } from "@/lib/project-state";

const STALE_SUGGESTION_DAYS = 5;

export type AttentionItem = {
  id: string;
  kind: "project" | "notification" | "suggestion" | "escalation";
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  at: Date;
};

type ProjectInput = { project: { id: string; name: string }; state: ProjectState };

export type AttentionSources = {
  projects: ProjectInput[];
  notifications: Pick<Notification, "id" | "type" | "title" | "body" | "actionUrl" | "actionLabel" | "projectId" | "createdAt">[];
  suggestions: { id: string; title: string; createdAt: Date }[];
  escalations: { id: string; platform: string; snippet: string; createdAt: Date }[];
};

/** Klingit-side problems the client should know about right away. */
const URGENT_NOTIFICATION_TYPES = new Set(["SLA_BREACH", "AGENT_FAILURE"]);

function deadlineText(state: ProjectState, now: Date) {
  const due = state.nextAction.dueAt ?? state.keyFacts.dueDate;
  if (!due) return "";
  if (endOfDay(due).getTime() < now.getTime()) return ` · overdue since ${formatDay(due)}`;
  if (due.toDateString() === now.toDateString()) return " · due today";
  return ` · due ${formatDay(due)}`;
}

/**
 * Splits everything waiting on the client into "Urgent matters" and "Needs
 * your input" — each item lands in exactly one list. Project items come only
 * from getProjectState (never from notification rows, which nothing marks as
 * read), so an approved estimate can't linger on the dashboard.
 */
export function partitionAttention(sources: AttentionSources, now: Date = new Date()) {
  const urgent: AttentionItem[] = [];
  const needsInput: AttentionItem[] = [];
  const staleBefore = now.getTime() - STALE_SUGGESTION_DAYS * 86400000;
  const daysAgo = (d: Date) => Math.max(1, Math.floor((now.getTime() - d.getTime()) / 86400000));

  for (const { project, state } of sources.projects) {
    const bucket = attentionBucket(state);
    if (!bucket) continue;
    const item: AttentionItem = {
      id: `p-${project.id}`,
      kind: "project",
      title: project.name,
      detail: `${state.nextAction.label}${deadlineText(state, now)}`,
      href: state.nextAction.href,
      actionLabel: state.nextAction.cta ?? "Open",
      at: state.nextAction.dueAt ?? state.keyFacts.dueDate ?? now,
    };
    (bucket === "urgent" ? urgent : needsInput).push(item);
  }

  for (const n of sources.notifications) {
    // Project-linked notifications are covered by the project's own state above.
    if (n.projectId) continue;
    const item: AttentionItem = {
      id: `n-${n.id}`,
      kind: "notification",
      title: n.title,
      detail: n.body,
      href: n.actionUrl ?? "/notifications",
      actionLabel: n.actionLabel ?? "View",
      at: n.createdAt,
    };
    (URGENT_NOTIFICATION_TYPES.has(n.type) ? urgent : needsInput).push(item);
  }

  for (const s of sources.suggestions) {
    const stale = s.createdAt.getTime() <= staleBefore;
    (stale ? urgent : needsInput).push({
      id: `s-${s.id}`,
      kind: "suggestion",
      title: stale ? `Pending ${daysAgo(s.createdAt)} days — ${s.title}` : s.title,
      detail: stale
        ? "Content plan suggestion has been waiting for a decision well past a normal review window."
        : "Plan suggestion — approve or reject",
      href: "/calendar#plan-suggestions",
      actionLabel: "Review",
      at: s.createdAt,
    });
  }

  for (const e of sources.escalations) {
    urgent.push({
      id: `e-${e.id}`,
      kind: "escalation",
      title: `Negative comment on ${e.platform} — no response yet`,
      detail: e.snippet,
      href: "/insights/community",
      actionLabel: "Respond",
      at: e.createdAt,
    });
  }

  const byTime = (a: AttentionItem, b: AttentionItem) => a.at.getTime() - b.at.getTime();
  return { urgent: urgent.sort(byTime), needsInput: needsInput.sort(byTime) };
}

export async function loadAttentionSources(clientId: string, userId: string, projects: ProjectInput[]): Promise<AttentionSources> {
  const [notifications, suggestions, escalations] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, read: false, archivedAt: null, OR: [{ clientId }, { clientId: null }] },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.contentPlanSuggestion.findMany({ where: { clientId, status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.communityEscalation.findMany({
      where: { clientId, status: "OPEN", sentiment: "NEGATIVE" },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { projects, notifications, suggestions, escalations };
}
