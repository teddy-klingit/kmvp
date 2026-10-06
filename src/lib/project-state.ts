import type { AssetStatus, BriefStatus, EstimateStatus, PipelineStageName, ProjectStatus } from "@/generated/prisma";
import { jsonArray } from "@/lib/utils";

/**
 * The single source of truth for where a project stands, for every
 * client-facing surface (board, dashboard, every project tab). Pure: callers
 * pass the data in; nothing here touches the database, so each stage is
 * trivially testable.
 *
 * Project.status plus the brief / estimate / team / asset records decide the
 * stage. PipelineStage rows are only used for dates — they drift from
 * Project.status in practice, so they never decide what stage we're in.
 */

export type ProjectStage =
  | "briefing"
  | "estimating"
  | "awaiting_approval"
  | "staffing"
  | "production"
  | "review"
  | "final"
  | "closed";

export const PROJECT_STAGES: ProjectStage[] = [
  "briefing",
  "estimating",
  "awaiting_approval",
  "staffing",
  "production",
  "review",
  "final",
  "closed",
];

export const STAGE_LABEL: Record<ProjectStage, string> = {
  briefing: "Brief",
  estimating: "Estimate",
  awaiting_approval: "Approval",
  staffing: "Staffing",
  production: "Production",
  review: "Review",
  final: "Sign-off",
  closed: "Delivered",
};

/** The one status label every client badge shows for a project: its client stage, never an internal one. */
export function stageStatusText(state: Pick<ProjectState, "clientStage" | "paused" | "archived">) {
  if (state.archived) return "Archived";
  if (state.paused) return "Paused";
  return CLIENT_STAGE_LABEL[state.clientStage];
}

/** Committed rule: first draft within this many business days of staffing being confirmed. */
export const FIRST_DRAFT_BUSINESS_DAYS = 2;
/** A client-side deadline this close counts as SLA risk on the dashboard. */
export const SLA_RISK_WINDOW_MS = 24 * 60 * 60 * 1000;


export type ProjectStateInput = {
  id: string;
  status: ProjectStatus;
  pausedFromStatus: ProjectStatus | null;
  dueDate: Date | null;
  deliveredAt: Date | null;
  creditsQuoted: number | null;
  /** When the project took one of the client's active slots (null while queued or still a draft). */
  activatedAt: Date | null;
  brief: {
    status: BriefStatus;
    rawIntake: string | null;
    gapsFlagged: unknown;
    /** briefQuality() score saved by the Brief studio. */
    qualityScore: number | null;
    /** Brief studio sections; any means the studio has started this brief. */
    sections: unknown;
    acceptedAt: Date | null;
  } | null;
  estimate: {
    status: EstimateStatus;
    totalCredits: number;
    sentAt: Date | null;
    expiresAt: Date | null;
    respondedAt: Date | null;
  } | null;
  team: { confirmed: boolean; confirmedAt: Date | null; members: { name: string; role: string }[] } | null;
  assets: { status: AssetStatus }[];
  pipelineStages: { name: PipelineStageName; completedAt: Date | null; etaAt: Date | null }[];
};

/** intake = nothing written yet; studio = a brief in the Brief studio, with its quality score. */
export type BriefProgress = { mode: "intake" } | { mode: "studio"; score: number | null };

export type NextAction = { label: string; description: string; href: string; cta?: string; dueAt?: Date };

export type TimelineStep = { stage: ProjectStage; label: string; status: "done" | "current" | "upcoming"; date?: Date };

/**
 * What a client sees (the board's lanes, every badge): draft = brief not sent; queued = sent, waiting for the
 * estimate's approval and/or a free active slot; active = holding a slot (staffing and production);
 * in_review = something waits on the client's feedback or sign-off; delivered = signed off in the last 30 days.
 * The 8 internal stages are for ops only.
 */
