"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";

/** Removes a plan item of the signed-in client (archived, kept for restore). Plan's own actions: plan-item-actions.ts. */
export async function deleteClientCalendarItemAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const id = String(formData.get("id") ?? "");

  await prisma.clientCalendarItem.updateMany({ where: { id, clientId: viewer.clientId }, data: { archivedAt: new Date() } });
  revalidatePath("/plan");
}
