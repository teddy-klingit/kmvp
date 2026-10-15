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

/**
 * The Marketing PM with the most free capacity: fewest clients for their weekly hours (a client counts for the
 * contact person on its contract, else its account lead). A suggestion only; an admin assigns.
 */
export async function suggestPm() {
  const [pms, clients] = await Promise.all([
    prisma.staffMember.findMany({ where: { title: { in: ["ACCOUNT_LEAD", "PROJECT_MANAGER"] }, user: { status: "ACTIVE" } }, select: { id: true, capacityHoursPerWeek: true, user: { select: { name: true } } } }),
    prisma.client.findMany({ where: { status: { not: "OFFBOARDED" } }, select: { accountLeadId: true, contracts: { where: { status: { in: ["active", "paused", "ending", "scheduled"] } }, select: { contactStaffId: true }, take: 1 } } }),
  ]);
  const load = (id: string) => clients.filter((c) => (c.contracts[0]?.contactStaffId ?? c.accountLeadId) === id).length;
  const ranked = pms.map((p) => ({ id: p.id, name: p.user.name, clients: load(p.id), per: load(p.id) / Math.max(1, p.capacityHoursPerWeek) })).sort((a, b) => a.per - b.per || a.name.localeCompare(b.name));
  return ranked[0] ?? null;
}
