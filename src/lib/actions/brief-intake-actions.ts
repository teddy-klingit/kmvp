"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { runIntake, createProjectFromAnalysis, findUnfinishedDraft } from "@/lib/brief-intake";

export type IntakeState = {
  error?: string;
  existingDraft?: { id: string; name: string };
  submitted?: { rawText: string; link: string };
};

/** Entry point for a brand new project — no project exists yet. The AI
 * suggests the name and type, so the client never has to fill those in. */
export async function startBriefFromIntakeAction(_prev: IntakeState, formData: FormData): Promise<IntakeState> {
  const viewer = await getPortalViewer();
  const rawText = String(formData.get("rawText") ?? "").trim();
  const link = String(formData.get("link") ?? "").trim();
  const fileName = String(formData.get("fileName") ?? "").trim();
  const fileText = String(formData.get("fileText") ?? "").trim();
  const startNew = formData.get("startNew") === "1";
  const submitted = { rawText, link };
  if (!rawText && !link && !fileName) return { error: "Tell us at least a little about what you need.", submitted };

  let analysis;
  try {
    analysis = await runIntake({
      clientId: viewer.clientId,
      client: viewer.client,
      rawText: rawText || `(No description provided — see attached ${fileName || link})`,
      link,
      fileName,
      fileText,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong analyzing your brief.", submitted };
  }

  if (!startNew) {
    const existingDraft = await findUnfinishedDraft(viewer, analysis.projectType);
    if (existingDraft) return { existingDraft, submitted };
  }

  const project = await createProjectFromAnalysis(viewer, analysis, rawText, {
    sourceLink: link || null,
    sourceFileName: fileName || null,
  });

  redirect(`/projects/${project.id}`);
}

/** Same intake step, but for a project that already exists (e.g. one an
 * internal PM started on the client's behalf) — the name/type are left as
 * they are; only the brief content and clarifying questions are generated. */
export async function submitBriefIntakeAction(_prev: IntakeState, formData: FormData): Promise<IntakeState> {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const rawText = String(formData.get("rawText") ?? "").trim();
  const link = String(formData.get("link") ?? "").trim();
  const fileName = String(formData.get("fileName") ?? "").trim();
  const fileText = String(formData.get("fileText") ?? "").trim();
  if (!rawText && !link && !fileName) return { error: "Tell us at least a little about what you need." };

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId } });
  if (!project) return { error: "Project not found." };

  let analysis;
  try {
    analysis = await runIntake({
      clientId: viewer.clientId,
      client: viewer.client,
      projectId,
      rawText: rawText || `(No description provided — see attached ${fileName || link})`,
      link,
      fileName,
      fileText,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong analyzing your brief." };
  }

  await prisma.brief.update({
    where: { projectId },
    data: {
      rawIntake: rawText,
      sourceLink: link || null,
      sourceFileName: fileName || null,
      goals: rawText || null,
      aiSummary: analysis.summary,
      pendingQuestions: analysis.clarifyingQuestions,
      status: "DRAFT",
      submittedAt: new Date(),
    },
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  return {};
}

/** Entry point from a Project Inspiration card — the idea's own title and
 * description become the raw intake text, so the client skips straight to
 * the AI's clarifying questions instead of writing the brief from scratch. */
export async function startBriefFromInspirationAction(_prev: IntakeState, formData: FormData): Promise<IntakeState> {
  const viewer = await getPortalViewer();
  const inspirationId = String(formData.get("inspirationId") ?? "");

  const inspiration = await prisma.inspiration.findFirst({
    where: { id: inspirationId, clientId: viewer.clientId },
  });
  if (!inspiration) return { error: "This idea could not be found." };

  const rawText = `${inspiration.title}\n\n${inspiration.description}`;

  let analysis;
  try {
    analysis = await runIntake({
      clientId: viewer.clientId,
      client: viewer.client,
      rawText,
      link: "",
      fileName: "",
      fileText: "",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong setting up this project." };
  }

  const project = await createProjectFromAnalysis(viewer, analysis, rawText);

  redirect(`/projects/${project.id}`);
}
