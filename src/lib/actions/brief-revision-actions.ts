"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";

type EmptyState = { error?: string };
const EMPTY: EmptyState = {};

export async function updateAcceptedBriefAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const briefId = String(formData.get("briefId") ?? "");
  const goals = String(formData.get("goals") ?? "").trim();
  const targetAudience = String(formData.get("targetAudience") ?? "").trim();
  const successMetrics = String(formData.get("successMetrics") ?? "").trim();
  const references = String(formData.get("references") ?? "").trim();
  const acknowledged = formData.get("acknowledged") === "on";

  if (!acknowledged) return { error: "Please confirm you understand this may affect the estimate and timeline." };
  if (!goals) return { error: "The objective can't be empty." };

  const brief = await prisma.brief.findFirst({
    where: { id: briefId, project: { clientId: viewer.clientId } },
  });
  if (!brief) return { error: "Brief not found." };

  await prisma.briefRevision.create({
    data: {
      briefId: brief.id,
      goals: brief.goals,
      targetAudience: brief.targetAudience,
      successMetrics: brief.successMetrics,
      references: brief.references,
      changedByName: viewer.user.name,
    },
  });

  await prisma.brief.update({
    where: { id: briefId },
    data: { goals, targetAudience, successMetrics, references },
  });

  revalidatePath(`/projects/${brief.projectId}`, "layout");
  return EMPTY;
}
