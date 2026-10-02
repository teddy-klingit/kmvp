import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { loadOpsProjects, projectHealth, type OpsProject } from "@/lib/ops-exceptions";
import { computeStaffingSuggestions } from "@/lib/staffing";
import { loadStaffPool } from "@/lib/autopilot-runner";
import { listStaffNotes } from "@/lib/staff-notes";
import { shortDate, type ProjectState } from "@/lib/project-state";
import { AUTO_STAFF_THRESHOLD } from "@/lib/autopilot";
import type { TimelineMilestone } from "@/components/ds/project-timeline";
import type { UnresolvedNeed } from "@/lib/estimate-generation";

/** The PM's 8 internal stages, folded from getProjectState's stage. */
export const INTERNAL_STAGES = ["Intake", "Brief", "Estimate", "Approval", "Staffing", "Production", "Review", "Delivered"] as const;

function internalIndex(state: ProjectState) {
  switch (state.stage) {
    case "briefing":
      return state.brief.mode === "intake" ? 0 : 1;
    case "estimating":
      return 2;
    case "awaiting_approval":
      return 3;
    case "staffing":
      return 4;
    case "production":
      return 5;
    case "review":
    case "final":
      return 6;
    case "closed":
      return 8;
  }
}

export const INTERNAL_STAGE_PILL: Record<ProjectState["stage"], string> = {
  briefing: "Briefing",
  estimating: "Estimating",
  awaiting_approval: "Awaiting client approval",
  staffing: "Staffing",
  production: "In production",
  review: "Client reviewing",
  final: "Awaiting sign-off",
  closed: "Delivered",
};

/** The ops stage pill, with the client queue made visible: approved but waiting for one of the client's slots. */
export function internalStagePill(state: ProjectState) {
  if (state.paused) return "Paused";
  if (state.clientStage === "queued" && state.stage === "staffing") return "Approved · waiting for a slot";
  return INTERNAL_STAGE_PILL[state.stage];
}

export function internalTimeline(state: ProjectState, autopilot: boolean, dates: { stageDone: Partial<Record<string, Date | null>>; due: Date | null; reviewEta: Date | null }): TimelineMilestone[] {
  const current = internalIndex(state);
  const turn = state.ballInCourt === "client" ? "client" : "Klingit";
  return INTERNAL_STAGES.map((label, i) => {
    const status = i < current ? "done" : i === current ? "current" : "upcoming";
    let caption: string | undefined;
    if (status === "done") {
      const d = dates.stageDone[label];
      caption = d ? shortDate(d) : "Done";
    } else if (status === "current") caption = `Now · ${turn}`;
    else if (label === "Staffing") caption = autopilot ? "Auto" : "PM";
    else if (label === "Production") caption = "≤ 2 days";
    else if (label === "Review" && dates.reviewEta) caption = `Est. ${shortDate(dates.reviewEta)}`;
    else if (label === "Delivered" && dates.due) caption = `Due ${shortDate(dates.due)}`;
    return { key: label, label, status, caption };
  });
}

export async function loadCockpit(projectId: string) {
  const [ops] = await loadOpsProjects({ id: projectId });
  if (!ops) return null;
  const { project } = ops;

  const [detail, priceList, pool, runs, decisions, thread, notes, contact] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        client: { include: { accountLead: { include: { user: true } } } },
        brief: true,
        estimate: {
          include: {
            lineItems: { include: { priceListItem: true }, orderBy: { order: "asc" } },
            revisions: { include: { createdBy: true }, orderBy: { version: "desc" } },
            sentByStaff: { include: { user: true } },
          },
        },
        team: { include: { members: { include: { staffMember: { include: { user: true } } } } } },
        assets: { orderBy: { createdAt: "asc" } },
        pipelineStages: { orderBy: { order: "asc" } },
      },
    }),
    prisma.priceListItem.findMany({ where: { archivedAt: null }, orderBy: [{ deliverableType: "asc" }, { complexityTier: "asc" }] }),
    loadStaffPool(),
    prisma.agentRun.findMany({ where: { projectId }, include: { agent: true, overriddenByUser: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.decisionLog.findMany({ where: { projectId }, include: { actor: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.comment.findMany({
      where: { projectId, archivedAt: null },
      include: { author: { include: { staffMember: true } }, clientAuthor: { include: { user: true } }, asset: true },
      orderBy: { createdAt: "asc" },
    }),
    listStaffNotes(projectId),
    prisma.clientUser.findFirst({
      where: { clientId: project.clientId, ...(project.createdByClientUserId ? { id: project.createdByClientUserId } : { permission: "OWNER" }) },
      include: { user: true },
    }),
  ]);

  const suggestions = computeStaffingSuggestions(pool, { projectType: project.type, clientId: project.clientId });
  const stageDone = (name: string) => detail.pipelineStages.find((s) => s.name === name)?.completedAt ?? null;
  const timeline = internalTimeline(ops.state, detail.autopilot, {
    stageDone: {
      Intake: detail.brief?.submittedAt ?? null,
      Brief: detail.brief?.acceptedAt ?? stageDone("BRIEF"),
      Estimate: detail.estimate?.sentAt ?? stageDone("ESTIMATE"),
      Approval: detail.estimate?.status === "APPROVED" ? detail.estimate.respondedAt : null,
      Staffing: detail.team?.confirmedAt ?? stageDone("STAFFING"),
      Production: detail.deliveredAt ?? stageDone("PRODUCTION"),
      Review: stageDone("FEEDBACK"),
    },
    due: detail.dueDate,
    reviewEta: detail.pipelineStages.find((s) => s.name === "FEEDBACK")?.etaAt ?? null,
  });

  return {
    ops,
    project: detail,
    health: projectHealth(ops),
    timeline,
    priceList,
    suggestions,
    autoStaffThreshold: AUTO_STAFF_THRESHOLD,
    runs,
    decisions,
    thread,
    notes,
    contact,
    unresolved: jsonArray<UnresolvedNeed>(detail.estimate?.unresolvedNeeds),
  };
}

export type Cockpit = NonNullable<Awaited<ReturnType<typeof loadCockpit>>>;
export type { OpsProject };
