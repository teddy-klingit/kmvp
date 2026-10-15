import { prisma } from "@/lib/prisma";
import { logDecision } from "@/lib/decision-log";

/**
 * "This brief exists twice": when the PM sends the estimate on one copy, the other copies are archived (never
 * deleted), with their plan items, and the merge is logged on both projects.
 */
export async function mergeDuplicateBriefs(actorUserId: string, keepId: string, copyIds: string[]) {
  const keep = await prisma.project.findUnique({ where: { id: keepId }, select: { id: true, clientId: true, name: true } });
  if (!keep) return 0;
  const copies = await prisma.project.findMany({ where: { id: { in: copyIds }, clientId: keep.clientId, status: { not: "ARCHIVED" } }, select: { id: true, name: true, status: true, createdAt: true } });
  for (const c of copies) {
    await prisma.project.update({ where: { id: c.id }, data: { status: "ARCHIVED" } });
    await prisma.clientCalendarItem.updateMany({ where: { projectId: c.id, archivedAt: null }, data: { archivedAt: new Date() } });
    await logDecision({ projectId: c.id, actorUserId, area: "brief", action: `Merged into “${keep.name}” (a duplicate brief)`, before: { status: c.status }, after: { status: "ARCHIVED", mergedInto: keep.id } });
    await logDecision({ projectId: keep.id, actorUserId, area: "brief", action: `Merged a duplicate brief from ${c.createdAt.toISOString().slice(0, 16).replace("T", " ")}`, after: { archived: c.id } });
  }
  return copies.length;
}
