import { prisma } from "@/lib/prisma";
import { generateEstimate } from "@/lib/ai/agents/estimate-agent";
import { brandSourcesForAgents } from "@/lib/brand-sources-data";
import { getSetting } from "@/lib/platform-settings";
import { lineRow, offerable, pmLineCredits, priceLines, totals, type LineInput } from "@/lib/estimate-lines";

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
 * Credits always come from the Price List item the agent picked (quantity × the item's credits) — never from a
 * number the model wrote. Anything that doesn't resolve to a real item goes to unresolvedNeeds ("Needs PM quote").
 * Estimate and quote items wait for the PM's number; a PM line is added (Phase S step 3).
 * `replace` overwrites an existing DRAFT (PM "Regenerate with AI"); a sent estimate is never touched.
 */
export async function generateDraftEstimate(projectId: string, opts: { replace?: boolean } = {}) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { brief: true, client: true, estimate: true } });
  if (!project || !project.brief) return { ok: false as const, error: "This project has no accepted brief yet." };
  if (project.estimate && (!opts.replace || project.estimate.status !== "DRAFT")) {
    return { ok: false as const, error: "An estimate already exists; edit it instead." };
  }

  const priceList = (await prisma.priceListItem.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }] })).filter(offerable);
  if (priceList.length === 0) return { ok: false as const, error: "The price list is empty. Add deliverables in Price List first." };

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
    priceList: priceList.map((p) => ({ key: p.sourceKey ?? p.id, name: p.displayName ?? p.deliverableType, category: p.category, unit: p.unit, credits: p.creditCost, status: p.status })),
  });
  if (!result.ok) return { ok: false as const, error: result.error };

  const byKey = new Map(priceList.map((p) => [p.sourceKey ?? p.id, p]));
  const unresolvedNeeds: UnresolvedNeed[] = result.data.unresolvedNeeds.map((n) => ({ description: n.description, reason: n.reason }));
  const inputs: LineInput[] = [];
  for (const li of result.data.lineItems) {
    const match = byKey.get(li.itemKey);
    if (!match) {
      unresolvedNeeds.push({ description: `${li.quantity}× ${li.itemKey}`, reason: "Not on the price list: needs a PM quote." });
      continue;
    }
    inputs.push({ kind: "price", priceListItemId: match.id, quantity: li.quantity, detail: li.detail });
  }
  const priced = priceLines(inputs, priceList);
  const [pct, min] = await Promise.all([getSetting("pmLinePercent"), getSetting("pmLineMin")]);
  const lines = priced.length ? [...priced, ...priceLines([{ kind: "pm", credits: pmLineCredits(totals(priced).creative, pct, min) }], priceList).map((l) => ({ ...l, order: priced.length }))] : [];
  const { pm: pmCredits, creative: creativeCredits, total: totalCredits } = totals(lines);

  const estimate = await prisma.$transaction(async (tx) => {
    if (project.estimate) {
      await tx.estimateLineItem.deleteMany({ where: { estimateId: project.estimate.id } });
      return tx.estimate.update({
        where: { id: project.estimate.id },
        data: { totalCredits, pmCredits, creativeCredits, notes: result.data.notes, unresolvedNeeds: unresolvedNeeds.length ? unresolvedNeeds : [] },
      });
    }
    return tx.estimate.create({
      data: {
        projectId,
        status: "DRAFT",
        totalCredits,
        pmCredits,
        creativeCredits,
        notes: result.data.notes,
        unresolvedNeeds: unresolvedNeeds.length ? unresolvedNeeds : undefined,
        inclusions: DEFAULT_INCLUSIONS,
      },
    });
  });
  if (lines.length) {
    await prisma.estimateLineItem.createMany({ data: lines.map((l) => ({ ...lineRow(l), estimateId: estimate.id })) });
  }
  return { ok: true as const, estimateId: estimate.id, runId: result.runId, lines: lines.length, unresolved: unresolvedNeeds.length, totalCredits };
}
