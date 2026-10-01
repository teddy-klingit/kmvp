"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { getEffectiveBriefQuestions, type BriefQuestionKey } from "@/lib/brief-questions";
import { analyzeBrief } from "@/lib/ai/agents/brief-agent";
import { loadProjectState } from "@/lib/project-state-loader";

type EmptyState = Record<string, never>;
const EMPTY: EmptyState = {};

export async function answerBriefQuestionAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const briefId = String(formData.get("briefId") ?? "");
  const key = String(formData.get("key") ?? "") as BriefQuestionKey;
  const answer = String(formData.get("answer") ?? "").trim();
  if (!answer) return EMPTY;

  const [brief, brandOS] = await Promise.all([
    prisma.brief.findFirst({ where: { id: briefId, project: { clientId: viewer.clientId } } }),
    prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } }),
  ]);
  const effectiveQuestions = getEffectiveBriefQuestions(brandOS);
  if (!brief || !effectiveQuestions.some((q) => q.key === key)) return EMPTY;

  const question = effectiveQuestions.find((q) => q.key === key)!;
  const transcript = jsonArray<{ question: string; answer: string }>(brief.transcript);
  transcript.push({ question: question.question, answer });

  const updated = { ...brief, [key]: answer } as Record<string, unknown>;
  const allAnswered = effectiveQuestions.every((q) => Boolean(updated[q.key]));

  await prisma.brief.update({
    where: { id: briefId },
    data: {
      [key]: answer,
      transcript,
      status: "SUBMITTED",
      submittedAt: brief.submittedAt ?? new Date(),
    },
  });

  // Once every fixed question is answered, have the real Brief agent review
  // the whole brief for gaps before it goes to the ops team for acceptance.
  if (allAnswered) {
    const [client, project] = await Promise.all([
      prisma.client.findUnique({ where: { id: viewer.clientId } }),
      prisma.project.findUnique({ where: { id: brief.projectId } }),
    ]);
    const briefText = effectiveQuestions.map((q) => `${q.question}\n${String(updated[q.key] ?? "—")}`).join("\n\n");
    const result = await analyzeBrief({
      projectId: brief.projectId,
      clientId: viewer.clientId,
      clientName: viewer.client.name,
      projectType: project?.type ?? "CAMPAIGN",
      brandSummary: client?.brandSummary ?? null,
      briefText,
    });

    if (result.ok) {
      await prisma.brief.update({
        where: { id: briefId },
        data: {
          aiSummary: result.data.summary,
          aiQualityScore: result.data.qualityScore,
          gapsFlagged: result.data.gaps,
          followUpSuggestions: result.data.suggestedReplies,
        },
      });
    }
  }

  revalidatePath(`/projects/${brief.projectId}`, "layout");
  revalidatePath("/dashboard");
  return EMPTY;
}

type PendingQuestion = { key: string; question: string; quickAnswers: string[] };
type TranscriptTurn = { key?: string; question: string; answer: string };

export async function answerDynamicBriefQuestionAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const briefId = String(formData.get("briefId") ?? "");
  const key = String(formData.get("key") ?? "");
  const answer = String(formData.get("answer") ?? "").trim();
  if (!answer) return EMPTY;

  const brief = await prisma.brief.findFirst({
    where: { id: briefId, project: { clientId: viewer.clientId } },
  });
  if (!brief) return EMPTY;

  const pendingQuestions = jsonArray<PendingQuestion>(brief.pendingQuestions);
  const question = pendingQuestions.find((q) => q.key === key);
  if (!question) return EMPTY;

  const transcript = jsonArray<TranscriptTurn>(brief.transcript);
  transcript.push({ key, question: question.question, answer });

  const allAnswered = pendingQuestions.every((q) => transcript.some((t) => t.key === q.key));

  await prisma.brief.update({
    where: { id: briefId },
    data: { transcript },
  });

  if (allAnswered) {
    const [client, project] = await Promise.all([
      prisma.client.findUnique({ where: { id: viewer.clientId } }),
      prisma.project.findUnique({ where: { id: brief.projectId } }),
    ]);

    const briefText = [
      brief.rawIntake ?? "",
      ...transcript.map((t) => `${t.question}\n${t.answer}`),
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await analyzeBrief({
      projectId: brief.projectId,
      clientId: viewer.clientId,
      clientName: viewer.client.name,
      projectType: project?.type ?? "CAMPAIGN",
      brandSummary: client?.brandSummary ?? null,
      briefText,
    });

    await prisma.brief.update({
      where: { id: briefId },
      data: {
        status: "SUBMITTED",
        ...(result.ok
          ? {
              aiSummary: result.data.summary,
              aiQualityScore: result.data.qualityScore,
              gapsFlagged: result.data.gaps,
              followUpSuggestions: result.data.suggestedReplies,
            }
          : {}),
      },
    });
  }

  revalidatePath(`/projects/${brief.projectId}`, "layout");
  revalidatePath("/dashboard");
  return EMPTY;
}

