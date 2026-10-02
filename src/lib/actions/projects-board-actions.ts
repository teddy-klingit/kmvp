"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { sendBrief } from "@/lib/brief-studio/studio";
import { reorderQueue } from "@/lib/active-slots";
import { runAutopilot } from "@/lib/autopilot-runner";

/** Projects board drags: only the two moves board-rules.ts allows; everything else is Klingit's. */

/** A draft dropped on Queued: the same send as the Brief studio's button (the board asks first under 50). */
export async function sendBriefFromBoardAction(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getPortalViewer();
  const sent = await sendBrief(viewer, projectId);
  if (!sent) return { ok: false, error: "That brief was already sent." };
  try {
    after(() => runAutopilot(projectId).catch(() => undefined));
  } catch {
    // Outside a request (tests): autopilot runs on the next page load.
  }
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Reordering Queued: the client's priority. Only their own visible, queued projects move. */
export async function reorderQueueAction(orderedIds: string[]): Promise<{ ok: boolean }> {
  const viewer = await getPortalViewer();
  const visible = await prisma.project.findMany({ where: { id: { in: orderedIds.slice(0, 100) }, clientId: viewer.clientId, ...projectVisibilityWhere(viewer.id) }, select: { id: true } });
  const ok = new Set(visible.map((p) => p.id));
  await reorderQueue(viewer.clientId, orderedIds.filter((id) => ok.has(id)));
  revalidatePath("/projects");
  return { ok: true };
}
