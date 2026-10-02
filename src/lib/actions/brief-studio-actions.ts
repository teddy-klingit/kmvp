"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPortalViewer } from "@/lib/current-viewer";
import { rejectUpload, saveUpload } from "@/lib/uploads";
import { runAutopilot } from "@/lib/autopilot-runner";
import type { SectionKey } from "@/lib/brief-studio/model";
import type { Answer } from "@/lib/brief-studio/planner";
import {
  addReference,
  answerQuestion,
  askAbout,
  editSection,
  inviteTeammate,
  loadDraft,
  sendBrief,
  sendMessage,
  setBasics,
  startStudio,
  studioView,
  type StudioView,
} from "@/lib/brief-studio/studio";

/** Brief studio actions. Each resolves the viewer itself and works only on a draft they can see. */

const KEYS: SectionKey[] = ["task", "deliverables", "whyNow", "objective", "audience", "keyMessage", "proofOffer", "cta", "material", "deadline", "markets", "languages", "mustInclude", "mustAvoid", "references", "competitorExamples", "approver", "feedbackRounds", "budgetCeiling", "tone", "notes"];
const isKey = (k: string): k is SectionKey => (KEYS as string[]).includes(k);

export type StudioResult = { view?: StudioView; error?: string };
const done = (view: StudioView | null): StudioResult => (view ? { view } : { error: "This brief can't be changed any more." });

/** The first message: creates the draft project and its brief, runs the smart start, returns where to go. */
export async function startBriefAction(text: string): Promise<{ projectId?: string; error?: string }> {
  const viewer = await getPortalViewer();
  const t = text.trim().slice(0, 4000);
  if (!t) return { error: "Tell us a little about what you need." };
  const projectId = await startStudio(viewer, t);
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  return { projectId };
}

export async function answerQuestionAction(projectId: string, questionId: string, answer: Answer) {
  const viewer = await getPortalViewer();
  return done(await answerQuestion(viewer, projectId, questionId, { chosen: answer.chosen?.slice(0, 12), freeText: answer.freeText?.slice(0, 2000), delegate: Boolean(answer.delegate) }));
}

export async function sendStudioMessageAction(projectId: string, text: string) {
  const viewer = await getPortalViewer();
  return done(await sendMessage(viewer, projectId, text.slice(0, 4000)));
}

export async function editSectionAction(projectId: string, key: string, patch: { value?: string; items?: string[] }) {
  const viewer = await getPortalViewer();
  if (!isKey(key)) return { error: "Unknown section." };
  return done(await editSection(viewer, projectId, key, { value: patch.value?.slice(0, 2000), items: patch.items?.slice(0, 20).map((i) => i.slice(0, 120)) }));
}

export async function setBasicsAction(projectId: string, basics: { deadline?: string; markets?: string[] }) {
  const viewer = await getPortalViewer();
  return done(await setBasics(viewer, projectId, basics));
}

export async function askAboutAction(projectId: string, key: string) {
  const viewer = await getPortalViewer();
  if (!isKey(key)) return { error: "Unknown section." };
  return done(await askAbout(viewer, projectId, key));
}

/** A file (images, PDFs, video) or a link, added to References. */
export async function attachReferenceAction(formData: FormData): Promise<StudioResult> {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const draft = await loadDraft(viewer, projectId);
  if (!draft?.editable) return { error: "This brief can't be changed any more." };
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const rejected = rejectUpload(file);
    if (rejected) return { error: rejected };
    const saved = await saveUpload(projectId, file);
    const name = saved.storageKey.split("/").slice(1).join("/");
    return done(await addReference(viewer, projectId, { kind: "file", label: file.name, sub: "File", url: `/api/briefs/${projectId}/files/${encodeURIComponent(name)}` }));
  }
  const link = String(formData.get("link") ?? "").trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
  } catch {
    return { error: "That doesn't look like a link." };
  }
  return done(await addReference(viewer, projectId, { kind: "link", label: `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}`.slice(0, 80), sub: "Link", url: url.toString() }));
}

export async function inviteTeammateAction(projectId: string, clientUserId: string) {
  const viewer = await getPortalViewer();
  return done(await inviteTeammate(viewer, projectId, clientUserId));
}

/** Everything autosaves; this just confirms it and refreshes the lists that show drafts. */
export async function saveDraftAction(projectId: string) {
  const viewer = await getPortalViewer();
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  return done(await studioView(viewer, projectId));
}

/** Never blocked by the score. The Estimate agent runs after the response (autopilot rules apply). */
export async function sendBriefAction(projectId: string) {
  const viewer = await getPortalViewer();
  const sent = await sendBrief(viewer, projectId);
  if (!sent) return { error: "This brief was already sent." };
  try {
    after(() => runAutopilot(projectId).catch(() => undefined));
  } catch {
    // Outside a request (tests): autopilot runs on the next project page load instead.
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  revalidatePath(`/ops/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}
