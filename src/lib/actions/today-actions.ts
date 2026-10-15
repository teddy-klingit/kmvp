"use server";

import { revalidatePath } from "next/cache";
import { requireOpsRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { markTaskDone, undoTaskDone } from "@/lib/today-done";
import { saveEstimate, sendEstimate } from "@/lib/estimate-ops";
import { mergeDuplicateBriefs } from "@/lib/duplicate-briefs";
import { sendNudge } from "@/lib/plan-nudge";
import { decideRequest, RequestError } from "@/lib/requests";
import { createStaffNote } from "@/lib/staff-notes";
import { notify } from "@/lib/notifier";
import { addTeamMemberAction, confirmTeamAction, staffReplyAction, updateDatesAction } from "@/lib/actions/cockpit-actions";

/**
 * Today's inline actions (Phase T). Each calls the same server function as its full page (so it's logged the same
 * way: Decision log, AuditLog, project events, the client's notice), then marks the task done for today.
 */

export type TodayState = { error?: string; ok?: string };

const task = (fd: FormData) => ({ key: String(fd.get("key") ?? ""), label: String(fd.get("label") ?? ""), clientId: String(fd.get("clientId") ?? "") || null });
const done = async (staffId: string, fd: FormData) => {
  const t = task(fd);
  if (t.key) await markTaskDone(staffId, t, "acted");
  revalidatePath("/ops", "layout");
};

/** Today: tick a task off by hand. It stays done for the rest of the day and comes back tomorrow if still open. */
export async function tickTaskAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const t = task(formData);
  if (!t.key) return;
  await markTaskDone(viewer.id, t, "ticked");
  revalidatePath("/ops", "layout");
}

export async function untickTaskAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  await undoTaskDone(viewer.id, String(formData.get("key") ?? ""));
  revalidatePath("/ops", "layout");
}

type RowIn = { input: { kind: "price"; priceListItemId: string; quantity: number; detail: string } | { kind: "custom"; deliverable: string; detail: string; quantity: number; reason: string; balance: "pm" | "creative"; taskType: string | null } | { kind: "pm"; detail: string } | { kind: "need"; index: number }; credits: number | null; editable: boolean };

/** The inline estimate editor: Save draft, Send estimate (merging a duplicate brief), or confirm one number. */
export async function todayEstimateAction(_prev: TodayState, formData: FormData): Promise<TodayState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const mode = String(formData.get("mode") ?? "save");
  let rows: RowIn[];
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: "Some lines aren't valid." };
  }
  const lines: unknown[] = [];
  const resolutions: unknown[] = [];
  for (const r of rows) {
    const i = r.input;
    if (i.kind === "need") {
      if (r.credits != null) resolutions.push({ index: i.index, kind: "priced", credits: r.credits });
    } else if (i.kind === "price") lines.push({ ...i, credits: r.editable ? r.credits : null, confirmed: r.editable && r.credits != null });
    else if (i.kind === "custom") lines.push({ ...i, credits: r.credits ?? 0 });
    else lines.push({ kind: "pm", detail: i.detail, credits: r.credits ?? 0 });
  }
  const saved = await saveEstimate(viewer, projectId, { lines, resolutions, reason: "" });
  if (saved.error) return { error: saved.error };
  if (mode !== "send") {
    revalidatePath("/ops", "layout");
    revalidatePath(`/ops/projects/${projectId}`);
    return { ok: mode === "confirm" ? "Number confirmed." : "Draft saved." };
  }
  const sent = await sendEstimate(viewer, projectId);
  if (sent.error) {
    revalidatePath("/ops", "layout");
    return { error: sent.error };
  }
  const copies = String(formData.get("duplicates") ?? "").split(",").filter(Boolean);
  if (copies.length) await mergeDuplicateBriefs(viewer.userId, projectId, copies);
  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}`, "layout");
  await done(viewer.id, formData);
  return { ok: sent.ok };
}

export async function todayReplyAction(_prev: TodayState, formData: FormData): Promise<TodayState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  if (!String(formData.get("body") ?? "").trim()) return { error: "Write a reply first." };
  await staffReplyAction(formData);
  await done(viewer.id, formData);
  return { ok: "Sent." };
}

/** "Ask {creator}": the message goes to the creator as a staff note (never the client) and in-app to them. */
export async function todayAskCreatorAction(_prev: TodayState, formData: FormData): Promise<TodayState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const userId = String(formData.get("creatorUserId") ?? "");
  const name = String(formData.get("creatorName") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body || !userId) return { error: "Write the message first." };
  const note = await createStaffNote(projectId, `To ${name}: ${body}`);
  if (!note) return { error: "That project isn't open." };
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true, clientId: true } });
  await notify({ userId, projectId, type: "SYSTEM", title: `${viewer.user.name.split(" ")[0]} asks about ${project?.name ?? "a project"}`, body: body.slice(0, 500), actionUrl: `/ops/projects/${projectId}`, actionLabel: "Open project" });
  await done(viewer.id, formData);
  return { ok: `Sent to ${name.split(" ")[0]}.` };
}

export async function todayNudgeAction(_prev: TodayState, formData: FormData): Promise<TodayState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const item = await sendNudge(viewer.userId, String(formData.get("itemId") ?? ""), String(formData.get("text") ?? ""));
  if (!item) return { error: "Write the nudge first." };
  revalidatePath("/ops/plan");
  await done(viewer.id, formData);
  return { ok: "Nudge sent." };
}

export async function todayRequestAction(_prev: TodayState, formData: FormData): Promise<TodayState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const approve = formData.get("decision") === "approve";
  try {
    await decideRequest(String(formData.get("requestId") ?? ""), viewer.userId, approve, String(formData.get("note") ?? "").trim() || null);
  } catch (e) {
    if (e instanceof RequestError) return { error: e.message };
    throw e;
  }
  revalidatePath("/ops/requests");
  await done(viewer.id, formData);
  return { ok: approve ? "Approved." : "Declined." };
}

/** Assign the candidate and confirm the team, as the cockpit's Add + Confirm do. */
export async function todayAssignAction(_prev: TodayState, formData: FormData): Promise<TodayState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  await addTeamMemberAction(formData);
  await confirmTeamAction(formData);
  await done(viewer.id, formData);
  return { ok: "Assigned." };
}

/** Move the due date inline; the client is told (project event), as on the cockpit's dates editor. */
export async function todayMoveDateAction(_prev: TodayState, formData: FormData): Promise<TodayState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const r = await updateDatesAction({}, formData);
  if (r.error) return r;
  await done(viewer.id, formData);
  return { ok: r.ok };
}
