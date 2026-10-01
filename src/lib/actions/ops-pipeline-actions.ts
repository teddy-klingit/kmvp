"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";
import { postProjectEvent } from "@/lib/project-events";
import { addBusinessDays, formatDay, FIRST_DRAFT_BUSINESS_DAYS } from "@/lib/project-state";

async function completeStage(projectId: string, name: string) {
  await prisma.pipelineStage.updateMany({
    where: { projectId, name: name as never },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

async function activateStage(projectId: string, name: string) {
  await prisma.pipelineStage.updateMany({
    where: { projectId, name: name as never },
    data: { status: "ACTIVE", startedAt: new Date() },
  });
}

function revalidateClient(clientId: string) {
  revalidatePath(`/ops/clients/${clientId}`, "layout");
}

export async function acceptBriefAsIsAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const briefId = String(formData.get("briefId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const brief = await prisma.brief.findFirst({ where: { id: briefId, project: { clientId } } });
  if (!brief) return;

  await prisma.brief.update({ where: { id: briefId }, data: { status: "ACCEPTED", acceptedAt: new Date(), gapsFlagged: [] } });
  await completeStage(brief.projectId, "BRIEF");
  await activateStage(brief.projectId, "ESTIMATE");
  await prisma.project.update({ where: { id: brief.projectId }, data: { status: "ESTIMATING" } });

  revalidateClient(clientId);
}

export async function requestBriefFromClientAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const briefId = String(formData.get("briefId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const brief = await prisma.brief.findFirst({ where: { id: briefId, project: { clientId } } });
  if (!brief) return;

  await prisma.brief.update({ where: { id: briefId }, data: { status: "GAPS_FLAGGED" } });
  revalidateClient(clientId);
}

export async function sendEstimateToClientAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const estimateId = String(formData.get("estimateId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const existing = await prisma.estimate.findFirst({ where: { id: estimateId, project: { clientId } } });
  if (!existing) return;

  const estimate = await prisma.estimate.update({
    where: { id: estimateId },
    data: { status: "SENT", sentAt: new Date(), expiresAt: new Date(Date.now() + 4 * 86400000) },
    include: { project: true },
  });

  const clientUser = await prisma.clientUser.findFirst({ where: { clientId, permission: "OWNER" } });
  if (clientUser) {
    await prisma.notification.create({
      data: {
        userId: clientUser.userId,
        clientId,
        projectId: estimate.projectId,
        type: "APPROVAL_NEEDED",
        title: "Estimate approval",
        body: `Review ${estimate.project.name} · ${estimate.totalCredits} credits`,
        actionUrl: `/projects/${estimate.projectId}`,
        actionLabel: "Review",
      },
    });
  }

  await postProjectEvent(estimate.projectId, "Estimate v1 sent");
  revalidateClient(clientId);
}

export async function confirmTeamAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const teamId = String(formData.get("teamId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const team = await prisma.team.findFirst({ where: { id: teamId, projectId, project: { clientId } } });
  if (!team) return;

  await prisma.team.update({ where: { id: teamId }, data: { confirmed: true, confirmedAt: new Date() } });
  await completeStage(projectId, "STAFFING");
  await activateStage(projectId, "PRODUCTION");
  await prisma.project.update({ where: { id: projectId }, data: { status: "IN_PRODUCTION", startedAt: new Date() } });

  const members = await prisma.teamMember.findMany({ where: { teamId }, include: { staffMember: { include: { user: true } } } });
  const names = members.map((m) => m.staffMember.user.name).join(", ");
  const eta = formatDay(addBusinessDays(new Date(), FIRST_DRAFT_BUSINESS_DAYS));
  await postProjectEvent(projectId, `Your team is confirmed${names ? `: ${names}` : ""} · first draft by ${eta}`);
  revalidateClient(clientId);
}

export async function approveProductionBatchAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId } });
  if (!project) return;

  await prisma.asset.updateMany({ where: { projectId, status: "IN_REVIEW" }, data: { status: "APPROVED" } });
  await completeStage(projectId, "PRODUCTION");
  await activateStage(projectId, "QA");
  await prisma.project.update({ where: { id: projectId }, data: { status: "QA" } });

  revalidateClient(clientId);
}

export async function sendBackToProductionAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId } });
  if (!project) return;

  await prisma.pipelineStage.updateMany({ where: { projectId, name: "QA" }, data: { status: "UPCOMING" } });
  await activateStage(projectId, "PRODUCTION");
  await prisma.project.update({ where: { id: projectId }, data: { status: "IN_PRODUCTION" } });

  revalidateClient(clientId);
}

export async function passQaSendToDeliveryAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId } });
  if (!project) return;

  await completeStage(projectId, "QA");
  await activateStage(projectId, "FIRST_DRAFT_DELIVERY");
  revalidateClient(clientId);
}

export async function sendDeliveryToClientAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId } });
  if (!project) return;

  // QA approval also writes APPROVED, so on the first delivery every asset goes
  // to the client for review. On later rounds, keep what the client already approved.
  const firstDelivery = !project.deliveredAt;
  await prisma.asset.updateMany({
    where: { projectId, status: firstDelivery ? { in: ["APPROVED", "CHANGES_REQUESTED"] } : "CHANGES_REQUESTED" },
    data: { status: "IN_REVIEW" },
  });
  await completeStage(projectId, "FIRST_DRAFT_DELIVERY");
  await activateStage(projectId, "FEEDBACK");
  await prisma.project.update({ where: { id: projectId }, data: { status: "AWAITING_REVIEW", deliveredAt: new Date() } });

  await postProjectEvent(projectId, "First draft delivered");
  revalidateClient(clientId);
}

export async function sendFeedbackToProductionAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId } });
  if (!project) return;

  await completeStage(projectId, "FEEDBACK");
  await activateStage(projectId, "FINAL_DELIVERY");
  await prisma.project.update({ where: { id: projectId }, data: { status: "IN_FEEDBACK" } });

  revalidateClient(clientId);
}

export async function sendSignOffReminderAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId } });
  if (!project) return;

  const clientUser = await prisma.clientUser.findFirst({ where: { clientId, permission: "OWNER" } });
  if (clientUser) {
    await prisma.notification.create({
      data: {
        userId: clientUser.userId,
        clientId,
        projectId,
        type: "SYSTEM",
        title: "Reminder: sign-off pending",
        body: `${viewer.user.name} sent a reminder to review and sign off on your delivered project.`,
        actionUrl: `/projects/${projectId}`,
        actionLabel: "Review",
      },
    });
  }
  revalidateClient(clientId);
}
