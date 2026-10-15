"use server";

import { revalidatePath } from "next/cache";
import { requireOpsRole } from "@/lib/authz";
import { markTaskDone, undoTaskDone } from "@/lib/today-done";

/** Today: tick a task off by hand. It stays done for the rest of the day and comes back tomorrow if still open. */
export async function tickTaskAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const key = String(formData.get("key") ?? "");
  if (!key) return;
  await markTaskDone(viewer.id, { key, label: String(formData.get("label") ?? key), clientId: String(formData.get("clientId") ?? "") || null }, "ticked");
  revalidatePath("/ops", "layout");
}

export async function untickTaskAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  await undoTaskDone(viewer.id, String(formData.get("key") ?? ""));
  revalidatePath("/ops", "layout");
}
