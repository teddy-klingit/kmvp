import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export type AttentionItem = {
  id: string;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  title: string;
  detail: string;
  urgency: "high" | "medium" | "low";
  href: string;
};

export async function getAgencyAttentionItems(accountLeadId?: string): Promise<AttentionItem[]> {
  const projects = await prisma.project.findMany({
    where: {
      status: { notIn: ["ARCHIVED", "DELIVERED"] },
      ...(accountLeadId ? { client: { accountLeadId } } : {}),
    },
    include: {
      client: true,
      brief: true,
      estimate: true,
      pipelineStages: true,
      assets: true,
    },
  });

  const items: AttentionItem[] = [];

  for (const p of projects) {
    const href = `/ops/clients/${p.clientId}/delivery`;
    if (p.brief?.status === "GAPS_FLAGGED") {
      items.push({
        id: `${p.id}-brief`,
        clientId: p.clientId,
        clientName: p.client.name,
        projectId: p.id,
        projectName: p.name,
        title: "Brief gaps flagged",
        detail: "Brief agent found missing fields — request from client or accept as-is.",
        urgency: "medium",
        href,
      });
    }
    if (p.estimate?.status === "DRAFT") {
      items.push({
        id: `${p.id}-estimate`,
        clientId: p.clientId,
        clientName: p.client.name,
        projectId: p.id,
        projectName: p.name,
        title: "Estimate ready to send",
        detail: `${p.estimate.totalCredits}c scoped — send to client for approval.`,
        urgency: "medium",
        href,
      });
    }
    const qaStage = p.pipelineStages.find((s) => s.name === "QA" && s.status === "ACTIVE");
    if (qaStage) {
      const flagged = p.assets.length - p.assets.filter((a) => a.status === "APPROVED").length;
      if (flagged > 0) {
        items.push({
          id: `${p.id}-qa`,
          clientId: p.clientId,
          clientName: p.client.name,
          projectId: p.id,
          projectName: p.name,
          title: `${flagged} QA flags to resolve`,
          detail: "QA agent found brand-compliance issues.",
          urgency: "high",
          href,
        });
      }
    }
    if (p.dueDate && p.dueDate.getTime() < Date.now() && p.status !== "AWAITING_REVIEW") {
      items.push({
        id: `${p.id}-overdue`,
        clientId: p.clientId,
        clientName: p.client.name,
        projectId: p.id,
        projectName: p.name,
        title: "Past due date",
        detail: `Was due ${formatDate(p.dueDate)} — still ${p.status.toLowerCase().replace(/_/g, " ")}.`,
        urgency: "high",
        href,
      });
    }
    if (p.status === "AWAITING_REVIEW") {
      const stage = p.pipelineStages.find((s) => s.name === "FEEDBACK" || s.name === "FIRST_DRAFT_DELIVERY");
      if (stage?.status === "ACTIVE") {
        items.push({
          id: `${p.id}-review`,
          clientId: p.clientId,
          clientName: p.client.name,
          projectId: p.id,
          projectName: p.name,
          title: "Awaiting client review",
          detail: "Delivered — waiting on client feedback or sign-off.",
          urgency: "low",
          href,
        });
      }
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}
