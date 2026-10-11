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
import { publishCustomSkill } from "@/lib/skills";
import type { Prisma } from "@/generated/prisma";

/**
 * "Request build" (a recommendation) or "Request a custom skill" (in the client's words): a skill build is a
 * project, so it's scoped, estimated (team credits, paid once) and staffed like any other. Its brief is the request,
 * sent straight to Klingit. Requesting the same skill again opens the build already under way.
 */
export async function requestSkillBuildAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const description = String(formData.get("description") ?? "").trim().slice(0, 2000);
  const name = (String(formData.get("name") ?? "").trim() || description.split(/[.\n]/)[0].slice(0, 60) || "Custom skill").slice(0, 80);

  const existing = await prisma.project.findFirst({ where: { clientId: viewer.clientId, agentBuild: true, name, status: { notIn: ["ARCHIVED"] } }, select: { id: true } });
  if (existing) redirect(`/skills/build/${existing.id}`);

  const now = new Date();
  const project = await prisma.project.create({
    data: { clientId: viewer.clientId, name, type: "OTHER", status: "BRIEFING", agentBuild: true, startedAt: now, createdByClientUserId: viewer.id },
  });
  await prisma.pipelineStage.createMany({ data: PIPELINE_STAGE_ORDER.map((stage, order) => ({ projectId: project.id, name: stage, order, status: order === 0 ? "ACTIVE" : "UPCOMING" })) });
  const brief = description || `Build the "${name}" skill for ${viewer.client.name}, using our Brand OS.`;
  await prisma.brief.create({ data: { projectId: project.id, submittedByUserId: viewer.id, status: "SUBMITTED", submittedAt: now, rawIntake: brief, goals: brief } });
  await enqueue(project.id, viewer.clientId);
  await postProjectEvent(project.id, "Custom skill requested");

  const client = await prisma.client.findUnique({ where: { id: viewer.clientId }, include: { accountLead: true } });
  if (client?.accountLead) {
    await notify({
        userId: client.accountLead.userId,
        clientId: viewer.clientId,
        projectId: project.id,
        type: "SYSTEM",
        title: "Custom skill request",
        body: `${viewer.user.name} at ${client.name} requested "${name}".`,
        actionUrl: `/ops/projects/${project.id}`,
        actionLabel: "Open",
      });
  }
  revalidatePath("/skills");
  revalidatePath("/skills/yours");
  revalidatePath("/projects");
  redirect(`/skills/build/${project.id}`);
}

/**
 * "Looks right" on the latest test output: noted in the build log. After the last test the skill goes live: it
 * becomes one of the client's custom skills, runnable from Skills (each run uses AI credits).
 */
export async function approveSkillTestAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId, agentBuild: true }, include: { brief: true } });
  const build = agentBuildOf(project?.brief);
  if (!project?.brief || !build) return;
  const live = build.step === "Testing";
  const next: AgentBuild = live ? { ...build, step: "Live", dates: { ...build.dates, Live: new Date().toISOString().slice(0, 10) } } : build;
  await prisma.brief.update({ where: { id: project.brief.id }, data: { agentDrafts: { ...(project.brief.agentDrafts as object), agentBuild: next } as Prisma.InputJsonValue } });
  await postProjectEvent(projectId, live ? `Approved by ${viewer.user.name}: the skill is live` : `Test output approved by ${viewer.user.name}`);
  if (live) await publishCustomSkill(viewer.clientId, projectId, project.name, next);
  revalidatePath(`/skills/build/${projectId}`);
  revalidatePath("/skills");
  revalidatePath("/skills/yours");
}

/** The client edits the skill spec: allowed until building starts. */
export async function updateSkillSpecAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId, agentBuild: true }, include: { brief: true } });
  const build = agentBuildOf(project?.brief);
  if (!project?.brief || !build || stepIndex(build.step) >= stepIndex("Building")) return;
  const field = (k: keyof AgentBuild["spec"]) => String(formData.get(k) ?? build.spec[k]).trim().slice(0, 600) || build.spec[k];
  const spec = { whatItDoes: field("whatItDoes"), whatItUses: field("whatItUses"), whatYouGet: field("whatYouGet"), runs: field("runs") };
  await prisma.brief.update({ where: { id: project.brief.id }, data: { agentDrafts: { ...(project.brief.agentDrafts as object), agentBuild: { ...build, spec } } as Prisma.InputJsonValue } });
  await postProjectEvent(projectId, `Spec edited by ${viewer.user.name}`);
  revalidatePath(`/skills/build/${projectId}`);
}

/** Pause or resume one of the client's own custom skills (a paused skill can't run and uses no AI credits). */
export async function setCustomSkillLiveAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const agentId = String(formData.get("agentId") ?? "");
  const live = formData.get("live") === "true";
  await prisma.agent.updateMany({ where: { id: agentId, kind: "SKILL", clientId: viewer.clientId }, data: { status: live ? "LIVE" : "DISABLED" } });
  revalidatePath("/skills");
  revalidatePath("/skills/yours");
}
