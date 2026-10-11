import { jsonArray } from "@/lib/utils";
import type { ProjectState } from "@/lib/project-state";

/**
 * "Needs you" (Home, the Home badge, the Ongoing projects board): the client has to do something. A draft brief
 * only needs them when the Brief assistant asked a question they haven't answered; an untouched draft just waits.
 */
export function openBriefQuestions(project: { brief?: { questionsLog: unknown } | null }) {
  return jsonArray<{ answeredAt?: string }>(project.brief?.questionsLog).filter((q) => !q.answeredAt).length;
}

export function needsClient({ project, state }: { project: { brief?: { questionsLog: unknown } | null }; state: ProjectState }) {
  if (state.ballInCourt !== "client" || state.paused || state.archived || state.stage === "closed") return false;
  if (state.draft) return openBriefQuestions(project) > 0;
  return true;
}
