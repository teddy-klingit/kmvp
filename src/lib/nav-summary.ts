import { cache } from "react";
import { loadProjectStates } from "@/lib/project-state-loader";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { creditSummary, yourTurn } from "@/lib/client-home";
import { aiCreditStatus } from "@/lib/ai-credits";
import { planTurns } from "@/lib/plan";
import { teamBalances } from "@/lib/team-ledger";
import { marketingPm } from "@/lib/contact-person";

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
  const [plan, balances, pm] = await Promise.all([planTurns(viewer.clientId), teamBalances(viewer.clientId), marketingPm(viewer.clientId)]);
  return {
    needsYou: yourTurn(items).length + plan.length,
    plan: ai.plan.name || "Your",
    team: { left: team.free, allowance: team.allowance },
    // Phase S: on a contract, the PM and creative balances separately (never pooled), and the Marketing PM.
    pools: balances ? { pm: { left: balances.pm.left, monthly: balances.pm.monthly }, creative: { left: balances.creative.left, monthly: balances.creative.monthly } } : null,
    marketingPm: pm ? { name: pm.name, messageHref: pm.messageHref } : null,
    // Rounded like every other screen (Home, Skills, Usage), so the numbers match.
    ai: { left: Math.round(ai.left), allowance: ai.allowance, ownModel: ai.ownModel },
  };
});
export type NavSummary = Awaited<ReturnType<typeof loadNavSummary>>;
