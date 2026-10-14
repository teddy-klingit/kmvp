"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";
import { notifyMany } from "@/lib/notifier";

/**
 * Ops → Plan → Nudge client (Phase S, S7.5): the reminder is drafted on the page and only sent when the PM presses
 * Send, to the person who planned the item (else the client's admins), with a link to it on their plan.
 */
export async function sendNudgeAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const item = await prisma.clientCalendarItem.findUnique({ where: { id: String(formData.get("itemId") ?? "") } });
  const text = String(formData.get("text") ?? "").trim();
  if (!item || !text) return;
  const to = item.createdByUserId ? [item.createdByUserId] : (await prisma.clientUser.findMany({ where: { clientId: item.clientId, permission: "OWNER" }, select: { userId: true } })).map((u) => u.userId);
  await notifyMany(to.map((userId) => ({ userId, clientId: item.clientId, type: "SYSTEM" as const, title: `Brief needed: ${item.title}`, body: text.slice(0, 500), actionUrl: `/plan?item=${item.id}`, actionLabel: "Start brief" })));
  await prisma.auditLog.create({ data: { clientId: item.clientId, actorUserId: viewer.userId, area: "plan", action: `nudged about “${item.title}”`, after: { text } } });
  revalidatePath("/ops/plan");
  redirect(`/ops/plan?sent=${item.id}`);
}
