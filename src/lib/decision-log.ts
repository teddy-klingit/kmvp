import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

export type DecisionArea = "brief" | "estimate" | "staffing" | "dates" | "assets" | "autopilot";

/**
 * Every PM edit and every automatic step writes one row: who (null = autopilot), area, action,
 * before → after and the reason. When a PM edit overrides an agent's decision, the latest
 * un-overridden run of that agent on the project is marked overridden too, and linked.
 */
export async function logDecision(args: {
  projectId: string;
  actorUserId: string | null;
  area: DecisionArea;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  overridesAgentKey?: string;
}) {
  let agentRunId: string | null = null;
  if (args.overridesAgentKey && args.actorUserId) {
    const run = await prisma.agentRun.findFirst({
      where: { projectId: args.projectId, agent: { key: args.overridesAgentKey }, overridden: false, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
    });
    if (run) {
      agentRunId = run.id;
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { overridden: true, overriddenByUserId: args.actorUserId, overrideReason: args.reason ?? args.action },
      });
    }
  }
  return prisma.decisionLog.create({
    data: {
      projectId: args.projectId,
      actorUserId: args.actorUserId,
      area: args.area,
      action: args.action,
      before: (args.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (args.after ?? undefined) as Prisma.InputJsonValue | undefined,
      reason: args.reason ?? null,
      agentRunId,
    },
  });
}
