import { prisma } from "@/lib/prisma";
import { generateEstimate } from "@/lib/ai/agents/estimate-agent";
import { brandSourcesForAgents } from "@/lib/brand-sources-data";

export type UnresolvedNeed = {
  description: string;
  reason?: string;
  /** Set once a PM handles it: priced (became a custom line) or excluded from the scope. */
  resolution?: { kind: "priced" | "excluded"; byUserId: string; byName: string; at: string; credits?: number; note?: string };
};

export const DEFAULT_INCLUSIONS = [
  "Dedicated art director",
  "Brand compliance check on every asset",
  "2 rounds of revisions included",
];

/**
 * Runs the Estimate agent and writes the result as the project's DRAFT estimate.
 * Credits always come from the Price List row the agent picked (quantity × cost) — never from a number
 * the model wrote. Anything that doesn't resolve to a real row goes to unresolvedNeeds for a human.
 * `replace` overwrites an existing DRAFT (PM "Regenerate with AI"); a sent estimate is never touched.
 */
export async function generateDraftEstimate(projectId: string, opts: { replace?: boolean } = {}) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { brief: true, client: true, estimate: true } });
  if (!project || !project.brief) return { ok: false as const, error: "This project has no accepted brief yet." };
  if (project.estimate && (!opts.replace || project.estimate.status !== "DRAFT")) {
    return { ok: false as const, error: "An estimate already exists; edit it instead." };
  }

  const priceList = await prisma.priceListItem.findMany({ where: { archivedAt: null }, orderBy: [{ deliverableType: "asc" }, { complexityTier: "asc" }] });
  if (priceList.length === 0) return { ok: false as const, error: "The price list is empty. Add deliverables and rates in Price List first." };

  const result = await generateEstimate({
    projectId,
    clientId: project.clientId,
    clientName: project.client.name,
    projectType: project.type,
    brandSummary: project.client.brandSummary,
    goals: project.brief.goals,
    targetAudience: project.brief.targetAudience,
    successMetrics: project.brief.successMetrics,
    deliverablesNotes: project.brief.deliverablesNotes,
    linkedSources: await brandSourcesForAgents(project.clientId),
    priceList: priceList.map((p) => ({ deliverableType: p.deliverableType, complexityTier: p.complexityTier, creditCost: p.creditCost })),
  });
  if (!result.ok) return { ok: false as const, error: result.error };

  const priceByKey = new Map(priceList.map((p) => [`${p.deliverableType}__${p.complexityTier}`, p]));
  const unresolvedNeeds: UnresolvedNeed[] = result.data.unresolvedNeeds.map((n) => ({ description: n.description, reason: n.reason }));
  const lines: { deliverable: string; detail: string; quantity: number; complexityTier: "LOW" | "MEDIUM" | "HIGH"; priceListItemId: string; credits: number; order: number }[] = [];
  result.data.lineItems.forEach((li, i) => {
    const match = priceByKey.get(`${li.deliverableType}__${li.complexityTier}`);
    if (!match) {
      unresolvedNeeds.push({
        description: `${li.quantity}× ${li.deliverableType} (${li.complexityTier.toLowerCase()})`,
        reason: "No matching price list entry for this deliverable and tier.",
      });
      return;
    }
    lines.push({
      deliverable: match.deliverableType,
      detail: li.detail,
      quantity: li.quantity,
      complexityTier: match.complexityTier,
      priceListItemId: match.id,
      credits: li.quantity * match.creditCost,
      order: i,
    });
  });
  const totalCredits = lines.reduce((sum, l) => sum + l.credits, 0);

  const estimate = await prisma.$transaction(async (tx) => {
    if (project.estimate) {
      await tx.estimateLineItem.deleteMany({ where: { estimateId: project.estimate.id } });
      return tx.estimate.update({
        where: { id: project.estimate.id },
        data: { totalCredits, notes: result.data.notes, unresolvedNeeds: unresolvedNeeds.length ? unresolvedNeeds : [] },
      });
    }
    return tx.estimate.create({
      data: {
        projectId,
        status: "DRAFT",
        totalCredits,
        notes: result.data.notes,
        unresolvedNeeds: unresolvedNeeds.length ? unresolvedNeeds : undefined,
        inclusions: DEFAULT_INCLUSIONS,
      },
    });
  });
  if (lines.length) {
    await prisma.estimateLineItem.createMany({ data: lines.map((l) => ({ ...l, estimateId: estimate.id, hours: l.credits })) });
  }
  return { ok: true as const, estimateId: estimate.id, runId: result.runId, lines: lines.length, unresolved: unresolvedNeeds.length, totalCredits };
}
