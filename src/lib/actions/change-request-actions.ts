"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";

export async function submitChangeRequestAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId } });
  if (!project) return;

  await prisma.changeRequest.create({ data: { projectId, description } });

  const client = await prisma.client.findUnique({ where: { id: viewer.clientId }, include: { accountLead: true } });
  if (client?.accountLead) {
    await prisma.notification.create({
      data: {
        userId: client.accountLead.userId,
        clientId: viewer.clientId,
        projectId,
        type: "SYSTEM",
        title: "New change request",
        body: `${viewer.user.name} requested additional scope on "${project.name}": ${description}`,
      },
    });
  }

  revalidatePath(`/projects/${projectId}`, "layout");
}
