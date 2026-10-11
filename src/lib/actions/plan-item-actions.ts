"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { withAiCharge, assistantCharge, ASSISTANTS } from "@/lib/ai-context";
import { startStudio } from "@/lib/brief-studio/studio";
import { addPlanItem, feedTokenFor, movePlanItem, STATUSES, startBriefText, type Maker, type PlanStatus } from "@/lib/plan";

/** Plan → Calendar actions (Phase R step 3). Every read and write is scoped to the signed-in client. */

export type AddPlanState = { error?: string; ok?: string };

const MAKERS: Maker[] = ["client", "klingit_help", "klingit_project"];
const dateAt = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 10) : null;
};

function refresh() {
  revalidatePath("/plan", "layout");
  revalidatePath("/dashboard");
}

/**
 * Add to plan (design 05), idempotent: the dialog's request key means a double click never makes two items.
 * "Add and start brief" then opens the brief assistant with everything already known.
 */
export async function addPlanItemAction(_prev: AddPlanState, formData: FormData): Promise<AddPlanState> {
  const viewer = await getPortalViewer();
  const title = String(formData.get("title") ?? "").trim();
  const date = dateAt(formData.get("date"));
  const requestKey = String(formData.get("requestKey") ?? "");
  if (!title) return { error: "Say what it is." };
  if (!date) return { error: "Pick a live date." };
  if (!requestKey) return { error: "Open the dialog again and retry." };
  const maker = MAKERS.includes(formData.get("maker") as Maker) ? (formData.get("maker") as Maker) : "client";
  const projectId = maker === "klingit_project" ? String(formData.get("projectId") ?? "") || null : null;
  if (projectId && !(await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId }, select: { id: true } }))) return { error: "Pick one of your projects." };
  const opportunityId = String(formData.get("opportunityId") ?? "") || null;
  const { item } = await addPlanItem(
    viewer.clientId,
    viewer.userId,
    { title, date, endDate: dateAt(formData.get("endDate")), channels: formData.getAll("channels").map(String), formats: formData.getAll("formats").map(String), maker, notes: String(formData.get("notes") ?? ""), projectId, opportunityId, route: String(formData.get("route") ?? "") || null },
    requestKey
  );
  refresh();
  if (formData.get("start") === "1" && maker !== "klingit_project") await startBriefFor(viewer, item.id);
  return { ok: "Added to your plan." };
}

/** Start brief: a draft in the brief assistant with what the plan knows; the plan item follows that project. */
async function startBriefFor(viewer: Awaited<ReturnType<typeof getPortalViewer>>, itemId: string) {
  const item = await prisma.clientCalendarItem.findFirst({ where: { id: itemId, clientId: viewer.clientId, archivedAt: null } });
  if (!item) return;
  if (item.projectId) redirect(`/brief/${item.projectId}`);
  const projectId = await withAiCharge(assistantCharge(viewer.clientId, viewer.userId, ASSISTANTS.brief), () => startStudio(viewer, startBriefText(item)));
  await prisma.clientCalendarItem.update({ where: { id: item.id }, data: { projectId, maker: item.maker === "client" ? "klingit_help" : item.maker } });
  refresh();
  redirect(`/brief/${projectId}`);
}

export async function startPlanBriefAction(formData: FormData) {
  const viewer = await getPortalViewer();
  await startBriefFor(viewer, String(formData.get("itemId") ?? ""));
}

/** Drag to reschedule (recomputes brief-by). */
export async function movePlanItemAction(itemId: string, isoDay: string) {
  const viewer = await getPortalViewer();
  const date = dateAt(isoDay);
  if (!date) return;
  await movePlanItem(viewer.clientId, itemId, date);
  refresh();
}

/** A client's own item: Idea → Planned → … → Published (Klingit's follow their project). */
export async function setPlanStatusAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const status = String(formData.get("status") ?? "") as PlanStatus;
  if (!STATUSES.includes(status)) return;
  await prisma.clientCalendarItem.updateMany({ where: { id: String(formData.get("itemId") ?? ""), clientId: viewer.clientId, projectId: null }, data: { status } });
  refresh();
}

/** Remove from the plan (kept, archived). */
export async function archivePlanItemAction(formData: FormData) {
  const viewer = await getPortalViewer();
  await prisma.clientCalendarItem.updateMany({ where: { id: String(formData.get("itemId") ?? ""), clientId: viewer.clientId }, data: { archivedAt: new Date() } });
  refresh();
}

export type FeedState = { url?: string };

/** Subscribe: this user's private iCal URL; "renew" revokes the old one. */
export async function planFeedAction(_prev: FeedState, formData: FormData): Promise<FeedState> {
  const viewer = await getPortalViewer();
  const token = await feedTokenFor(viewer.userId, viewer.clientId, formData.get("renew") === "1");
  return { url: `/api/plan/ical/${token.token}` };
}
