"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { canManageProjectAccess } from "@/lib/project-visibility";

async function loadManagedProject(viewer: Awaited<ReturnType<typeof getPortalViewer>>, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId } });
  if (!project || !canManageProjectAccess(project, viewer.id)) return null;
  return project;
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

export async function addProjectMemberAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const clientUserId = String(formData.get("clientUserId") ?? "");
  if (!clientUserId) return;

  const project = await loadManagedProject(viewer, projectId);
  if (!project) return;

  const teammate = await prisma.clientUser.findFirst({ where: { id: clientUserId, clientId: viewer.clientId } });
  if (!teammate) return;

  await prisma.projectMember.upsert({
    where: { projectId_clientUserId: { projectId, clientUserId } },
    create: { projectId, clientUserId },
    update: {},
  });

  revalidateProject(projectId);
}

export async function removeProjectMemberAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const clientUserId = String(formData.get("clientUserId") ?? "");

  const project = await loadManagedProject(viewer, projectId);
  if (!project) return;

  await prisma.projectMember.deleteMany({ where: { projectId, clientUserId } });
  revalidateProject(projectId);
}

export async function setProjectConfidentialAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const confidential = formData.get("confidential") === "true";

  const project = await loadManagedProject(viewer, projectId);
  if (!project) return;

  await prisma.project.update({ where: { id: projectId }, data: { confidential } });
  revalidateProject(projectId);
}
