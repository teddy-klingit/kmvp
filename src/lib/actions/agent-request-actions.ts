"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PIPELINE_STAGE_ORDER } from "@/lib/labels";
import { enqueue } from "@/lib/active-slots";
import { postProjectEvent } from "@/lib/project-events";
import { notify } from "@/lib/notifier";
import { agentBuildOf, stepIndex, type AgentBuild } from "@/lib/agent-build";
import type { Prisma } from "@/generated/prisma";

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
    await notify({
        userId: client.accountLead.userId,
        clientId: viewer.clientId,
        projectId: project.id,
        type: "SYSTEM",
        title: "Agent build request",
        body: `${viewer.user.name} at ${client.name} requested "${name}".`,
        actionUrl: `/ops/projects/${project.id}`,
        actionLabel: "Open",
      });
  }
  revalidatePath("/assets/agents-templates");
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

/** "Looks right" on the latest test output: noted in the build log; after the last test the agent goes live. */
export async function approveAgentTestAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId, agentBuild: true }, include: { brief: true } });
  const build = agentBuildOf(project?.brief);
  if (!project?.brief || !build) return;
  const live = build.step === "Testing";
  const next: AgentBuild = live ? { ...build, step: "Live", dates: { ...build.dates, Live: new Date().toISOString().slice(0, 10) } } : build;
  await prisma.brief.update({ where: { id: project.brief.id }, data: { agentDrafts: { ...(project.brief.agentDrafts as object), agentBuild: next } as Prisma.InputJsonValue } });
  await postProjectEvent(projectId, live ? `Approved by ${viewer.user.name}: the agent is live` : `Test output approved by ${viewer.user.name}`);
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/assets/agents-templates");
}

/** The client edits the agent spec: allowed until building starts. */
export async function updateAgentSpecAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId, agentBuild: true }, include: { brief: true } });
  const build = agentBuildOf(project?.brief);
  if (!project?.brief || !build || stepIndex(build.step) >= stepIndex("Building")) return;
  const field = (k: keyof AgentBuild["spec"]) => String(formData.get(k) ?? build.spec[k]).trim().slice(0, 600) || build.spec[k];
  const spec = { whatItDoes: field("whatItDoes"), whatItUses: field("whatItUses"), whatYouGet: field("whatYouGet"), runs: field("runs") };
  await prisma.brief.update({ where: { id: project.brief.id }, data: { agentDrafts: { ...(project.brief.agentDrafts as object), agentBuild: { ...build, spec } } as Prisma.InputJsonValue } });
  await postProjectEvent(projectId, `Spec edited by ${viewer.user.name}`);
  revalidatePath(`/projects/${projectId}`, "layout");
}
