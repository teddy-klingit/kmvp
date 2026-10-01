"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";

export async function resolveCommunityEscalationAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const id = String(formData.get("id") ?? "");
  await prisma.communityEscalation.updateMany({ where: { id, clientId: viewer.clientId }, data: { status: "RESOLVED" } });
  revalidatePath("/insights/community");
}
