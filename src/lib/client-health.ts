import { prisma } from "@/lib/prisma";
import { loadOpsProjects, type OpsProject } from "@/lib/ops-exceptions";
import { platformStatus } from "@/lib/brand-completeness";
import { endOfDay } from "@/lib/project-state";

/**
 * Client health for ops (OpsClients.dc.html), computed from what's happening now, never the stored
 * Client.healthScore. Starts at 100 and loses points for what puts the account at risk; under 75 is
 * "At risk" (the same threshold as Needs you).
 */
export const AT_RISK_BELOW = 75;
const DAY = 86400000;

export type ClientHealth = { score: number; atRisk: boolean; reasons: string[] };

type HealthInput = {
  projects: OpsProject[];
  creditBalance: number;
  monthlyCreditAllowance: number;
  renewalDate: Date | null;
  brandDone: number;
};

export function healthFrom(i: HealthInput, now = new Date()): ClientHealth {
  const reasons: string[] = [];
  let score = 100;
  const hit = (points: number, why: string) => {
    score -= points;
    reasons.push(why);
  };

  const overdue = i.projects.filter(({ state }) => state.stage !== "closed" && !state.paused && state.keyFacts.dueDate && endOfDay(state.keyFacts.dueDate) < now).length;
  if (overdue) hit(Math.min(30, overdue * 15), `${overdue} project${overdue === 1 ? "" : "s"} past due`);

  const exceptions = i.projects.flatMap((p) => p.exceptions);
  const serious = exceptions.filter((e) => e.kind === "client_waiting" || e.kind === "failed_agent" || e.kind === "deadline_at_risk").length;
  const other = exceptions.length - serious;
  if (serious) hit(Math.min(30, serious * 10), `${serious} waiting or at-risk item${serious === 1 ? "" : "s"}`);
  if (other) hit(Math.min(15, other * 5), `${other} open item${other === 1 ? "" : "s"} for the PM`);

  if (i.creditBalance < 0) hit(15, "credit balance below zero");
  else if (i.monthlyCreditAllowance > 0 && i.creditBalance < i.monthlyCreditAllowance * 0.1) hit(10, "under 10% of credits left");

  if (i.renewalDate) {
    const days = (i.renewalDate.getTime() - now.getTime()) / DAY;
    if (days >= 0 && days <= 14) hit(10, "renews within 2 weeks");
    else if (days > 14 && days <= 30) hit(5, "renews within a month");
  }

  if (i.brandDone < 3) hit(5, "Brand OS mostly unwritten");

  const clamped = Math.max(0, Math.min(100, score));
  return { score: clamped, atRisk: clamped < AT_RISK_BELOW, reasons };
}

/** Health for every client, from one load of the active projects. */
export async function clientHealthMap(now = new Date()) {
  const [projects, clients] = await Promise.all([
    loadOpsProjects({}, now),
    prisma.client.findMany({ include: { brandOS: true } }),
  ]);
  return new Map(
    clients.map((c) => [
      c.id,
      healthFrom(
        {
          projects: projects.filter((p) => p.project.clientId === c.id),
          creditBalance: c.creditBalance,
          monthlyCreditAllowance: c.monthlyCreditAllowance,
          renewalDate: c.renewalDate,
          brandDone: platformStatus({ brandSummary: c.brandSummary, brandOS: c.brandOS }).done,
        },
        now
      ),
    ])
  );
}
