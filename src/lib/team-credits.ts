import { prisma } from "@/lib/prisma";

/**
 * Team credits (Klingit team time, 1 credit = 1 hour). Approving an estimate takes its credits: one CONSUMPTION
 * ledger row per deliverable, attributed to the person who approved and the deliverable's format, so Usage can
 * split team credits by project, format and person. A revision approved later takes only the difference.
 * Sent-but-unapproved estimates stay "held" (src/lib/client-home.ts).
 */
export async function consumeForApprovedEstimate(estimateId: string, approverUserId: string) {
  const estimate = await prisma.estimate.findUnique({ where: { id: estimateId }, include: { lineItems: { orderBy: { order: "asc" } }, project: { select: { id: true, clientId: true } } } });
  if (!estimate) return [];
  const { clientId, id: projectId } = estimate.project;
  const already = await prisma.creditLedgerEntry.aggregate({ where: { projectId, type: "CONSUMPTION" }, _sum: { amount: true } });
  const taken = -(already._sum.amount ?? 0);
  const total = estimate.totalCredits ?? estimate.lineItems.reduce((a, l) => a + l.credits, 0);
  // First approval: one row per deliverable. A revision: one row for the difference (+ or −).
  const rows =
    taken === 0
      ? estimate.lineItems.filter((l) => l.credits > 0).map((l) => ({ credits: l.credits, format: l.deliverable, note: `${l.deliverable} · estimate approved` }))
      : total !== taken
        ? [{ credits: total - taken, format: estimate.lineItems[0]?.deliverable ?? null, note: `Estimate v${estimate.version} approved (${total - taken > 0 ? "+" : ""}${total - taken})` }]
        : [];
  const written = [];
  for (const r of rows) {
    const client = await prisma.client.update({ where: { id: clientId }, data: { creditBalance: { decrement: r.credits } }, select: { creditBalance: true } });
    written.push(
      await prisma.creditLedgerEntry.create({
        data: { clientId, projectId, userId: approverUserId, format: r.format, type: "CONSUMPTION", amount: -r.credits, balanceAfter: client.creditBalance, note: r.note },
      })
    );
  }
  return written;
}
