import { CLIENT_STAGE_LABEL, formatDay, shortDate, type ClientStage, type ProjectState } from "@/lib/project-state";
import type { ProjectWithStateData } from "@/lib/project-state-loader";
import type { Lane } from "@/lib/board-rules";

/**
 * The client Projects board (Projects.dc.html): one card per project in its client-stage lane, with one status
 * line in plain words (orange = waiting on you, ink = Klingit working, green = done) and at most one action.
 */

export type CardTone = "you" | "klingit" | "done" | "paused";

export type BoardCard = {
  id: string;
  lane: Lane;
  name: string;
  /** "Campaign · 6 assets" */
  meta: string;
  href: string;
  status: { label: string; tone: CardTone };
  /** "Edited today", "Next in line", "Due 7 Oct", "2 Oct". */
  foot: string;
  team: string[];
  action: { label: string; href: string } | null;
  /** Drafts: briefQuality score. */
  quality: number | null;
  /** Queued: 1-based place in the client's queue. */
  queuePosition: number | null;
  confidential: boolean;
  needsYou: boolean;
  projectStatus: string;
};

export const LANES: { lane: Lane; title: string; hint: string }[] = [
  { lane: "draft", title: "Drafts", hint: "Briefs you are still writing" },
  { lane: "queued", title: "Queued", hint: "Starts when a slot frees up · drag to reorder" },
  { lane: "active", title: "Active", hint: "Klingit is working on these" },
  { lane: "in_review", title: "In review", hint: "Your feedback needed" },
  { lane: "delivered", title: "Delivered", hint: "Last 30 days" },
];

const ordinal = (n: number) => (n === 1 ? "Next in line" : `${n}${n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"} in line`);

function edited(d: Date, now: Date) {
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  return days <= 0 ? "Edited today" : days === 1 ? "Edited yesterday" : `Edited ${shortDate(d)}`;
}

function sentence(label: string) {
  const s = label.replace(/^(Your turn|Klingit): /, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function boardCard(
  { project, state }: { project: ProjectWithStateData; state: ProjectState },
  ctx: { typeLabel: (t: string) => string; accountLead: string | null; queueRank: Map<string, number>; now: Date }
): BoardCard & { stage: ClientStage } {
  const lane = (state.clientStage === "archived" ? "delivered" : state.clientStage) as Lane;
  const assets = project.assets.length;
  const meta = [ctx.typeLabel(project.type), assets ? `${assets} asset${assets === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
  const team = state.keyFacts.staffedTeam.map((m) => m.name);
  const lead = ctx.accountLead ? [ctx.accountLead] : [];
  const due = state.keyFacts.dueDate ? `Due ${shortDate(state.keyFacts.dueDate)}` : "No date yet";
  const turn = state.ballInCourt === "client" && !state.paused;
  const base = { id: project.id, lane, name: project.name, meta, href: `/projects/${project.id}`, confidential: project.confidential, needsYou: turn, projectStatus: project.status, quality: null, queuePosition: null, action: null };

  if (state.paused) return { ...base, stage: state.clientStage, status: { label: "Paused", tone: "paused" }, foot: due, team: team.length ? team : lead };

  switch (state.clientStage) {
    case "draft":
      return {
        ...base,
        stage: "draft",
        href: `/brief/${project.id}`,
        quality: project.brief?.qualityScore ?? null,
        status: { label: project.brief?.qualityScore != null ? "Brief in progress" : "Not started", tone: "you" },
        foot: edited(project.updatedAt, ctx.now),
        team: [],
        action: { label: "Continue brief", href: `/brief/${project.id}` },
      };
    case "queued": {
      const est = project.estimate;
      const position = ctx.queueRank.get(project.id) ?? null;
      const status: BoardCard["status"] =
        est?.status === "SENT"
          ? { label: `Approve estimate · ${est.totalCredits} credits`, tone: "you" }
          : turn
            ? { label: sentence(state.nextAction.label), tone: "you" }
            : est?.status === "APPROVED"
              ? { label: "Approved · starts when a slot frees up", tone: "klingit" }
              : state.stage === "briefing"
                ? { label: "Klingit is reviewing the brief", tone: "klingit" }
                : { label: "Klingit is preparing the estimate", tone: "klingit" };
      return {
        ...base,
        stage: "queued",
        queuePosition: position,
        status,
        foot: position ? ordinal(position) : "In the queue",
        team: lead,
        action: est?.status === "SENT" ? { label: "Review estimate", href: `/projects/${project.id}` } : turn ? { label: state.nextAction.cta ?? "Open", href: state.nextAction.href } : null,
      };
    }
    case "active": {
      const eta = state.keyFacts.firstDraftEta;
      const label = eta ? `First draft ${formatDay(eta)}` : state.stage === "staffing" ? "Picking your team" : state.stage === "review" ? "Klingit is revising" : state.stage === "final" ? "Final files on the way" : "In progress";
      return { ...base, stage: "active", status: { label, tone: "klingit" }, foot: due, team: team.length ? team : lead };
    }
    case "in_review":
      return {
        ...base,
        stage: "in_review",
        href: state.nextAction.href,
        status: { label: sentence(state.nextAction.label), tone: "you" },
        foot: due,
        team: team.length ? team : lead,
        action: { label: state.stage === "final" ? "Sign off" : "Review", href: state.nextAction.href },
      };
    default:
      return {
        ...base,
        stage: state.clientStage,
        status: { label: state.clientStage === "archived" ? CLIENT_STAGE_LABEL.archived : "Signed off", tone: "done" },
        foot: project.deliveredAt ? shortDate(project.deliveredAt) : "Delivered",
        team: team.length ? team : lead,
      };
  }
}
