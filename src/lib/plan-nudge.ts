import { prisma } from "@/lib/prisma";
import { notifyMany } from "@/lib/notifier";

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);

/** The reminder a PM sends when a "Klingit's help" plan item has no brief yet. Drafted for them; sent only on Send. */
export function nudgeDraft(item: { title: string; date: Date; briefBy: Date | null }) {
  return `Hi! “${item.title}” goes live ${day(item.date)}. To make it in time we need the brief by ${item.briefBy ? day(item.briefBy) : "this week"}. Start it from the Planner and I'll take it from there.`;
}

/**
 * Sends the nudge in-app to the person who planned the item (else the client's admins), with a link to it on their
 * plan, and logs it (AuditLog, area plan). Used by Plan and by Today.
 */
export async function sendNudge(actorUserId: string, itemId: string, text: string) {
  const item = await prisma.clientCalendarItem.findUnique({ where: { id: itemId } });
  const body = text.trim();
  if (!item || !body) return null;
  const to = item.createdByUserId ? [item.createdByUserId] : (await prisma.clientUser.findMany({ where: { clientId: item.clientId, permission: "OWNER" }, select: { userId: true } })).map((u) => u.userId);
  await notifyMany(to.map((userId) => ({ userId, clientId: item.clientId, type: "SYSTEM" as const, title: `Brief needed: ${item.title}`, body: body.slice(0, 500), actionUrl: `/planner?item=${item.id}`, actionLabel: "Start brief" })));
  await prisma.auditLog.create({ data: { clientId: item.clientId, actorUserId, area: "plan", action: `nudged about “${item.title}”`, after: { text: body } } });
  return item;
}
