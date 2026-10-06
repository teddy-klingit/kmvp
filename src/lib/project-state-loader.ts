import { cache } from "react";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { getProjectState, type ProjectState, type ProjectStateInput } from "@/lib/project-state";
import { clientVisibleAsset } from "@/lib/qc/visibility";

/** The relations getProjectState needs — include this wherever a project's state is shown. */
export const projectStateInclude = {
  brief: true,
  estimate: { select: { status: true, totalCredits: true, sentAt: true, expiresAt: true, respondedAt: true } },
  team: { include: { members: { include: { staffMember: { include: { user: true } } } } } },
  // Only what the client has: a version still in Klingit's quality check doesn't count for either side's state.
  assets: { where: clientVisibleAsset, select: { status: true } },
  pipelineStages: { select: { name: true, completedAt: true, etaAt: true } },
} satisfies Prisma.ProjectInclude;

export type ProjectWithStateData = Prisma.ProjectGetPayload<{ include: typeof projectStateInclude }>;

export function toProjectStateInput(project: ProjectWithStateData): ProjectStateInput {
  return {
    id: project.id,
    status: project.status,
    pausedFromStatus: project.pausedFromStatus,
    dueDate: project.dueDate,
    deliveredAt: project.deliveredAt,
    creditsQuoted: project.creditsQuoted,
    activatedAt: project.activatedAt,
    brief: project.brief,
    estimate: project.estimate,
    team: project.team
      ? {
          confirmed: project.team.confirmed,
          confirmedAt: project.team.confirmedAt,
          members: project.team.members.map((m) => ({ name: m.staffMember.user.name, role: m.roleOnProject })),
        }
      : null,
    assets: project.assets,
    pipelineStages: project.pipelineStages,
  };
}

export async function loadProjectStates(
  where: Prisma.ProjectWhereInput,
  clientId: string,
  orderBy: Prisma.ProjectOrderByWithRelationInput = { createdAt: "desc" }
): Promise<{ project: ProjectWithStateData; state: ProjectState }[]> {
  const projects = await prisma.project.findMany({ where: { ...where, clientId }, include: projectStateInclude, orderBy });
  const now = new Date();
  return projects.map((project) => ({ project, state: getProjectState(toProjectStateInput(project), now) }));
}

/**
 * For a single project. Returns null when the project isn't this client's (or,
 * with a viewer, is confidential and not shared with them). Cached per request
 * so the layout and the tab page share one load.
 */
export const loadProjectState = cache(async (projectId: string, clientId: string, viewerClientUserId?: string) => {
  const [result] = await loadProjectStates(
    { id: projectId, ...(viewerClientUserId ? projectVisibilityWhere(viewerClientUserId) : {}) },
    clientId
  );
  return result ?? null;
});

/** States for an already-loaded list of projects, keyed by id — for pages that only need the badge. */
export async function loadProjectStateMap(projectIds: string[], clientId: string) {
  if (projectIds.length === 0) return new Map<string, ProjectState>();
  const results = await loadProjectStates({ id: { in: projectIds } }, clientId);
  return new Map(results.map((r) => [r.project.id, r.state]));
}
