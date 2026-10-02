import { prisma } from "@/lib/prisma";
import { postProjectEvent } from "@/lib/project-events";
import { logDecision } from "@/lib/decision-log";
import type { PlanTier, ProjectStatus } from "@/generated/prisma";

/**
 * Active slots: each plan works on a set number of a client's projects at once. A project holds a slot from
 * activation (its estimate approved and a slot free) until sign-off; the rest wait in the client's queue, in
 * queuePosition order. Activation is automatic.
 */

/** Placeholders until an Admin sets them in Settings (Plan rows override these). */
export const DEFAULT_ACTIVE_SLOTS: Record<PlanTier, number> = { STARTER: 1, GROWTH: 2, SCALE: 3, ENTERPRISE: 5 };

/** Statuses after sign-off (or before sending) never hold a slot. */
const NOT_HOLDING: ProjectStatus[] = ["DRAFT", "DELIVERED", "ARCHIVED"];

/** Holding a slot: activated and not yet signed off (a paused project keeps its slot). */
export function holdsSlot(p: { activatedAt: Date | null; status: ProjectStatus }) {
  return Boolean(p.activatedAt) && !NOT_HOLDING.includes(p.status);
}

export async function activeSlotsFor(tier: PlanTier) {
  const plan = await prisma.plan.findUnique({ where: { tier } });
  return plan?.activeSlots ?? DEFAULT_ACTIVE_SLOTS[tier];
}

export async function slotUsage(clientId: string) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { planTier: true } });
  const [total, used] = await Promise.all([
    activeSlotsFor(client.planTier),
    prisma.project.count({ where: { clientId, activatedAt: { not: null }, status: { notIn: NOT_HOLDING } } }),
  ]);
  return { total, used, free: Math.max(0, total - used) };
}

/** Puts a just-sent project at the back of its client's queue. */
export async function enqueue(projectId: string, clientId: string) {
  const last = await prisma.project.aggregate({ where: { clientId, activatedAt: null, queuePosition: { not: null } }, _max: { queuePosition: true } });
  await prisma.project.update({ where: { id: projectId }, data: { queuePosition: (last._max.queuePosition ?? 0) + 1 } });
}

/** The client's queue: sent, not yet active, in priority order. */
export function queuedProjects(clientId: string) {
  return prisma.project.findMany({
    where: { clientId, activatedAt: null, status: { notIn: [...NOT_HOLDING, "PAUSED"] } },
    orderBy: [{ queuePosition: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: { id: true, name: true, queuePosition: true, status: true, estimate: { select: { status: true } } },
  });
}

/**
 * Reorders the queue: the given ids (the client's drag) take the queue places those same projects held, so
 * projects the viewer can't see (confidential) keep their spots.
 */
export async function reorderQueue(clientId: string, orderedIds: string[]) {
  const order = (await queuedProjects(clientId)).map((q) => q.id);
  const wanted = orderedIds.filter((id, i) => order.includes(id) && orderedIds.indexOf(id) === i);
  const slots = order.map((id, i) => (wanted.includes(id) ? i : -1)).filter((i) => i >= 0);
  slots.forEach((slot, k) => (order[slot] = wanted[k]));
  await prisma.$transaction(order.map((id, i) => prisma.project.update({ where: { id }, data: { queuePosition: i + 1 } })));
  return order;
}

/** Eligible to activate: the estimate is approved and nothing else holds it back. */
const eligible = (p: { status: ProjectStatus; estimate: { status: string } | null }) => p.estimate?.status === "APPROVED" && (p.status === "ESTIMATING" || p.status === "STAFFING");

/**
 * Fills free slots from the front of the queue. Each activation is a conditional update, so two calls racing
 * can't activate the same project twice. Returns the ids activated; the caller runs autopilot (staffing) on them.
 */
export async function activateQueued(clientId: string, now = new Date()) {
  const activated: string[] = [];
  let { free } = await slotUsage(clientId);
  if (free === 0) return activated;
  for (const p of await queuedProjects(clientId)) {
    if (free === 0) break;
    if (!eligible(p)) continue;
    const moved = await prisma.project.updateMany({ where: { id: p.id, activatedAt: null }, data: { activatedAt: now, queuePosition: null, status: "STAFFING" } });
    if (moved.count === 0) continue;
    free--;
    activated.push(p.id);
    await prisma.pipelineStage.updateMany({ where: { projectId: p.id, name: "STAFFING" }, data: { status: "ACTIVE", startedAt: now } });
    await logDecision({ projectId: p.id, actorUserId: null, area: "autopilot", action: "Moved to Active", reason: "Estimate approved and an active slot was free" });
    await postProjectEvent(p.id, "Active: Klingit is starting work");
    await notifyActivated(clientId, p.id, p.name);
  }
  // Positions close up behind whatever left the queue.
  const rest = await queuedProjects(clientId);
  if (activated.length && rest.length) await prisma.$transaction(rest.map((q, i) => prisma.project.update({ where: { id: q.id }, data: { queuePosition: i + 1 } })));
  return activated;
}

async function notifyActivated(clientId: string, projectId: string, name: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { createdBy: { select: { userId: true } }, members: { select: { clientUser: { select: { userId: true } } } } } });
  const owners = await prisma.clientUser.findMany({ where: { clientId, permission: "OWNER" }, select: { userId: true } });
  const userIds = new Set([project?.createdBy?.userId, ...(project?.members.map((m) => m.clientUser.userId) ?? []), ...owners.map((o) => o.userId)].filter((x): x is string => Boolean(x)));
  if (userIds.size === 0) return;
  await prisma.notification.createMany({
    data: [...userIds].map((userId) => ({
      userId,
      clientId,
      projectId,
      type: "SYSTEM" as const,
      title: `${name} is now active`,
      body: "It has an active slot, so Klingit has started on it. Your team gets picked next.",
      actionUrl: `/projects/${projectId}`,
      actionLabel: "Open project",
    })),
  });
}