export async function approveEstimateAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const estimateId = String(formData.get("estimateId") ?? "");

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, status: "SENT", project: { clientId: viewer.clientId } },
  });
  if (!estimate) return;

  await prisma.estimate.update({
    where: { id: estimateId },
    data: { status: "APPROVED", respondedAt: new Date() },
  });
  await prisma.project.update({
    where: { id: estimate.projectId },
    data: { status: "STAFFING" },
  });

  revalidatePath(`/projects/${estimate.projectId}`, "layout");
  revalidatePath("/dashboard");
}

export async function requestEstimateChangesAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const estimateId = String(formData.get("estimateId") ?? "");
  const note = String(formData.get("note") ?? "");

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, status: "SENT", project: { clientId: viewer.clientId } },
  });
  if (!estimate) return;

  await prisma.estimate.update({
    where: { id: estimateId },
    data: { status: "CHANGES_REQUESTED", respondedAt: new Date(), notes: note || estimate.notes },
  });

  revalidatePath(`/projects/${estimate.projectId}`, "layout");
}

export async function approveAllAssetsAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId } });
  if (!project) return;

  await prisma.asset.updateMany({
    where: { projectId, status: { in: ["IN_REVIEW", "CHANGES_REQUESTED"] } },
    data: { status: "APPROVED" },
  });
  await prisma.project.update({ where: { id: projectId }, data: { status: "IN_FEEDBACK" } });

  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function requestAssetChangesAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const assetId = String(formData.get("assetId") ?? "");

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, client: { id: viewer.clientId } },
  });
  if (!asset) return;

  await prisma.asset.update({ where: { id: assetId }, data: { status: "CHANGES_REQUESTED" } });
  revalidatePath(`/projects/${asset.projectId}`, "layout");
}

export async function postCommentAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const assetId = formData.get("assetId") ? String(formData.get("assetId")) : null;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId } });
  if (!project) return;

  await prisma.comment.create({
    data: { projectId, assetId, authorClientUserId: viewer.id, body },
  });

  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function postPinCommentAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const xPercent = Number(formData.get("xPercent") ?? NaN);
  const yPercent = Number(formData.get("yPercent") ?? NaN);
  const widthPercent = formData.get("widthPercent") ? Number(formData.get("widthPercent")) : null;
  const heightPercent = formData.get("heightPercent") ? Number(formData.get("heightPercent")) : null;
  if (!body || !assetId || Number.isNaN(xPercent) || Number.isNaN(yPercent)) return EMPTY;

  const asset = await prisma.asset.findFirst({ where: { id: assetId, projectId, client: { id: viewer.clientId } } });
  if (!asset) return EMPTY;

  await prisma.comment.create({
    data: { projectId, assetId, authorClientUserId: viewer.id, body, xPercent, yPercent, widthPercent, heightPercent },
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  return EMPTY;
}

export async function postTimestampCommentAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const timestampSeconds = Number(formData.get("timestampSeconds") ?? NaN);
  if (!body || !assetId || Number.isNaN(timestampSeconds)) return EMPTY;

  const asset = await prisma.asset.findFirst({ where: { id: assetId, projectId, client: { id: viewer.clientId } } });
  if (!asset) return EMPTY;

  await prisma.comment.create({
    data: { projectId, assetId, authorClientUserId: viewer.id, body, timestampSeconds },
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  return EMPTY;
}

export async function rateProjectAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const rating = Number(formData.get("rating") ?? 0);
  const feedback = String(formData.get("feedback") ?? "").trim();

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId } });
  if (!project) return;

  await prisma.comment.create({
    data: {
      projectId,
      authorClientUserId: viewer.id,
      body: feedback ? `Rated ${rating}/5 — ${feedback}` : `Rated ${rating}/5.`,
    },
  });

  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function signOffProjectAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const rating = Number(formData.get("rating") ?? 0);

  const loaded = await loadProjectState(projectId, viewer.clientId);
  if (!loaded || loaded.state.stage !== "final" || loaded.state.ballInCourt !== "client") return;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "DELIVERED", deliveredAt: new Date() },
  });
  await prisma.pipelineStage.updateMany({
    where: { projectId, name: "FINAL_DELIVERY" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  await prisma.comment.create({
    data: {
      projectId,
      authorClientUserId: viewer.id,
      body: `Signed off with a rating of ${rating}/5.`,
    },
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/dashboard");
}

export async function startProjectAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId } });
  if (!project || project.status !== "DRAFT") return;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "BRIEFING", startedAt: new Date() },
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect(`/projects/${projectId}`);
}
