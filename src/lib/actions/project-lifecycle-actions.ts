"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PIPELINE_STAGE_ORDER } from "@/lib/labels";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { activateQueued } from "@/lib/active-slots";
import { runAutopilot } from "@/lib/autopilot-runner";

export async function duplicateProjectAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");

  const project = await prisma.project.findFirst({
    where: { id: projectId, clientId: viewer.clientId, ...projectVisibilityWhere(viewer.id) },
    include: { brief: true },
  });
  if (!project) return;

  const copy = await prisma.project.create({
    data: {
      clientId: viewer.clientId,
      name: `${project.name} (copy)`,
      type: project.type,
      status: "DRAFT",
      confidential: project.confidential,
      createdByClientUserId: viewer.id,
    },
  });

  await prisma.pipelineStage.createMany({
    data: PIPELINE_STAGE_ORDER.map((name, order) => ({
      projectId: copy.id,
      name,
      order,
      status: order === 0 ? "ACTIVE" : "UPCOMING",
    })),
  });

  if (project.brief) {
    await prisma.brief.create({
      data: {
        projectId: copy.id,
        submittedByUserId: viewer.id,
        goals: project.brief.goals,
        targetAudience: project.brief.targetAudience,
        successMetrics: project.brief.successMetrics,
        references: project.brief.references,
        rawIntake: project.brief.rawIntake,
        status: "DRAFT",
      },
    });
  }

  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

export async function pauseProjectAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId, ...projectVisibilityWhere(viewer.id) } });
  if (!project || project.status === "PAUSED" || project.status === "ARCHIVED" || project.status === "DELIVERED") return;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "PAUSED", pausedFromStatus: project.status },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/dashboard");
}

export async function resumeProjectAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId, ...projectVisibilityWhere(viewer.id) } });
  if (!project || project.status !== "PAUSED") return;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: project.pausedFromStatus ?? "BRIEFING", pausedFromStatus: null },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/dashboard");
}

export async function deleteProjectAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");

  // Soft archive, never a hard delete: the project (and its files and history) can be restored.
  const archived = await prisma.project.updateMany({ where: { id: projectId, clientId: viewer.clientId, status: { not: "ARCHIVED" }, ...projectVisibilityWhere(viewer.id) }, data: { status: "ARCHIVED", queuePosition: null } });
  // An archived project gives its slot back.
  if (archived.count) for (const id of await activateQueued(viewer.clientId)) await runAutopilot(id);

  revalidatePath("/projects");
  revalidatePath("/dashboard");
}
