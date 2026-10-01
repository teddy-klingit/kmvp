import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { getProjectState, type ProjectState } from "@/lib/project-state";
import { projectStateInclude, toProjectStateInput, type ProjectWithStateData } from "@/lib/project-state-loader";
import { workingHoursBetween, formatWorkingWait } from "@/lib/working-hours";
import { planAutopilot, type AutopilotPlan } from "@/lib/autopilot";
import { autopilotInputFor } from "@/lib/autopilot-runner";
import type { UnresolvedNeed } from "@/lib/estimate-generation";

/** A client message unanswered for longer than this many working hours is a PM exception. */
export const CLIENT_REPLY_SLA_HOURS = 4;

export type ExceptionKind =
  | "client_waiting"
  | "failed_agent"
  | "staffing"
  | "out_of_scope"
  | "estimate_send"
  | "second_change_request"
  | "deadline_at_risk";

export type OpsException = {
  id: string;
  kind: ExceptionKind;
  kindLabel: string;
  kindShort: string;
  tone: "danger" | "turn" | "neutral";
  title: string;
  detail: string;
  projectId: string;
  projectName: string;
  clientName: string;
  since: Date;
  waiting: string;
  action: { label: string; href: string };
  /** Lower = more urgent. */
  rank: number;
};

const KIND: Record<ExceptionKind, { label: string; short: string; tone: OpsException["tone"]; rank: number }> = {
  client_waiting: { label: "Client waiting", short: "MSG", tone: "danger", rank: 0 },
  failed_agent: { label: "Agent failed", short: "ERR", tone: "danger", rank: 1 },
  staffing: { label: "Staffing", short: "TEAM", tone: "turn", rank: 2 },
  out_of_scope: { label: "Out of scope", short: "PRICE", tone: "turn", rank: 2 },
  estimate_send: { label: "Estimate", short: "EST", tone: "turn", rank: 3 },
  second_change_request: { label: "Repeat change request", short: "REV", tone: "turn", rank: 3 },
  deadline_at_risk: { label: "Deadline at risk", short: "DATE", tone: "neutral", rank: 4 },
};

const ACTIVE = ["BRIEFING", "ESTIMATING", "STAFFING", "IN_PRODUCTION", "QA", "AWAITING_REVIEW", "IN_FEEDBACK", "PAUSED"] as const;

export type OpsProject = {
  project: ProjectWithStateData & { client: { name: string } };
  state: ProjectState;
  plan: AutopilotPlan;
  exceptions: OpsException[];
};

function cockpit(projectId: string, rest = "") {
  return `/ops/projects/${projectId}${rest}`;
}

