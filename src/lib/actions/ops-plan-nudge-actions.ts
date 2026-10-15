"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOpsRole } from "@/lib/authz";
import { sendNudge } from "@/lib/plan-nudge";

/**
 * Ops → Plan → Nudge client (Phase S, S7.5): the reminder is drafted on the page and only sent when the PM presses
 * Send, to the person who planned the item (else the client's admins), with a link to it on their plan.
 */
export async function sendNudgeAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const item = await sendNudge(viewer.userId, String(formData.get("itemId") ?? ""), String(formData.get("text") ?? ""));
  if (!item) return;
  revalidatePath("/ops/planner");
  redirect(`/ops/planner?sent=${item.id}`);
}
