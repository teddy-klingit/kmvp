import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { computeStaffingSuggestions } from "@/lib/staffing";
import { planAutopilot, ROLES_FOR_TYPE, AUTO_STAFF_THRESHOLD, type AutopilotPlan } from "@/lib/autopilot";
import { postProjectEvent } from "@/lib/project-events";
import { logDecision } from "@/lib/decision-log";
import { generateDraftEstimate, type UnresolvedNeed } from "@/lib/estimate-generation";
import { addBusinessDays, formatDay, FIRST_DRAFT_BUSINESS_DAYS } from "@/lib/project-state";
import { INTERNAL_ROLE_LABEL } from "@/lib/labels";
import type { InternalRole } from "@/generated/prisma";

// TODO(cron): autopilot runs when an ops or client page for the project loads (approved for the MVP).
// Move runAutopilotForActiveProjects() onto a Railway cron so steps also happen when nobody is looking.

const FAILED_RETRY_MS = 60 * 60 * 1000;

function firstAndInitial(name: string) {
  const [first, last] = name.split(" ");
  return last ? `${first} ${last[0]}.` : first;
}

export async function loadStaffPool() {
  return prisma.staffMember.findMany({
    where: { title: { in: ["ART_DIRECTOR", "COPYWRITER", "MOTION_DESIGNER"] }, user: { status: "ACTIVE" } },
    include: {
      user: true,
      teamMemberships: { include: { team: { include: { project: { include: { client: true } } } } } },
    },
  });
}

async function agentRun(agentKey: string, projectId: string, clientId: string, decision: string, output: object) {
  const agent = await prisma.agent.findUnique({ where: { key: agentKey } });
  if (!agent) return null;
  return prisma.agentRun.create({ data: { agentId: agent.id, projectId, clientId, decision, output, status: "SUCCESS", input: { trigger: "autopilot" } } });
}

/** Gathers the facts planAutopilot needs. */
export async function autopilotInputFor(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { brief: true, estimate: { include: { lineItems: true } }, team: true },
  });
  if (!project) return null;
  const disabled = await prisma.agent.findMany({ where: { status: "DISABLED" }, select: { key: true } });
  const failed = await prisma.agentRun.findFirst({
    where: { projectId, agent: { key: "estimate_agent" }, status: "FAILED", createdAt: { gt: new Date(Date.now() - FAILED_RETRY_MS) } },
  });

  const bestScoreByRole: Partial<Record<InternalRole, { name: string; score: number; staffMemberId: string }>> = {};
  if (project.status === "STAFFING") {
    const pool = await loadStaffPool();
    const suggestions = computeStaffingSuggestions(pool, { projectType: project.type, clientId: project.clientId });
    for (const role of ROLES_FOR_TYPE[project.type]) {
      const best = suggestions.find((s) => s.title === role);
      if (best) bestScoreByRole[role] = { name: firstAndInitial(best.name), score: best.overallScore, staffMemberId: best.staffMemberId };
    }
  }

  const pending = jsonArray<{ key: string }>(project.brief?.pendingQuestions);
  const transcript = jsonArray<{ key?: string }>(project.brief?.transcript);
  const unresolved = jsonArray<UnresolvedNeed>(project.estimate?.unresolvedNeeds).filter((n) => !n.resolution);

  return {
    project,
    bestScoreByRole,
    input: {
      status: project.status,
      autopilot: project.autopilot,
      type: project.type,
      brief: project.brief
        ? {
            status: project.brief.status,
            gaps: jsonArray(project.brief.gapsFlagged).length,
            unansweredQuestions: pending.filter((q) => !transcript.some((t) => t.key === q.key)).length,
          }
        : null,
      estimate: project.estimate
        ? {
            status: project.estimate.status,
            lines: project.estimate.lineItems.length,
            customLines: project.estimate.lineItems.filter((l) => l.isCustom || !l.priceListItemId).length,
            unresolvedNeeds: unresolved.length,
            totalCredits: project.estimate.totalCredits,
          }
        : null,
      estimateGenerationFailedRecently: Boolean(failed),
      team: project.team ? { confirmed: project.team.confirmed } : null,
      bestScoreByRole,
      disabledAgents: disabled.map((a) => a.key),
    },
  };
}

