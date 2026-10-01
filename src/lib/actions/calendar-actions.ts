"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";

export async function addClientCalendarItemAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const channel = String(formData.get("channel") ?? "Other");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!title || !date) return;

  await prisma.clientCalendarItem.create({
    data: { clientId: viewer.clientId, title, date: new Date(date), channel, notes: notes || null },
  });

  revalidatePath("/calendar");
}

export async function deleteClientCalendarItemAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const id = String(formData.get("id") ?? "");

  await prisma.clientCalendarItem.deleteMany({ where: { id, clientId: viewer.clientId } });
  revalidatePath("/calendar");
}
