import { prisma } from "@/lib/prisma";
import type { getPortalViewer } from "@/lib/current-viewer";
import { intakeBrief, type IntakeAnalysis } from "@/lib/ai/agents/intake-agent";
import { PIPELINE_STAGE_ORDER } from "@/lib/labels";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { brandSourcesForAgents } from "@/lib/brand-sources-data";
import type { Client } from "@/generated/prisma";

// Deliberately NOT a "use server" module: these take a trusted viewer object
// and must only be called from server code that resolved that viewer itself.
// Exporting them from a "use server" file would make them client-callable.

export type PortalViewer = Awaited<ReturnType<typeof getPortalViewer>>;

/** An unfinished (DRAFT) project of the same type the viewer can see — offered
 * as "Continue your draft" so re-describing the same need doesn't silently
 * spawn a near-duplicate project each time. */
export async function findUnfinishedDraft(viewer: PortalViewer, projectType: IntakeAnalysis["projectType"]) {
  return prisma.project.findFirst({
    where: { clientId: viewer.clientId, status: "DRAFT", type: projectType, ...projectVisibilityWhere(viewer.id) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  });
}

export async function runIntake(args: {
  clientId: string;
  client: Pick<Client, "name" | "industry" | "brandSummary">;
  projectId?: string;
  rawText: string;
  link: string;
  fileName: string;
  fileText: string;
}) {
  const brandOS = await prisma.brandOS.findUnique({ where: { clientId: args.clientId } });

  const result = await intakeBrief({
    projectId: args.projectId,
    clientId: args.clientId,
    client: args.client,
    brandOS,
    linkedSources: await brandSourcesForAgents(args.clientId),
    rawText: args.rawText,
    link: args.link || null,
    fileName: args.fileName || null,
    fileText: args.fileText || null,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function createProjectFromAnalysis(
  viewer: PortalViewer,
  analysis: IntakeAnalysis,
  rawIntake: string,
  extras: { sourceLink?: string | null; sourceFileName?: string | null } = {}
) {
  const project = await prisma.project.create({
    data: {
      clientId: viewer.clientId,
      name: analysis.suggestedName,
      type: analysis.projectType,
      status: "DRAFT",
      createdByClientUserId: viewer.id,
    },
  });

  await prisma.pipelineStage.createMany({
    data: PIPELINE_STAGE_ORDER.map((name, order) => ({
      projectId: project.id,
      name,
      order,
      status: order === 0 ? "ACTIVE" : "UPCOMING",
    })),
  });

  await prisma.brief.create({
    data: {
      projectId: project.id,
      submittedByUserId: viewer.id,
      rawIntake,
      sourceLink: extras.sourceLink ?? null,
      sourceFileName: extras.sourceFileName ?? null,
      goals: rawIntake || null,
      aiSummary: analysis.summary,
      pendingQuestions: analysis.clarifyingQuestions,
      status: "DRAFT",
      submittedAt: new Date(),
    },
  });

  return project;
}