export async function planFor(projectId: string): Promise<AutopilotPlan | null> {
  const facts = await autopilotInputFor(projectId);
  return facts ? planAutopilot(facts.input) : null;
}

const running = new Set<string>();

/**
 * Executes this project's autopilot steps. Each step re-checks the row it changes (conditional update),
 * so two page loads racing can't run a step twice. Every step writes an AgentRun, a DecisionLog row
 * (actor = autopilot) and a system message the client sees.
 */
export async function runAutopilot(projectId: string) {
  if (running.has(projectId)) return [];
  running.add(projectId);
  const done: string[] = [];
  try {
    const facts = await autopilotInputFor(projectId);
    if (!facts) return done;
    const { project } = facts;
    const plan = planAutopilot(facts.input);

    for (const step of plan.steps) {
      // Re-read the switch before every step: pausing stops everything immediately.
      const fresh = await prisma.project.findUnique({ where: { id: projectId }, select: { autopilot: true, status: true } });
      if (!fresh?.autopilot || fresh.status === "PAUSED") break;

      if (step.kind === "accept_brief" && project.brief) {
        const moved = await prisma.brief.updateMany({ where: { id: project.brief.id, status: "SUBMITTED" }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
        if (moved.count === 0) continue;
        await prisma.pipelineStage.updateMany({ where: { projectId, name: "BRIEF" }, data: { status: "COMPLETED", completedAt: new Date() } });
        await prisma.pipelineStage.updateMany({ where: { projectId, name: "ESTIMATE" }, data: { status: "ACTIVE", startedAt: new Date() } });
        await prisma.project.update({ where: { id: projectId }, data: { status: "ESTIMATING" } });
        const run = await agentRun("brief_agent", projectId, project.clientId, "Brief accepted automatically: 0 gaps, every question answered", { gaps: 0 });
        await logDecision({ projectId, actorUserId: null, area: "autopilot", action: "Accepted the brief", reason: "0 gaps", after: { briefStatus: "ACCEPTED", agentRunId: run?.id } });
        await postProjectEvent(projectId, "Brief accepted");
        done.push(step.kind);
      }

      if (step.kind === "generate_estimate") {
        const result = await generateDraftEstimate(projectId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "failed" }));
        if (!result.ok) continue;
        await logDecision({ projectId, actorUserId: null, area: "autopilot", action: "Generated the estimate", after: { totalCredits: result.totalCredits, lines: result.lines, unresolved: result.unresolved } });
        done.push(step.kind);
        // Re-plan: a clean estimate under the cap goes out in the same pass.
        const again = await planFor(projectId);
        if (again?.steps.some((s) => s.kind === "send_estimate")) plan.steps.push({ kind: "send_estimate" });
      }

      if (step.kind === "send_estimate") {
        const estimate = await prisma.estimate.findUnique({ where: { projectId } });
        if (!estimate) continue;
        const sent = await prisma.estimate.updateMany({
          where: { id: estimate.id, status: "DRAFT" },
          data: { status: "SENT", sentAt: new Date(), expiresAt: new Date(Date.now() + 4 * 86400000) },
        });
        if (sent.count === 0) continue;
        await prisma.estimateRevision.create({
          data: { estimateId: estimate.id, version: estimate.version, totalCredits: estimate.totalCredits, lineItems: await snapshotLines(estimate.id), status: "SENT" },
        });
        const run = await agentRun("estimate_agent", projectId, project.clientId, `Estimate v${estimate.version} sent automatically: ${estimate.totalCredits} credits, every line from the price list`, { totalCredits: estimate.totalCredits });
        await logDecision({ projectId, actorUserId: null, area: "autopilot", action: `Sent estimate v${estimate.version}`, after: { totalCredits: estimate.totalCredits, agentRunId: run?.id } });
        await postProjectEvent(projectId, `Estimate v${estimate.version} sent`);
        done.push(step.kind);
      }

      if (step.kind === "auto_staff") {
        const picks = step.roles.map((r) => ({ role: r, pick: facts.bestScoreByRole[r]! })).filter((p) => p.pick && p.pick.score >= AUTO_STAFF_THRESHOLD);
        if (picks.length !== step.roles.length) continue;
        const existing = await prisma.team.findUnique({ where: { projectId } });
        if (existing?.confirmed) continue;
        const credits = (await prisma.estimate.findUnique({ where: { projectId } }))?.totalCredits ?? 0;
        const hoursEach = picks.length ? Math.round((credits / picks.length) * 10) / 10 : 0;
        const team = existing ?? (await prisma.team.create({ data: { projectId } }));
        for (const { role, pick } of picks) {
          await prisma.teamMember.upsert({
            where: { teamId_staffMemberId: { teamId: team.id, staffMemberId: pick.staffMemberId } },
            update: { roleOnProject: INTERNAL_ROLE_LABEL[role], allocatedHours: hoursEach, recommended: true },
            create: { teamId: team.id, staffMemberId: pick.staffMemberId, roleOnProject: INTERNAL_ROLE_LABEL[role], allocatedHours: hoursEach, recommended: true },
          });
        }
        const confirmed = await prisma.team.updateMany({ where: { id: team.id, confirmed: false }, data: { confirmed: true, confirmedAt: new Date() } });
        if (confirmed.count === 0) continue;
        await prisma.pipelineStage.updateMany({ where: { projectId, name: "STAFFING" }, data: { status: "COMPLETED", completedAt: new Date() } });
        await prisma.pipelineStage.updateMany({ where: { projectId, name: "PRODUCTION" }, data: { status: "ACTIVE", startedAt: new Date() } });
        await prisma.project.update({ where: { id: projectId }, data: { status: "IN_PRODUCTION", startedAt: project.startedAt ?? new Date() } });
        const summary = picks.map((p) => `${p.pick.name} (${p.pick.score})`).join(", ");
        const run = await agentRun("staffing_agent", projectId, project.clientId, `Team auto-staffed: ${summary}`, { picks });
        await logDecision({ projectId, actorUserId: null, area: "autopilot", action: "Staffed and confirmed the team", after: { members: summary, agentRunId: run?.id } });
        const names = picks.map((p) => p.pick.name.split(" ")[0]).join(", ");
        await postProjectEvent(projectId, `Your team is confirmed: ${names} · first draft by ${formatDay(addBusinessDays(new Date(), FIRST_DRAFT_BUSINESS_DAYS))}`);
        done.push(step.kind);
      }
    }
  } finally {
    running.delete(projectId);
  }
  return done;
}

export async function snapshotLines(estimateId: string) {
  const lines = await prisma.estimateLineItem.findMany({ where: { estimateId }, include: { priceListItem: true }, orderBy: { order: "asc" } });
  return lines.map((l) => ({
    deliverable: l.priceListItem?.displayName ?? l.deliverable,
    detail: l.detail,
    quantity: l.quantity,
    complexityTier: l.complexityTier,
    credits: l.credits,
    isCustom: l.isCustom,
    customReason: l.customReason,
    priceListItemId: l.priceListItemId,
  }));
}

/** Ops home: run every active project's checks. */
export async function runAutopilotForActiveProjects() {
  const projects = await prisma.project.findMany({
    where: { autopilot: true, status: { in: ["BRIEFING", "ESTIMATING", "STAFFING"] } },
    select: { id: true },
  });
  for (const p of projects) await runAutopilot(p.id);
}
