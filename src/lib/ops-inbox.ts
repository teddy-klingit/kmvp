import { prisma } from "@/lib/prisma";
import { getAgencyAttentionItems } from "@/lib/data/agency-attention";

/** The ops Inbox (a Needs-you filter): flagged or failed agent runs nobody has overridden, plus the agency attention items. */
export async function loadInbox() {
  const [attention, flaggedRuns] = await Promise.all([
    getAgencyAttentionItems(),
    prisma.agentRun.findMany({
      where: { status: { in: ["FLAGGED", "FAILED"] }, overridden: false },
      include: { agent: true, client: true, project: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return { attention, flaggedRuns, count: attention.length + flaggedRuns.length };
}
