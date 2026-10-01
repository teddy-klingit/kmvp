"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { createInternalMessage } from "@/lib/internal-messages";

export async function postInternalMessageAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const body = String(formData.get("body") ?? "");
  // Access (client session, own client, visible project) is enforced inside createInternalMessage.
  const created = await createInternalMessage(projectId, body);
  if (created) revalidatePath(`/projects/${projectId}`, "layout");
}

export async function markChannelReadAction(projectId: string, channel: "KLINGIT" | "INTERNAL") {
  const viewer = await getPortalViewer();
  const project = await prisma.project.findFirst({
    where: { id: projectId, clientId: viewer.clientId, ...projectVisibilityWhere(viewer.id) },
    select: { id: true },
  });
  if (!project) return;

  await prisma.projectChannelRead.upsert({
    where: { clientUserId_projectId_channel: { clientUserId: viewer.id, projectId, channel } },
    create: { clientUserId: viewer.id, projectId, channel, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
}
