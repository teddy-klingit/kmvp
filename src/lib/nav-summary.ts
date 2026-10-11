import { cache } from "react";
import { loadProjectStates } from "@/lib/project-state-loader";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { creditSummary, yourTurn } from "@/lib/client-home";
import { aiCreditStatus } from "@/lib/ai-credits";

/**
 * What the client nav shows on every page: the Home badge (things that need you, the same rule as Home's "Needs
 * you") and the profile menu's plan chip (team credits left, AI credits left this month).
 */
export const loadNavSummary = cache(async (viewer: { id: string; clientId: string }) => {
  const [items, team, ai] = await Promise.all([
    loadProjectStates({ status: { not: "ARCHIVED" }, agentBuild: false, ...projectVisibilityWhere(viewer.id) }, viewer.clientId),
    creditSummary(viewer.clientId),
    aiCreditStatus(viewer.clientId),
  ]);
  return {
    needsYou: yourTurn(items).length,
    plan: ai.plan.name || "Your",
    team: { left: team.free, allowance: team.allowance },
    ai: { left: Math.floor(ai.left), allowance: ai.allowance, ownModel: ai.ownModel },
  };
});
export type NavSummary = Awaited<ReturnType<typeof loadNavSummary>>;
