import { prisma } from "@/lib/prisma";
import { unassignedLiveAdAccounts } from "@/lib/integrations/live-ads-owner";
import { priceListGaps } from "@/lib/price-list-gaps";

/**
 * Admin → To set up (Phase T): the jobs that keep the PMs' Today clean. Counts for the nav badge and the tabs;
 * the To set up tab lists them with their inline actions.
 */
export async function adminJobCounts() {
  const [noPm, ads, overdue, oldPlans, gaps] = await Promise.all([
    clientsWithoutPm(),
    unassignedLiveAdAccounts(),
    prisma.invoice.count({ where: { status: "OVERDUE", client: { isDemo: false } } }),
    prisma.client.count({ where: { isDemo: false, status: { not: "OFFBOARDED" }, contracts: { none: {} } } }),
    priceListGaps(),
  ]);
  const jobs = noPm.length + (ads.length ? 1 : 0) + overdue + (gaps.repeated.length ? 1 : 0) + (oldPlans ? 1 : 0);
  return { jobs, noPm: noPm.length, ads: ads.length, overdue, oldPlans, gaps: gaps.repeated.length };
}

/** Real clients with no Marketing PM: no contact person on a live or scheduled contract and no account lead. */
export async function clientsWithoutPm() {
  const clients = await prisma.client.findMany({
    where: { isDemo: false, status: { not: "OFFBOARDED" }, accountLeadId: null },
    select: { id: true, name: true, contracts: { where: { status: { in: ["active", "paused", "ending", "scheduled"] }, contactStaffId: { not: null } }, select: { id: true } } },
    orderBy: { name: "asc" },
  });
  return clients.filter((c) => c.contracts.length === 0).map(({ id, name }) => ({ id, name }));
}