export type ClientStage = "draft" | "queued" | "active" | "in_review" | "delivered" | "archived";
export const CLIENT_STAGES: Exclude<ClientStage, "archived">[] = ["draft", "queued", "active", "in_review", "delivered"];
export const CLIENT_STAGE_LABEL: Record<ClientStage, string> = { draft: "Draft", queued: "Queued", active: "Active", in_review: "In review", delivered: "Delivered", archived: "Archived" };
export const DELIVERED_WINDOW_DAYS = 30;

export type ProjectState = {
  stage: ProjectStage;
  clientStage: ClientStage;
  /** "none" once the project is closed — nobody owes anything. */
  ballInCourt: "client" | "klingit" | "none";
  paused: boolean;
  archived: boolean;
  /** Still the client's private draft — nothing has been sent to Klingit yet. */
  draft: boolean;
  nextAction: NextAction;
  timeline: TimelineStep[];
  keyFacts: {
    dueDate?: Date;
    credits?: number;
    firstDraftEta?: Date;
    staffedTeam: { name: string; role: string }[];
  };
  brief: BriefProgress;
  /** Assets the client can act on right now — review buttons only render when this is > 0. */
  assetsAwaitingReview: number;
  /** Dashboard placement for client-turn items: overdue or due within 24h is urgent. */
  urgency: "overdue" | "at_risk" | null;
};

export function getBriefProgress(brief: ProjectStateInput["brief"]): BriefProgress {
  if (!brief) return { mode: "intake" };
  if (!brief.rawIntake && jsonArray(brief.sections).length === 0) return { mode: "intake" };
  return { mode: "studio", score: brief.qualityScore };
}

