"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { clientVisibleAsset } from "@/lib/qc/visibility";
import { approveSentVersions, settleReviewRound } from "@/lib/review-approvals";
import { copySuggestions, type CopyTags } from "@/lib/review";
import { logDecision } from "@/lib/decision-log";

/**
 * The client's actions in the review: approve items (one ad, a concept with its sizes, a slide, the whole set),
 * request changes with a note, comment threads (reply, resolve, a note on the whole set) and copy suggestions.
 * Every action is scoped to the viewer's client and to work that was sent to them.
 */

export type ReviewState = { error?: string; ok?: string };

function revalidate(projectId: string) {
  revalidatePath(`/review/${projectId}`);
  revalidatePath(`/projects/${projectId}`, "layout");
}

async function ownProject(projectId: string) {
  const viewer = await getPortalViewer();
  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId } });
  return project ? { viewer, project } : null;
}

const ids = (formData: FormData) => String(formData.get("assetIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Approve the given items (a concept approves all its sizes). Only while the work is with the client. */
export async function approveReviewItemsAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const own = await ownProject(projectId);
  if (!own || own.project.status !== "AWAITING_REVIEW") return;
  const n = await approveSentVersions({ id: { in: ids(formData) }, projectId, status: "IN_REVIEW", ...clientVisibleAsset });
  if (n) await logDecision({ projectId, actorUserId: own.viewer.user.id, area: "assets", action: `Approved ${n} item${n === 1 ? "" : "s"} in review` });
  await settleReviewRound(projectId);
  revalidate(projectId);
}

/** "Request changes": the note goes to the whole-set thread and the items still in review are marked. */
export async function requestReviewChangesAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const projectId = String(formData.get("projectId") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 4000);
  if (note.length < 3) return { error: "Say what should change." };
  const own = await ownProject(projectId);
  if (!own || own.project.status !== "AWAITING_REVIEW") return { error: "This work isn't waiting for your review." };
  const assets = await prisma.asset.findMany({ where: { id: { in: ids(formData) }, projectId, status: "IN_REVIEW", ...clientVisibleAsset }, select: { id: true, sentVersion: true } });
  for (const a of assets) {
    await prisma.$transaction([
      prisma.asset.update({ where: { id: a.id }, data: { status: "CHANGES_REQUESTED", changeRequestCount: { increment: 1 } } }),
      prisma.assetVersion.updateMany({ where: { assetId: a.id, number: a.sentVersion! }, data: { state: "CHANGES_REQUESTED" } }),
    ]);
  }
  await prisma.comment.create({ data: { projectId, authorClientUserId: own.viewer.id, body: note, contextKind: "set" } });
  revalidate(projectId);
  return { ok: `Changes requested on ${assets.length} item${assets.length === 1 ? "" : "s"}.` };
}

/** A reply in a thread: on the same asset, pointing at the thread. */
export async function replyThreadAction(formData: FormData) {
  const rootId = String(formData.get("threadId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const viewer = await getPortalViewer();
  const root = await prisma.comment.findFirst({ where: { id: rootId, project: { clientId: viewer.clientId } } });
  if (!root || !body) return;
  await prisma.comment.create({ data: { projectId: root.projectId, assetId: root.assetId, authorClientUserId: viewer.id, body, contextKind: "reply", contextRef: root.id } });
  revalidate(root.projectId);
}

/** Resolve or reopen a thread (its replies follow). */
export async function resolveThreadAction(formData: FormData) {
  const rootId = String(formData.get("threadId") ?? "");
  const resolved = String(formData.get("resolved") ?? "true") === "true";
  const viewer = await getPortalViewer();
  const root = await prisma.comment.findFirst({ where: { id: rootId, project: { clientId: viewer.clientId } } });
  if (!root) return;
  await prisma.comment.updateMany({ where: { OR: [{ id: root.id }, { contextKind: "reply", contextRef: root.id }] }, data: { resolved } });
  revalidate(root.projectId);
}

/** A note on the whole set (not on one asset). */
export async function postSetCommentAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const own = await ownProject(projectId);
  if (!own || !body) return;
  await prisma.comment.create({ data: { projectId, authorClientUserId: own.viewer.id, body, contextKind: "set" } });
  revalidate(projectId);
}

// ─── Copy ──────────────────────────────────────────────────────────────────


async function copyAsset(assetId: string) {
  const viewer = await getPortalViewer();
  const asset = await prisma.asset.findFirst({ where: { id: assetId, type: "COPY", ...clientVisibleAsset, client: { id: viewer.clientId } } });
  return asset ? { viewer, asset, tags: (asset.tags ?? {}) as CopyTags } : null;
}

/** Suggest new text for one language of a copy line (locked legal lines can't be edited). */
export async function suggestCopyAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const found = await copyAsset(String(formData.get("assetId") ?? ""));
  if (!found) return { error: "That copy isn't in your review." };
  const { viewer, asset, tags } = found;
  const lang = String(formData.get("lang") ?? "");
  const text = String(formData.get("text") ?? "").trim().slice(0, 600);
  if ((tags as { status?: string }).status === "locked") return { error: "This line comes from Brand OS and is locked." };
  if (!tags.copy || tags.copy[lang] === undefined) return { error: "Unknown language." };
  if (!text || text === tags.copy[lang]) return { error: "Change the text to suggest an edit." };
  const suggestions = [...copySuggestions(tags), { id: `s${Date.now().toString(36)}`, lang, text, by: viewer.user.name, note: String(formData.get("note") ?? "").trim().slice(0, 200) || null }];
  await prisma.asset.update({ where: { id: asset.id }, data: { tags: { ...tags, suggestion: null, suggestions } as Prisma.InputJsonValue } });
  revalidate(asset.projectId);
  return { ok: "Suggestion added." };
}

/** Accept (apply to the copy) or reject one suggestion. */
export async function resolveCopySuggestionAction(formData: FormData) {
  const found = await copyAsset(String(formData.get("assetId") ?? ""));
  if (!found) return;
  const { asset, tags } = found;
  const id = String(formData.get("suggestionId") ?? "");
  const accept = String(formData.get("decision") ?? "") === "accept";
  const all = copySuggestions(tags);
  const s = all.find((x) => x.id === id);
  if (!s) return;
  const copy = accept && tags.copy ? { ...tags.copy, [s.lang]: s.text } : tags.copy;
  await prisma.asset.update({ where: { id: asset.id }, data: { tags: { ...tags, copy, suggestion: null, suggestions: all.filter((x) => x.id !== id) } as Prisma.InputJsonValue } });
  revalidate(asset.projectId);
}

/** "Accept all": every open suggestion on the project's copy. */
export async function acceptAllCopyAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const own = await ownProject(projectId);
  if (!own) return;
  const assets = await prisma.asset.findMany({ where: { projectId, type: "COPY", ...clientVisibleAsset } });
  for (const a of assets) {
    const tags = (a.tags ?? {}) as CopyTags;
    const all = copySuggestions(tags);
    if (!all.length || !tags.copy) continue;
    const copy = { ...tags.copy };
    for (const s of all) copy[s.lang] = s.text;
    await prisma.asset.update({ where: { id: a.id }, data: { tags: { ...tags, copy, suggestion: null, suggestions: [] } as Prisma.InputJsonValue } });
  }
  revalidate(projectId);
}