/** Every active (non-draft) project with its state, autopilot plan and exceptions, for the PM home and the cockpit. */
export async function loadOpsProjects(where: { id?: string } = {}, now = new Date()): Promise<OpsProject[]> {
  const projects = await prisma.project.findMany({
    where: { status: { in: [...ACTIVE] }, ...where },
    include: {
      ...projectStateInclude,
      client: true,
      estimate: { include: { lineItems: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.id);
  const clientIds = [...new Set(projects.map((p) => p.clientId))];

  const [brandOSes, comments, assets, failedRuns] = await Promise.all([
    prisma.brandOS.findMany({ where: { clientId: { in: clientIds } } }),
    prisma.comment.findMany({
      where: { projectId: { in: ids }, kind: "MESSAGE", archivedAt: null },
      include: { clientAuthor: { include: { user: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.asset.findMany({ where: { projectId: { in: ids }, changeRequestCount: { gte: 2 }, status: "CHANGES_REQUESTED" } }),
    prisma.agentRun.findMany({
      where: { projectId: { in: ids }, status: "FAILED", overridden: false, createdAt: { gt: new Date(now.getTime() - 7 * 86400000) } },
      include: { agent: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const out: OpsProject[] = [];
  for (const project of projects) {
    const brandOS = brandOSes.find((b) => b.clientId === project.clientId) ?? null;
    const state = getProjectState(toProjectStateInput(project, brandOS), now);
    const facts = await autopilotInputFor(project.id);
    const plan = facts ? planAutopilot(facts.input) : { steps: [], blocked: [] };
    const exceptions: OpsException[] = [];
    const add = (kind: ExceptionKind, e: Omit<OpsException, "id" | "kind" | "kindLabel" | "kindShort" | "tone" | "rank" | "projectId" | "projectName" | "clientName" | "waiting">) => {
      const k = KIND[kind];
      exceptions.push({
        ...e,
        id: `${kind}:${project.id}:${e.since.getTime()}`,
        kind,
        kindLabel: k.label,
        kindShort: k.short,
        tone: k.tone,
        rank: k.rank,
        projectId: project.id,
        projectName: project.name,
        clientName: project.client.name,
        waiting: formatWorkingWait(workingHoursBetween(e.since, now)),
      });
    };

    // 1. Client message unanswered for > 4 working hours (an answer = any later staff message).
    const thread = comments.filter((c) => c.projectId === project.id);
    const lastStaff = [...thread].reverse().find((c) => !c.authorClientUserId && c.authorUserId);
    const unanswered = thread.filter((c) => c.authorClientUserId && (!lastStaff || c.createdAt > lastStaff.createdAt));
    if (unanswered.length > 0) {
      const first = unanswered[0];
      const hours = workingHoursBetween(first.createdAt, now);
      if (hours > CLIENT_REPLY_SLA_HOURS) {
        const who = first.clientAuthor?.user.name ?? "The client";
        const quote = first.body.length > 110 ? `${first.body.slice(0, 107)}…` : first.body;
        add("client_waiting", {
          title: `${who} is waiting for a reply`,
          detail: `“${quote}” Unanswered for ${formatWorkingWait(hours)} of working time.`,
          since: first.createdAt,
          action: { label: "Reply", href: cockpit(project.id, "?feed=client") },
        });
      }
    }

    // 2. Failed agent run (latest per agent, only if nothing succeeded after it).
    const seen = new Set<string>();
    for (const run of failedRuns.filter((r) => r.projectId === project.id)) {
      if (seen.has(run.agentId)) continue;
      seen.add(run.agentId);
      add("failed_agent", {
        title: `${run.agent.name} failed`,
        detail: run.decision ?? "The run failed without a message.",
        since: run.createdAt,
        action: { label: "Open project", href: cockpit(project.id, "?feed=activity") },
      });
    }

    // 3. Staffing: no match above the auto-staff threshold (or autopilot off and nobody staffed).
    const staffBlock = plan.blocked.find((b) => b.kind === "staffing_needs_pm");
    if (staffBlock) {
      add("staffing", {
        title: "Staffing needs a PM",
        detail: staffBlock.reason,
        since: project.updatedAt,
        action: { label: "Pick creators", href: cockpit(project.id, "?edit=staffing#staffing") },
      });
    }

    // 4. Out-of-scope items on the estimate.
    const open = jsonArray<UnresolvedNeed>(project.estimate?.unresolvedNeeds).filter((n) => !n.resolution);
    if (open.length > 0) {
      add("out_of_scope", {
        title: `${open.length} item${open.length === 1 ? " needs" : "s need"} manual pricing`,
        detail: `Not on the price list: ${open.map((n) => `“${n.description}”`).join(", ")}.`,
        since: project.estimate!.createdAt,
        action: { label: "Price items", href: cockpit(project.id, "?edit=estimate#estimate") },
      });
    }

    // 5. A draft estimate that autopilot won't send (cap, custom lines, paused).
    const estBlock = plan.blocked.find((b) => b.kind === "estimate_needs_pm");
    if (project.estimate?.status === "DRAFT" && (estBlock || !project.autopilot) && open.length === 0) {
      add("estimate_send", {
        title: `Estimate ready to check · ${project.estimate.totalCredits} credits`,
        detail: estBlock?.reason ?? "Autopilot is paused, so the estimate waits for you to send it.",
        since: project.estimate.createdAt,
        action: { label: "Review estimate", href: cockpit(project.id, "#estimate") },
      });
    }

    // 6. Second change request on the same asset.
    for (const a of assets.filter((x) => x.projectId === project.id)) {
      add("second_change_request", {
        title: `Changes asked again on ${a.name}`,
        detail: `The client has asked for changes ${a.changeRequestCount} times on this asset.`,
        since: a.createdAt,
        action: { label: "Open asset", href: cockpit(project.id, "#production") },
      });
    }

    // 7. Deadline at risk: overdue or due within 24h on the client's side, or due within 3 days before production is done.
    const due = project.dueDate;
    const early = ["briefing", "estimating", "awaiting_approval", "staffing", "production"].includes(state.stage);
    if (state.urgency || (due && early && due.getTime() - now.getTime() < 3 * 86400000)) {
      const days = due ? Math.ceil((due.getTime() - now.getTime()) / 86400000) : null;
      add("deadline_at_risk", {
        title: due ? (days! < 0 ? `Overdue by ${-days!} day${days === -1 ? "" : "s"}` : `Due in ${days} day${days === 1 ? "" : "s"}, still ${state.stage.replace("_", " ")}`) : "Client deadline at risk",
        detail: state.nextAction.label,
        since: project.updatedAt,
        action: { label: "Open project", href: cockpit(project.id) },
      });
    }

    out.push({ project, state, plan, exceptions: exceptions.sort((a, b) => a.rank - b.rank) });
  }
  return out;
}

export function rankExceptions(projects: OpsProject[]) {
  return projects
    .flatMap((p) => p.exceptions)
    .sort((a, b) => a.rank - b.rank || a.since.getTime() - b.since.getTime());
}

/** Health from getProjectState urgency + the project's exceptions — never a placeholder. */
export function projectHealth(p: Pick<OpsProject, "state" | "exceptions">): { label: string; tone: "success" | "watch" | "danger"; reason?: string } {
  if (p.state.urgency === "overdue") return { label: "Off track", tone: "danger", reason: "overdue" };
  const worst = p.exceptions[0];
  if (worst?.tone === "danger") return { label: "Off track", tone: "danger", reason: worst.kind === "client_waiting" ? `client waiting ${worst.waiting}` : worst.kindLabel.toLowerCase() };
  if (p.state.urgency === "at_risk") return { label: "Watch", tone: "watch", reason: "due within 24h" };
  if (worst) return { label: "Watch", tone: "watch", reason: worst.kind === "deadline_at_risk" ? "deadline close" : worst.kindLabel.toLowerCase() };
  return { label: "On track", tone: "success" };
}
