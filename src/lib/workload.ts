import { prisma } from "@/lib/prisma";
import { myClientIds } from "@/lib/staff-scope";
import { computeStaffingSuggestions } from "@/lib/staffing";
import { periodKey } from "@/lib/team-ledger";

/**
 * Ops → Team → Workload (Phase S, S7.9). Per PM: their clients (see myClientIds), PM credits sold this month (the sum of
 * their clients' contracts) vs used (PM consumption this month), creative credits booked, active projects and
 * warnings. Per squad: creative credits booked this month (approved lines matched to the Price List item's squad;
 * monthly services as their own row), active projects and a warning when the month runs well above the last three.
 * Hours and utilisation come from the existing computeStaffingSuggestions.
 */

const LIVE = ["active", "paused", "ending"];
const ACTIVE_PROJECT = { notIn: ["ARCHIVED", "DELIVERED", "DRAFT"] as ("ARCHIVED" | "DELIVERED" | "DRAFT")[] };
/** A squad is "busier than usual" when this month's booking runs over this share of its three-month average. */
export const SQUAD_BUSY_FACTOR = 1.25;
export const SERVICES_SQUAD = "Monthly services";

export type PmWorkload = {
  staffId: string;
  name: string;
  clients: { id: string; name: string }[];
  pmSold: number;
  pmUsed: number;
  creativeBooked: number;
  activeProjects: number;
  hours: number;
  capacity: number;
  utilizationPct: number;
  warnings: string[];
};
export type SquadWorkload = { squad: string; booked: number; average: number; activeProjects: number; clients: number; warnings: string[] };

const monthStart = (d: Date, back = 0) => new Date(d.getFullYear(), d.getMonth() - back, 1);

export async function loadWorkload(now = new Date()) {
  const start = monthStart(now);
  const from3 = monthStart(now, 3);
  const [staff, contracts, rows, items, projects] = await Promise.all([
    prisma.staffMember.findMany({
      where: { user: { status: "ACTIVE" }, OR: [{ title: { in: ["ACCOUNT_LEAD", "PROJECT_MANAGER"] } }, { contactContracts: { some: { status: { in: LIVE } } } }] },
      include: { user: true, teamMemberships: { include: { team: { include: { project: { include: { client: true } } } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.contract.findMany({ where: { status: { in: LIVE } }, select: { clientId: true, pmCreditsPerMonth: true } }),
    prisma.creditLedgerEntry.findMany({ where: { type: { in: ["CONSUMPTION", "SERVICE"] }, createdAt: { gte: from3 } }, select: { clientId: true, projectId: true, type: true, pool: true, amount: true, format: true, periodKey: true, createdAt: true } }),
    prisma.priceListItem.findMany({ select: { deliverableType: true, displayName: true, squad: true } }),
    prisma.project.findMany({ where: { status: ACTIVE_PROJECT }, select: { id: true, clientId: true } }),
  ]);
  const clients = await prisma.client.findMany({ where: { status: { not: "OFFBOARDED" } }, select: { id: true, name: true } });
  const thisMonth = periodKey(now);
  // Services are reserved at the month's grant (createdAt can be the run time), so they count by their periodKey.
  const inMonth = (r: (typeof rows)[number]) => (r.type === "SERVICE" ? r.periodKey === thisMonth : r.createdAt >= start);
  const sum = (xs: typeof rows) => Math.round(xs.reduce((n, r) => n - r.amount, 0) * 10) / 10;
  const util = new Map(computeStaffingSuggestions(staff, { projectType: "CAMPAIGN", clientId: "" }).map((s) => [s.staffMemberId, s]));

  const pms: PmWorkload[] = [];
  for (const s of staff) {
    const ids = new Set(await myClientIds(s.id));
    const mine = rows.filter((r) => ids.has(r.clientId) && inMonth(r));
    const u = util.get(s.id);
    const pm: PmWorkload = {
      staffId: s.id,
      name: s.user.name,
      clients: clients.filter((c) => ids.has(c.id)),
      pmSold: contracts.filter((c) => ids.has(c.clientId)).reduce((n, c) => n + c.pmCreditsPerMonth, 0),
      pmUsed: sum(mine.filter((r) => r.pool === "pm")),
      creativeBooked: sum(mine.filter((r) => r.pool === "creative")),
      activeProjects: projects.filter((p) => ids.has(p.clientId)).length,
      hours: u?.allocatedHours ?? 0,
      capacity: s.capacityHoursPerWeek,
      utilizationPct: u?.utilizationPct ?? 0,
      warnings: [],
    };
    if (pm.pmSold > 0 && pm.pmUsed > pm.pmSold) pm.warnings.push(`PM credits over what's sold: ${pm.pmUsed} of ${pm.pmSold}`);
    else if (pm.pmSold > 0 && pm.pmUsed >= pm.pmSold * 0.9) pm.warnings.push("PM credits nearly used up this month");
    if (pm.capacity > 0 && pm.hours / pm.capacity > 0.9) pm.warnings.push(`Over 90% of hours booked (${pm.hours}h of ${pm.capacity}h)`);
    pms.push(pm);
  }

  // Squads: a creative line counts towards the squad of the Price List item it was priced from (matched by name).
  const squadOf = new Map<string, string>();
  for (const i of items) for (const n of [i.deliverableType, i.displayName]) if (n && i.squad) squadOf.set(n.toLowerCase(), i.squad);
  const creative = rows.filter((r) => r.pool === "creative");
  const keyOf = (r: (typeof rows)[number]) => (r.type === "SERVICE" ? SERVICES_SQUAD : (r.format && squadOf.get(r.format.toLowerCase())) || "Other");
  const squads = new Map<string, { cur: typeof rows; prev: typeof rows }>();
  for (const r of creative) {
    const k = keyOf(r);
    const g = squads.get(k) ?? { cur: [], prev: [] };
    (inMonth(r) ? g.cur : g.prev).push(r);
    squads.set(k, g);
  }
  const squadRows: SquadWorkload[] = [...squads.entries()]
    .map(([squad, g]) => {
      const booked = sum(g.cur);
      const average = Math.round((sum(g.prev) / 3) * 10) / 10;
      const w: SquadWorkload = { squad, booked, average, activeProjects: new Set(g.cur.flatMap((r) => (r.projectId ? [r.projectId] : []))).size, clients: new Set(g.cur.map((r) => r.clientId)).size, warnings: [] };
      if (average > 0 && booked > average * SQUAD_BUSY_FACTOR) w.warnings.push(`Busier than usual: ${booked} vs ${average} a month`);
      return w;
    })
    .filter((s) => s.booked > 0 || s.average > 0)
    .sort((a, b) => b.booked - a.booked);

  return { pms, squads: squadRows, period: thisMonth };
}
