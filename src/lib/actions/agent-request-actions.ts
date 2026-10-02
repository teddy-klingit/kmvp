"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PIPELINE_STAGE_ORDER } from "@/lib/labels";
import { enqueue } from "@/lib/active-slots";
import { postProjectEvent } from "@/lib/project-events";

/**
 * "Request build" (a recommendation) or "Request a custom agent" (in the client's words): an agent build is a
 * project, so it's scoped, estimated and staffed like any other and shows on the Projects board. Its brief is the
 * request, sent straight to Klingit. Requesting the same agent again opens the build already under way.
 */
export async function requestAgentBuildAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const description = String(formData.get("description") ?? "").trim().slice(0, 2000);
  const name = (String(formData.get("name") ?? "").trim() || description.split(/[.\n]/)[0].slice(0, 60) || "Custom agent").slice(0, 80);

  const existing = await prisma.project.findFirst({ where: { clientId: viewer.clientId, agentBuild: true, name, status: { notIn: ["ARCHIVED"] } }, select: { id: true } });
  if (existing) redirect(`/projects/${existing.id}`);

  const now = new Date();
  const project = await prisma.project.create({
    data: { clientId: viewer.clientId, name, type: "OTHER", status: "BRIEFING", agentBuild: true, startedAt: now, createdByClientUserId: viewer.id },
  });
  await prisma.pipelineStage.createMany({ data: PIPELINE_STAGE_ORDER.map((stage, order) => ({ projectId: project.id, name: stage, order, status: order === 0 ? "ACTIVE" : "UPCOMING" })) });
  const brief = description || `Build the "${name}" agent for ${viewer.client.name}, using our Brand OS.`;
  await prisma.brief.create({ data: { projectId: project.id, submittedByUserId: viewer.id, status: "SUBMITTED", submittedAt: now, rawIntake: brief, goals: brief } });
  await enqueue(project.id, viewer.clientId);
  await postProjectEvent(project.id, "Agent build requested");

  const client = await prisma.client.findUnique({ where: { id: viewer.clientId }, include: { accountLead: true } });
  if (client?.accountLead) {
    await prisma.notification.create({
      data: {
        userId: client.accountLead.userId,
        clientId: viewer.clientId,
        projectId: project.id,
        type: "SYSTEM",
        title: "Agent build request",
        body: `${viewer.user.name} at ${client.name} requested "${name}".`,
        actionUrl: `/ops/projects/${project.id}`,
        actionLabel: "Open",
      },
    });
  }
  revalidatePath("/assets/agents-templates");
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
