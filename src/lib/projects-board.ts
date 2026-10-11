import { CLIENT_STAGE_LABEL, formatDay, shortDate, type ClientStage, type ProjectState } from "@/lib/project-state";
import type { ProjectWithStateData } from "@/lib/project-state-loader";
import type { Lane } from "@/lib/board-rules";
import { needsClient, openBriefQuestions } from "@/lib/needs-you";

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

/** Ongoing projects (nav v3, 06): four lanes. Delivered work leaves the board (Finished; files in the Output library). */
export const LANES: { lane: Lane; title: string; hint: string }[] = [
  { lane: "draft", title: "Drafts", hint: "Briefs you are still writing" },
  { lane: "queued", title: "Queued", hint: "Waiting for a free slot" },
  { lane: "active", title: "Active", hint: "Klingit is working" },
  { lane: "in_review", title: "In review", hint: "Your feedback is next" },
];

const ordinal = (n: number) => (n === 1 ? "Next in line" : `${n}${n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"} in line`);

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
  const turn = needsClient({ project, state });
  const base = { id: project.id, lane, name: project.name, meta, href: `/projects/${project.id}`, confidential: project.confidential, needsYou: turn, projectStatus: project.status, quality: null, queuePosition: null, action: null };
  // Whatever lane it's in, when it waits on the client the card says what to do (orange).
  const yours = { label: sentence(state.nextAction.label), tone: "you" as const };

  if (state.paused) return { ...base, stage: state.clientStage, status: { label: "Paused", tone: "paused" }, foot: due, team: team.length ? team : lead };

  switch (state.clientStage) {
    case "draft": {
      const open = openBriefQuestions(project);
      const quality = project.brief?.qualityScore ?? null;
      return {
        ...base,
        stage: "draft",
        href: `/brief/${project.id}`,
        status: open ? { label: `Answer ${open} question${open === 1 ? "" : "s"}`, tone: "you" } : { label: "Not sent yet", tone: "paused" },
        foot: quality != null ? `Brief ${quality}% ready` : `Started ${shortDate(project.createdAt)}`,
        team: [],
      };
    }
    case "queued": {
      const est = project.estimate;
      const position = ctx.queueRank.get(project.id) ?? null;
      const status: BoardCard["status"] =
        est?.status === "SENT"
          ? { label: "Approve estimate", tone: "you" }
          : turn
            ? yours
            : est?.status === "APPROVED"
              ? { label: "Starts when a slot frees", tone: "paused" }
              : state.stage === "briefing"
                ? { label: "Klingit is reviewing the brief", tone: "klingit" }
                : { label: "Klingit is preparing the estimate", tone: "klingit" };
      return {
        ...base,
        stage: "queued",
        queuePosition: position,
        status,
        foot: est?.status === "SENT" ? `${est.totalCredits} team credits` : position ? ordinal(position) : "In the queue",
        team: lead,
      };
    }
    case "active": {
      const eta = state.keyFacts.firstDraftEta;
      const label = eta ? `First draft ${formatDay(eta)}` : state.stage === "staffing" ? "Picking your team" : state.stage === "review" ? "Klingit is revising" : state.stage === "final" ? "Final files on the way" : "In progress";
      const pending = project.estimate?.status === "SENT";
      return { ...base, stage: "active", status: turn ? yours : { label: label === "In progress" ? "Producing" : `Producing · ${label.charAt(0).toLowerCase()}${label.slice(1)}`, tone: "klingit" }, foot: pending ? `${project.estimate!.totalCredits} team credits` : due, team: team.length ? team : lead };
    }
    case "in_review":
      return {
        ...base,
        stage: "in_review",
        href: state.nextAction.href,
        status: yours,
        foot: due,
        team: team.length ? team : lead,
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
