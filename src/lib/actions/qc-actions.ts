"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";
import { acceptFlag, blockingFlags, loadQcSet, sendFlagToDesigner, sendToClient } from "@/lib/qc/quality-check";

export type QcState = { error?: string; ok?: string };

function revalidate(projectId: string) {
  revalidatePath(`/ops/projects/${projectId}`, "layout");
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/ops", "layout");
}

async function flagProject(flagId: string) {
  return (await prisma.qcFlag.findUnique({ where: { id: flagId }, select: { projectId: true } }))?.projectId ?? null;
}

/** "Send to designer" on one flag. */
export async function sendFlagToDesignerAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const flagId = String(formData.get("flagId") ?? "");
  const projectId = await flagProject(flagId);
  if (!projectId) return;
  await sendFlagToDesigner(flagId, viewer.userId);
  revalidate(projectId);
}

/** "Accept as is": refused without a reason. */
export async function acceptFlagAction(_prev: QcState, formData: FormData): Promise<QcState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const flagId = String(formData.get("flagId") ?? "");
  const projectId = await flagProject(flagId);
  if (!projectId) return { error: "That flag no longer exists." };
  const r = await acceptFlag(flagId, viewer.userId, String(formData.get("reason") ?? ""));
  if ("error" in r) return { error: r.error };
  revalidate(projectId);
  return { ok: "Accepted." };
}

/** "Back to designer": every open flag on the set goes back at once. */
export async function backToDesignerAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const set = await loadQcSet(projectId);
  for (const v of set) for (const f of blockingFlags(v).filter((f) => f.status === "OPEN")) await sendFlagToDesigner(f.id, viewer.userId);
  revalidate(projectId);
}

/** "Send to client": only through the gate (every flag fixed or accepted, and not by the person who made it). */
export async function sendToClientAction(_prev: QcState, formData: FormData): Promise<QcState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const r = await sendToClient(projectId, viewer.userId);
  if ("error" in r) return { error: r.error };
  revalidate(projectId);
  return { ok: `Sent ${r.sent} to the client.` };
}
