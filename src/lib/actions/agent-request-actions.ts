"use server";

import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";

export async function requestAgentBuildAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const name = String(formData.get("name") ?? "");

  const client = await prisma.client.findUnique({ where: { id: viewer.clientId }, include: { accountLead: true } });
  if (!client?.accountLead) return;

  await prisma.notification.create({
    data: {
      userId: client.accountLead.userId,
      clientId: viewer.clientId,
      type: "SYSTEM",
      title: "Build request",
      body: `${viewer.user.name} at ${client.name} requested a build: "${name}".`,
    },
  });
}
