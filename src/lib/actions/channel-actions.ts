"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";

/**
 * Simulates delivering a brief or report to a connected Slack/Teams/email
 * channel — this app has no real Slack/Teams/email API credentials, so
 * there's no outbound call to make. What's real is the log: the client can
 * see what's been shared, to which channel, and when.
 */
export async function sendToChannelAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const channelId = String(formData.get("channelId") ?? "");
  const subjectType = String(formData.get("subjectType") ?? "");
  const subjectLabel = String(formData.get("subjectLabel") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/reports");
  if (!channelId || (subjectType !== "BRIEF" && subjectType !== "REPORT") || !subjectLabel) return;

  const channel = await prisma.connectedChannel.findFirst({ where: { id: channelId, clientId: viewer.clientId } });
  if (!channel) return;

  await prisma.sentMessageLog.create({
    data: { clientId: viewer.clientId, channelId, subjectType, subjectLabel },
  });

  revalidatePath(returnTo);
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}sent=1`);
}