export function addBusinessDays(from: Date, days: number) {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

/** Deadlines are days, not instants: something due today isn't overdue until the day ends. */
export function endOfDay(d: Date) {
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function formatDay(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

type StageCore = { stage: ProjectStage; ballInCourt: ProjectState["ballInCourt"]; nextAction: NextAction };

function stageFor(input: ProjectStateInput, status: ProjectStatus, brief: BriefProgress, firstDraftEta: Date | null): StageCore {
  const base = `/projects/${input.id}`;
  const inReview = input.assets.filter((a) => a.status === "IN_REVIEW").length;
  const changesAsked = input.assets.filter((a) => a.status === "CHANGES_REQUESTED").length;
  const etaText = firstDraftEta
    ? `First draft by ${formatDay(firstDraftEta)}.`
    : `First draft within ${FIRST_DRAFT_BUSINESS_DAYS} business days of your team being confirmed.`;

  switch (status) {
    case "DRAFT":
    case "BRIEFING": {
      // The brief is written in the Brief studio until the client sends it.
      const briefHref = `/brief/${input.id}`;
      const accepted = input.brief?.status === "ACCEPTED";
      const drafting = !accepted && (!input.brief || input.brief.status === "DRAFT");
      if (drafting && brief.mode === "intake") {
        return {
          stage: "briefing",
          ballInCourt: "client",
          nextAction: {
            label: "Your turn: tell us what you need",
            description: "Describe it in your own words. The brief agent fills in what it already knows and asks only what's missing.",
            href: briefHref,
            cta: "Start brief",
          },
        };
      }
      if (drafting && brief.mode === "studio") {
        const score = brief.score;
        return {
          stage: "briefing",
          ballInCourt: "client",
          nextAction: {
            label: "Your turn: finish your brief",
            description: score !== null ? `Brief quality ${score} · ${score >= 80 ? "Great" : score >= 50 ? "Good" : "Needs more"}. Send it when you're ready; Klingit fills any gaps.` : "Pick up where you left off.",
            href: briefHref,
            cta: "Continue brief",
          },
        };
      }
      const gaps = jsonArray<string>(input.brief?.gapsFlagged);
      if (input.brief?.status === "GAPS_FLAGGED") {
        return {
          stage: "briefing",
          ballInCourt: "client",
          nextAction: {
            label: gaps.length ? `Your turn: add ${plural(gaps.length, "missing detail")}` : "Your turn: add more detail to your brief",
            description: gaps[0] ?? "Your account lead needs a bit more information before they can estimate.",
            href: briefHref,
            cta: "Update brief",
          },
        };
      }
      return {
        stage: "briefing",
        ballInCourt: "klingit",
        nextAction: {
          label: "Klingit: reviewing your brief",
          description: "Next, you'll get an estimate to approve — or a follow-up question if anything is unclear.",
          href: base,
        },
      };
    }

    case "ESTIMATING": {
      const estimateHref = base;
      const est = input.estimate;
      if (est?.status === "SENT") {
        return {
          stage: "awaiting_approval",
          ballInCourt: "client",
          nextAction: {
            label: `Your turn: approve estimate (${plural(est.totalCredits, "credit")})`,
            description: "Review the scope and approve it so Klingit can staff your team.",
            href: estimateHref,
            cta: "Review estimate",
            dueAt: est.expiresAt ?? undefined,
          },
        };
      }
      if (est?.status === "APPROVED") return stageFor(input, "STAFFING", brief, firstDraftEta);
      if (est?.status === "CHANGES_REQUESTED") {
        return {
          stage: "estimating",
          ballInCourt: "klingit",
          nextAction: {
            label: "Klingit: revising your estimate",
            description: "You asked for changes — a revised estimate is on its way.",
            href: `${base}/scope#estimate`,
          },
        };
      }
      if (est?.status === "EXPIRED") {
        return {
          stage: "estimating",
          ballInCourt: "klingit",
          nextAction: {
            label: "Klingit: refreshing your estimate",
            description: "The last estimate expired before it was approved. Klingit will send an updated one.",
            href: `${base}/scope#estimate`,
          },
        };
      }
      return {
        stage: "estimating",
        ballInCourt: "klingit",
        nextAction: {
          label: "Klingit: preparing your estimate",
          description: "Scoping your brief against the Klingit price list.",
          href: base,
        },
      };
    }

    case "STAFFING":
      return {
        stage: "staffing",
        ballInCourt: "klingit",
        nextAction: { label: "Klingit: picking your team", description: etaText, href: base, dueAt: firstDraftEta ?? undefined },
      };

    case "IN_PRODUCTION":
    case "QA":
      return {
        stage: "production",
        ballInCourt: "klingit",
        nextAction: {
          label: "Klingit: producing your first draft",
          description: etaText,
          href: base,
          dueAt: firstDraftEta ?? undefined,
        },
      };

    case "AWAITING_REVIEW": {
      const reviewHref = base;
      if (inReview > 0) {
        return {
          stage: "review",
          ballInCourt: "client",
          nextAction: {
            label: `Your turn: review ${plural(inReview, "asset")}`,
            description: "Approve each asset or comment directly on it to ask for changes.",
            // The review itself (one full-screen review per format), not the project page.
            href: base.replace("/projects/", "/review/"),
            cta: "Review assets",
          },
        };
      }
      return {
        stage: "review",
        ballInCourt: "klingit",
        nextAction: changesAsked
          ? {
              label: `Klingit: revising ${plural(changesAsked, "asset")}`,
              description: "You'll be asked to review again once the changes are in.",
              href: reviewHref,
            }
          : { label: "Klingit: preparing your delivery", description: "Your assets will appear here for review.", href: reviewHref },
      };
    }

    case "IN_FEEDBACK":
      if (inReview > 0 || changesAsked > 0) {
        return {
          stage: "final",
          ballInCourt: "klingit",
          nextAction: {
            label: "Klingit: applying your feedback",
            description: "Final files follow once every change is in.",
            href: `${base}/work`,
          },
        };
      }
      return {
        stage: "final",
        ballInCourt: "client",
        nextAction: {
          label: "Your turn: sign off on the final delivery",
          description: "Check the delivered work, rate it, and sign off to close the project.",
          href: base,
          cta: "Sign off",
        },
      };

    case "DELIVERED":
    case "ARCHIVED":
    case "PAUSED":
      return {
        stage: "closed",
        ballInCourt: "none",
        nextAction: {
          label: status === "ARCHIVED" ? "Archived" : "Delivered",
          description: input.deliveredAt ? `Delivered ${formatDay(input.deliveredAt)}.` : "This project is closed.",
          href: base,
        },
      };
  }
}

function stageDates(input: ProjectStateInput, firstDraftEta: Date | null) {
  const row = (name: PipelineStageName) => input.pipelineStages.find((s) => s.name === name);
  const done: Partial<Record<ProjectStage, Date | null | undefined>> = {
    briefing: input.brief?.acceptedAt ?? row("BRIEF")?.completedAt,
    estimating: input.estimate?.sentAt ?? row("ESTIMATE")?.completedAt,
    awaiting_approval: input.estimate?.status === "APPROVED" ? input.estimate.respondedAt : null,
    staffing: input.team?.confirmedAt ?? row("STAFFING")?.completedAt,
    production: row("QA")?.completedAt ?? row("PRODUCTION")?.completedAt,
    review: row("FEEDBACK")?.completedAt,
    final: row("FINAL_DELIVERY")?.completedAt ?? input.deliveredAt,
    closed: input.deliveredAt,
  };
  const eta: Partial<Record<ProjectStage, Date | null | undefined>> = {
    awaiting_approval: input.estimate?.status === "SENT" ? input.estimate.expiresAt : null,
    production: firstDraftEta ?? row("PRODUCTION")?.etaAt,
    review: row("FIRST_DRAFT_DELIVERY")?.etaAt,
    final: row("FINAL_DELIVERY")?.etaAt,
  };
  return { done, eta };
}

export function getProjectState(input: ProjectStateInput, now: Date = new Date()): ProjectState {
  const paused = input.status === "PAUSED";
  const archived = input.status === "ARCHIVED";
  const effectiveStatus: ProjectStatus = paused ? (input.pausedFromStatus ?? "BRIEFING") : input.status;

  const brief = getBriefProgress(input.brief);
  // Once the first draft has been delivered (its stage completed) there's no first-draft date left to keep or miss.
  const draftDelivered = input.pipelineStages.some((s) => s.name === "FIRST_DRAFT_DELIVERY" && s.completedAt);
  const firstDraftEta =
    !draftDelivered && input.team?.confirmed && input.team.confirmedAt ? addBusinessDays(input.team.confirmedAt, FIRST_DRAFT_BUSINESS_DAYS) : null;
  const estimateCredits =
    input.estimate && (input.estimate.status === "SENT" || input.estimate.status === "APPROVED")
      ? input.estimate.totalCredits
      : null;
  const credits = estimateCredits ?? input.creditsQuoted ?? null;

  const core = stageFor(input, effectiveStatus, brief, firstDraftEta);
  let { ballInCourt, nextAction } = core;
  const { stage } = core;

  if (paused) {
    ballInCourt = "client";
    nextAction = {
      label: "Paused — resume to continue",
      description: `Paused during ${STAGE_LABEL[stage].toLowerCase()}. Nothing moves until you resume it.`,
      href: `/projects/${input.id}`,
      cta: "Resume",
    };
  }

  const currentIndex = PROJECT_STAGES.indexOf(stage);
  const { done, eta } = stageDates(input, firstDraftEta);
  const timeline: TimelineStep[] = PROJECT_STAGES.map((s, i) => {
    const status: TimelineStep["status"] =
      stage === "closed" || i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
    const date = status === "done" ? done[s] : eta[s];
    return { stage: s, label: STAGE_LABEL[s], status, ...(date ? { date } : {}) };
  });

  const assetsAwaitingReview = stage === "review" ? input.assets.filter((a) => a.status === "IN_REVIEW").length : 0;

  let urgency: ProjectState["urgency"] = null;
  if (ballInCourt === "client" && !paused) {
    const deadline = nextAction.dueAt ?? input.dueDate ?? null;
    const end = deadline ? endOfDay(deadline).getTime() : null;
    if (end !== null && end < now.getTime()) urgency = "overdue";
    else if (end !== null && end - now.getTime() <= SLA_RISK_WINDOW_MS) urgency = "at_risk";
  }

  return {
    stage,
    clientStage: clientStageFor(input, stage, ballInCourt, archived, now),
    ballInCourt,
    paused,
    archived,
    draft: effectiveStatus === "DRAFT",
    nextAction,
    timeline,
    keyFacts: {
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
      ...(credits !== null ? { credits } : {}),
      ...(firstDraftEta ? { firstDraftEta } : {}),
      staffedTeam: input.team?.confirmed ? input.team.members : [],
    },
    brief,
    assetsAwaitingReview,
    urgency,
  };
}

/** Where a client-turn project item goes on the dashboard — each item lands in exactly one list. */
export function attentionBucket(state: ProjectState): "urgent" | "needs_input" | null {
  if (state.ballInCourt !== "client" || state.paused || state.archived) return null;
  return state.urgency ? "urgent" : "needs_input";
}

export type BoardColumn = "Briefing" | "Estimate" | "In production" | "In review" | "Sign-off" | "Delivered" | "Paused" | "Archived";

export const BOARD_COLUMNS: BoardColumn[] = [
  "Briefing",
  "Estimate",
  "In production",
  "In review",
  "Sign-off",
  "Delivered",
  "Paused",
  "Archived",
];

export function boardColumnFor(state: ProjectState): BoardColumn {
  if (state.archived) return "Archived";
  if (state.paused) return "Paused";
  switch (state.stage) {
    case "briefing":
      return "Briefing";
    case "estimating":
    case "awaiting_approval":
      return "Estimate";
    case "staffing":
    case "production":
      return "In production";
    case "review":
      return "In review";
    case "final":
      return "Sign-off";
    case "closed":
      return "Delivered";
  }
}

export type LegacyTab = "brief" | "estimate" | "timeline" | "assets" | "review" | "final" | "discussion" | "team";

/**
 * Where an old 9-tab URL lives now. Stage-aware so old links (e.g. in
 * notifications) land where the client can act: the Overview while that step
 * is current, otherwise the tab that holds the record.
 */
export function legacyTabRedirect(tab: LegacyTab, projectId: string, state: Pick<ProjectState, "stage">) {
  const base = `/projects/${projectId}`;
  switch (tab) {
    case "brief":
      return state.stage === "briefing" ? base : `${base}/scope`;
    case "estimate":
      return state.stage === "awaiting_approval" ? base : `${base}/scope#estimate`;
    case "review":
      return state.stage === "review" ? `/review/${projectId}` : `${base}/work`;
    case "final":
      return state.stage === "final" ? base : `${base}/work`;
    case "assets":
      return `${base}/work`;
    case "timeline":
      return base;
    case "discussion":
      return `${base}?channel=klingit`;
    case "team":
      return `${base}?share=1`;
  }
}

// ---------------------------------------------------------------------------
// Client milestones — the 5-step timeline in the client project header.
// ---------------------------------------------------------------------------

export type MilestoneStatus = "done" | "current" | "upcoming";
export type Milestone = { key: string; label: string; status: MilestoneStatus; caption?: string };

/** The client board's five lanes and the header timeline: the client stages (Projects.dc.html). */
export const CLIENT_COLUMNS = CLIENT_STAGES.map((c) => CLIENT_STAGE_LABEL[c]);

/** Which client lane a project sits in. Paused projects stay in their lane; archived ones aren't on the board. */
export function clientColumnFor(state: ProjectState): string | null {
  if (state.clientStage === "archived") return null;
  return CLIENT_STAGE_LABEL[state.clientStage];
}

export function clientStageFor(
  input: Pick<ProjectStateInput, "brief" | "activatedAt" | "deliveredAt">,
  stage: ProjectStage,
  ballInCourt: ProjectState["ballInCourt"],
  archived: boolean,
  now: Date
): ClientStage {
  if (archived) return "archived";
  if (stage === "closed") {
    if (!input.deliveredAt) return "delivered";
    return now.getTime() - input.deliveredAt.getTime() <= DELIVERED_WINDOW_DAYS * 86400000 ? "delivered" : "archived";
  }
  if (stage === "briefing" && (!input.brief || input.brief.status === "DRAFT")) return "draft";
  if ((stage === "review" || stage === "final") && ballInCourt === "client") return "in_review";
  return input.activatedAt ? "active" : "queued";
}

/** Short date like "1 Oct" / "30 Sept" — the timeline's caption format. */
export function shortDate(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
}

function nowCaption(state: ProjectState): string {
  const { stage, ballInCourt, brief, nextAction, keyFacts } = state;
  switch (stage) {
    case "briefing":
      if (ballInCourt !== "client") return "Now · reviewing";
      if (brief.mode === "studio" && brief.score !== null) return `Now · quality ${brief.score}`;
      return "Now · your input";
    case "estimating":
      return "Now · pricing";
    case "awaiting_approval":
      return nextAction.dueAt ? `Now · by ${shortDate(nextAction.dueAt)}` : "Now · your approval";
    case "staffing":
      return state.clientStage === "queued" ? "Now · waiting for a slot" : "Now · picking your team";
    case "production":
      return keyFacts.firstDraftEta ? `Now · draft ${shortDate(keyFacts.firstDraftEta)}` : "Now · in progress";
    case "review":
      return state.assetsAwaitingReview > 0
        ? `Now · ${state.assetsAwaitingReview} to review`
        : "Now · revising";
    case "final":
      return ballInCourt === "client" ? "Now · sign-off" : "Now · final files";
    case "closed":
      return "Delivered";
  }
}

/** The 8 internal stages folded into the 5 client stages, as the header timeline. */
export function clientMilestones(state: ProjectState): Milestone[] {
  const byStage = new Map(state.timeline.map((t) => [t.stage, t]));
  // An archived project shows how far it got; one delivered over 30 days ago shows as delivered.
  const shown: Exclude<ClientStage, "archived"> =
    state.clientStage !== "archived" ? state.clientStage : state.stage === "closed" ? "delivered" : state.stage === "briefing" ? "draft" : "queued";
  const currentIndex = CLIENT_STAGES.indexOf(shown);
  const closed = state.stage === "closed";
  const dateOf = (...stages: ProjectStage[]) => stages.map((st) => byStage.get(st)?.date).find(Boolean);

  return CLIENT_STAGES.map((key, i) => {
    const status: MilestoneStatus = closed || i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
    let caption: string | undefined;
    if (status === "done") {
      const d = { draft: dateOf("briefing"), queued: dateOf("awaiting_approval", "estimating"), active: dateOf("production", "staffing"), in_review: dateOf("final", "review"), delivered: dateOf("closed") }[key];
      const verb = { draft: "Sent", queued: "Started", active: "First draft", in_review: "Signed off", delivered: "Delivered" }[key];
      caption = d ? `${verb} ${shortDate(d)}` : undefined;
    } else if (status === "current") {
      caption = nowCaption(state);
    } else if (key === "active") {
      caption = state.keyFacts.firstDraftEta ? `Est. ${shortDate(state.keyFacts.firstDraftEta)}` : `First draft ≤ ${FIRST_DRAFT_BUSINESS_DAYS} days`;
    } else if (key === "in_review") {
      const eta = byStage.get("review")?.date;
      caption = eta ? `Est. ${shortDate(eta)}` : undefined;
    } else if (key === "delivered") {
      caption = state.keyFacts.dueDate ? `Due ${shortDate(state.keyFacts.dueDate)}` : undefined;
    }
    return { key, label: CLIENT_STAGE_LABEL[key], status, ...(caption ? { caption } : {}) };
  });
}

/** The header pill text + whether it's the client's turn (turn tone) — one place for both portal and tests. */
export function clientStatusPill(state: ProjectState): { label: string; tone: "turn" | "neutral" | "success" | "watch" } {
  if (state.archived) return { label: "Archived", tone: "neutral" };
  if (state.paused) return { label: "Paused", tone: "watch" };
  if (state.clientStage === "delivered" || state.clientStage === "archived") return { label: CLIENT_STAGE_LABEL[state.clientStage], tone: state.clientStage === "delivered" ? "success" : "neutral" };
  return { label: CLIENT_STAGE_LABEL[state.clientStage], tone: state.ballInCourt === "client" ? "turn" : "neutral" };
}
