"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole, ForbiddenError } from "@/lib/authz";
import { generateEstimate } from "@/lib/ai/agents/estimate-agent";
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

  const project = await prisma.project.findFirst({
    where: { id: projectId, clientId },
    include: { brief: true, client: true },
  });
  if (!project || !project.brief) return { error: "This project has no accepted brief yet." };

  const priceList = await prisma.priceListItem.findMany({ orderBy: [{ deliverableType: "asc" }, { complexityTier: "asc" }] });
  if (priceList.length === 0) {
    return { error: "The price list is empty — add deliverables and rates in Price List before generating an estimate." };
  }

  const result = await generateEstimate({
    projectId,
    clientId,
    clientName: project.client.name,
    projectType: project.type,
    brandSummary: project.client.brandSummary,
    goals: project.brief.goals,
    targetAudience: project.brief.targetAudience,
    successMetrics: project.brief.successMetrics,
    deliverablesNotes: project.brief.deliverablesNotes,
    priceList: priceList.map((p) => ({ deliverableType: p.deliverableType, complexityTier: p.complexityTier, creditCost: p.creditCost })),
  });

  if (!result.ok) return { error: result.error };

  // The agent is instructed to only pick real price list entries, but the
  // actual cost always comes from this lookup — never from a number the
  // model wrote itself. Anything that doesn't resolve to a real row joins
  // unresolvedNeeds instead of silently getting a cost.
  const priceByKey = new Map(priceList.map((p) => [`${p.deliverableType}__${p.complexityTier}`, p]));
  const unresolvedNeeds: { description: string; reason: string }[] = result.data.unresolvedNeeds.map((n) => ({
    description: n.description,
    reason: n.reason,
  }));

  const resolvedLineItems: { deliverable: string; detail: string; credits: number; order: number }[] = [];
  result.data.lineItems.forEach((li, i) => {
    const match = priceByKey.get(`${li.deliverableType}__${li.complexityTier}`);
    if (!match) {
      unresolvedNeeds.push({
        description: `${li.quantity}× ${li.deliverableType} (${li.complexityTier})`,
        reason: "No matching price list entry for this deliverable type + tier — needs manual pricing.",
      });
      return;
    }
    resolvedLineItems.push({
      deliverable: `${li.quantity}× ${li.deliverableType}`,
      detail: `${li.detail} (${li.complexityTier.toLowerCase()} complexity, ${match.creditCost}c each)`,
      credits: li.quantity * match.creditCost,
      order: i,
    });
  });

  const totalCredits = resolvedLineItems.reduce((sum, li) => sum + li.credits, 0);

  const estimate = await prisma.estimate.create({
    data: {
      projectId,
      status: "DRAFT",
      totalHours: 0,
      totalCredits,
      notes: result.data.notes,
      unresolvedNeeds: unresolvedNeeds.length > 0 ? unresolvedNeeds : undefined,
      inclusions: [
        "Dedicated art director",
        "AI-assisted production for speed and consistency",
        "Brand compliance check on every asset",
        "2 rounds of revisions included",
      ],
    },
  });

  if (resolvedLineItems.length > 0) {
    await prisma.estimateLineItem.createMany({
      data: resolvedLineItems.map((li) => ({
        estimateId: estimate.id,
        deliverable: li.deliverable,
        detail: li.detail,
        hours: 0,
        credits: li.credits,
        order: li.order,
      })),
    });
  }

  revalidatePath(`/ops/clients/${clientId}/delivery/estimate`);
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
