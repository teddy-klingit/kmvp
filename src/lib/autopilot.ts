import type { InternalRole, ProjectStatus, ProjectType } from "@/generated/prisma";

/**
 * Autopilot rules — pure, like getProjectState. The runner (autopilot-runner.ts) executes what these return.
 *
 * Approved rules (2026-10-01):
 * - Brief: auto-accepted when the brief agent found 0 gaps and every question is answered.
 * - Estimate: auto-generated; auto-sent only when every line is priced from the Price List, nothing is
 *   out of scope, and the total is at most AUTO_SEND_CREDIT_CAP. Otherwise it's a "Needs you" item.
 * - Staffing: auto-staffed and confirmed on client approval when the best match for each needed role
 *   scores at least AUTO_STAFF_THRESHOLD. Otherwise it's a "Needs you" item.
 * - Production, QA and delivery stay manual: no agent produces work today.
 * - Pausing stops every automatic step for that project at once; unpausing doesn't replay skipped steps
 *   (each check only looks at the project's current state, never at a backlog).
 */
export const AUTO_SEND_CREDIT_CAP = 100;
export const AUTO_STAFF_THRESHOLD = 75;

/** Creative roles each project type needs, for auto-staffing (one person per role). */
export const ROLES_FOR_TYPE: Record<ProjectType, InternalRole[]> = {
  CAMPAIGN: ["ART_DIRECTOR", "COPYWRITER", "MOTION_DESIGNER"],
  SINGLE_ASSET: ["ART_DIRECTOR", "COPYWRITER"],
  PRESENTATION: ["ART_DIRECTOR", "COPYWRITER"],
  MOTION_VIDEO: ["MOTION_DESIGNER"],
  DEVELOPMENT: ["ART_DIRECTOR"],
  BRAND_GUIDELINES: ["ART_DIRECTOR", "COPYWRITER"],
  OTHER: ["ART_DIRECTOR"],
};

export type AutopilotInput = {
  status: ProjectStatus;
  autopilot: boolean;
  type: ProjectType;
  brief: { status: string; gaps: number; unansweredQuestions: number } | null;
  estimate: {
    status: string;
    lines: number;
    customLines: number;
    unresolvedNeeds: number;
    totalCredits: number;
  } | null;
  /** True when the estimate agent already failed recently — don't hammer it on every page load. */
  estimateGenerationFailedRecently: boolean;
  team: { confirmed: boolean } | null;
  /** Best candidate score per needed role (missing = nobody with that title). */
  bestScoreByRole: Partial<Record<InternalRole, { name: string; score: number }>>;
  disabledAgents: string[];
};

export type AutopilotStep =
  | { kind: "accept_brief" }
  | { kind: "generate_estimate" }
  | { kind: "send_estimate" }
  | { kind: "auto_staff"; roles: InternalRole[] };

export type AutopilotBlock = { kind: "estimate_needs_pm" | "staffing_needs_pm" | "agent_disabled"; reason: string };

export type AutopilotPlan = { steps: AutopilotStep[]; blocked: AutopilotBlock[] };

const ROLE_NAME: Record<InternalRole, string> = {
  ADMIN: "admin",
  ACCOUNT_LEAD: "account lead",
  PROJECT_MANAGER: "project manager",
  ART_DIRECTOR: "art director",
  COPYWRITER: "copywriter",
  MOTION_DESIGNER: "motion designer",
};

export function planAutopilot(p: AutopilotInput): AutopilotPlan {
  const steps: AutopilotStep[] = [];
  const blocked: AutopilotBlock[] = [];
  if (!p.autopilot || p.status === "PAUSED" || p.status === "DRAFT" || p.status === "ARCHIVED") return { steps, blocked };
  const off = (key: string) => p.disabledAgents.includes(key);

  if (p.status === "BRIEFING" && p.brief && p.brief.status === "SUBMITTED" && p.brief.gaps === 0 && p.brief.unansweredQuestions === 0) {
    if (off("brief_agent")) blocked.push({ kind: "agent_disabled", reason: "Brief agent is disabled, so the brief waits for a PM." });
    else steps.push({ kind: "accept_brief" });
  }

  if (p.status === "ESTIMATING") {
    if (!p.estimate) {
      if (off("estimate_agent")) blocked.push({ kind: "agent_disabled", reason: "Estimate agent is disabled, so the estimate waits for a PM." });
      else if (!p.estimateGenerationFailedRecently) steps.push({ kind: "generate_estimate" });
    } else if (p.estimate.status === "DRAFT") {
      const reasons: string[] = [];
      if (p.estimate.lines === 0) reasons.push("it has no priced lines");
      if (p.estimate.customLines > 0) reasons.push(`${p.estimate.customLines} line${p.estimate.customLines === 1 ? " isn't" : "s aren't"} from the price list`);
      if (p.estimate.unresolvedNeeds > 0) reasons.push(`${p.estimate.unresolvedNeeds} item${p.estimate.unresolvedNeeds === 1 ? " is" : "s are"} out of scope`);
      if (p.estimate.totalCredits > AUTO_SEND_CREDIT_CAP) reasons.push(`${p.estimate.totalCredits} credits is over the ${AUTO_SEND_CREDIT_CAP}-credit auto-send cap`);
      if (reasons.length) blocked.push({ kind: "estimate_needs_pm", reason: `Not sent automatically: ${reasons.join(", ")}.` });
      else steps.push({ kind: "send_estimate" });
    }
  }

  if (p.status === "STAFFING" && !p.team?.confirmed) {
    const roles = ROLES_FOR_TYPE[p.type];
    const weak = roles.filter((r) => (p.bestScoreByRole[r]?.score ?? 0) < AUTO_STAFF_THRESHOLD);
    if (off("staffing_agent")) blocked.push({ kind: "agent_disabled", reason: "Staffing agent is disabled, so staffing waits for a PM." });
    else if (weak.length === 0) steps.push({ kind: "auto_staff", roles });
    else {
      const r = weak[0];
      const best = p.bestScoreByRole[r];
      blocked.push({
        kind: "staffing_needs_pm",
        reason: best
          ? `No strong match for ${/^[aeiou]/.test(ROLE_NAME[r]) ? "an" : "a"} ${ROLE_NAME[r]}: top candidate ${best.name} scores ${best.score} (below the ${AUTO_STAFF_THRESHOLD} auto-staff threshold).`
          : `Nobody on the team is ${/^[aeiou]/.test(ROLE_NAME[r]) ? "an" : "a"} ${ROLE_NAME[r]}.`,
      });
    }
  }

  return { steps, blocked };
}

/** What autopilot (or the team) does next, for the "Running automatically" table. */
export function nextAutomatedStep(args: {
  status: ProjectStatus;
  autopilot: boolean;
  estimateStatus: string | null;
}): string {
  if (!args.autopilot) return "Autopilot paused · PM drives each step";
  if (args.status === "ESTIMATING" && args.estimateStatus === "SENT") return "Auto-staff on approval";
  switch (args.status) {
    case "BRIEFING":
      return "Brief agent accepts the brief once complete";
    case "ESTIMATING":
      return args.estimateStatus === "DRAFT" ? "Estimate sent when it passes the checks" : "Estimate agent prices the brief";
    case "STAFFING":
      return "Auto-staff when every role has a strong match";
    case "IN_PRODUCTION":
    case "QA":
      return "Team delivers the first draft";
    case "AWAITING_REVIEW":
      return "Client reviews the first draft";
    case "IN_FEEDBACK":
      return "Client signs off the final delivery";
    default:
      return "Nothing scheduled";
  }
}
