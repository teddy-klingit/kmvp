"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole, ForbiddenError } from "@/lib/authz";
import { generateDraftEstimate } from "@/lib/estimate-generation";
import { classifyFeedback } from "@/lib/ai/agents/feedback-agent";

export type GenerateEstimateState = { error?: string; success?: boolean };

export async function generateEstimateWithAiAction(
  _prev: GenerateEstimateState,
  formData: FormData
): Promise<GenerateEstimateState> {
  try {
    await requireOpsRole(["ADMIN", "PM"]);
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: err.message };
    throw err;
  }
  const projectId = String(formData.get("projectId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId }, select: { id: true } });
  if (!project) return { error: "Project not found." };

  const result = await generateDraftEstimate(projectId, { replace: formData.get("replace") === "1" });
  if (!result.ok) return { error: result.error };

  revalidatePath("/ops", "layout");
  return { success: true };
}

export async function classifyFeedbackWithAiAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM", "CREATOR"]);
  const commentId = String(formData.get("commentId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, archivedAt: null, project: { clientId } },
    include: { project: { include: { client: true } } },
  });
  if (!comment) return;

  const result = await classifyFeedback({
    projectId: comment.projectId,
    clientId: comment.project.clientId,
    clientName: comment.project.client.name,
    brandSummary: comment.project.client.brandSummary,
    commentBody: comment.body,
  });
  if (!result.ok) return;

  await prisma.comment.update({
    where: { id: commentId },
    data: { agentPriority: result.data.priority, agentTaskSummary: result.data.taskSummary },
  });

  revalidatePath(`/ops/clients/${clientId}/delivery/feedback`);
}
