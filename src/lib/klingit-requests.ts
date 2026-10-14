import { prisma } from "@/lib/prisma";
import { ordersPaused, PAUSED_MESSAGE } from "@/lib/contracts";
import { PIPELINE_STAGE_ORDER } from "@/lib/labels";
import { enqueue } from "@/lib/active-slots";
import { postProjectEvent } from "@/lib/project-events";
import { notify } from "@/lib/notifier";
import type { PortalViewer } from "@/lib/brief-intake";

/**
 * A small request to Klingit from Skills (Phase R): "Ask Klingit" on a skill Klingit runs (video cutdowns,
 * localisation, …), the skill finder's "Ask Klingit", or "Ask Klingit to polish" a skill version.
 * - `send: true` goes straight to the PM: a submitted brief, queued, with an estimate in team credits to come.
 * - `send: false` is a Draft on Ongoing projects for the client to confirm (polish), nothing sent yet.
 * The account lead hears about sent requests. Repeating the same request within 15 minutes reuses it.
 */
export async function createKlingitRequest(viewer: PortalViewer, req: { name: string; text: string; event: string; send: boolean; teamCredits?: number | null; projectId?: string | null }) {
  if (req.send && (await ordersPaused(viewer.clientId))) throw new Error(PAUSED_MESSAGE);
  const name = req.name.trim().slice(0, 80) || "Request to Klingit";
  const recent = await prisma.project.findFirst({ where: { clientId: viewer.clientId, name, createdByClientUserId: viewer.id, createdAt: { gte: new Date(Date.now() - 15 * 60000) }, status: { not: "ARCHIVED" } }, select: { id: true } });
  if (recent) return recent.id;

  const now = new Date();
  const project = await prisma.project.create({
    data: { clientId: viewer.clientId, name, type: "OTHER", status: req.send ? "BRIEFING" : "DRAFT", startedAt: req.send ? now : null, createdByClientUserId: viewer.id, creditsQuoted: req.teamCredits ?? null },
  });
  await prisma.pipelineStage.createMany({ data: PIPELINE_STAGE_ORDER.map((stage, order) => ({ projectId: project.id, name: stage, order, status: order === 0 ? "ACTIVE" : "UPCOMING" })) });
  const text = req.text.trim().slice(0, 4000);
  await prisma.brief.create({ data: { projectId: project.id, submittedByUserId: viewer.id, status: req.send ? "SUBMITTED" : "DRAFT", submittedAt: req.send ? now : null, rawIntake: text, goals: text } });
  await postProjectEvent(project.id, req.event);
  if (req.send) {
    await enqueue(project.id, viewer.clientId);
    const client = await prisma.client.findUnique({ where: { id: viewer.clientId }, include: { accountLead: true } });
    if (client?.accountLead) {
      await notify({ userId: client.accountLead.userId, clientId: viewer.clientId, projectId: project.id, type: "SYSTEM", title: `Request: ${name}`, body: `${viewer.user.name} at ${client.name}: ${text.slice(0, 160)}`, actionUrl: `/ops/projects/${project.id}`, actionLabel: "Open" });
    }
  }
  return project.id;
}
