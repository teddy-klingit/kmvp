import { prisma } from "@/lib/prisma";
import { aiCreditStatus } from "@/lib/ai-credits";
import { poolOf, teamBalances } from "@/lib/team-ledger";
import { PLAN_TIER_LABEL } from "@/lib/labels";
import type { Scope } from "@/lib/staff-scope";

/**
 * Ops → Clients (Phase S, S7.2): per client the way (1 platform only · 2 + Marketing PM · 3 + creative team), the
 * platform plan, the pack, the three balances, the contact person, active projects, the notice and renewal dates and
 * an invoice flag. "Needs attention": an overdue invoice, a balance under 20%, a notice deadline within 30 days or a
 * request waiting. Clients not on a contract yet show their old plan and no way.
 */

const DAY = 86400000;
export type Way = 1 | 2 | 3;
export type Bal = { left: number; of: number } | null;
export type ClientRow = {
  id: string;
  name: string;
  status: string;
  way: Way | null;
  plan: string;
  pack: string | null;
  ai: Bal;
  pm: Bal;
  creative: Bal;
  contact: { id: string; name: string } | null;
  activeProjects: number;
  noticeDeadline: Date | null;
  endDate: Date | null;
  overdueInvoices: number;
  pendingRequests: number;
  attention: string[];
};

/** `money`: the overdue-invoice flag; Admin only. A Marketing PM's list never shows invoices or payment status. */
export async function loadClientRows(scope: Scope, now = new Date(), opts: { money?: boolean } = {}): Promise<ClientRow[]> {
  const clients = await prisma.client.findMany({
    where: { status: { not: "OFFBOARDED" }, ...(scope.clientIds ? { id: { in: scope.clientIds } } : {}) },
    include: { accountLead: { include: { user: { select: { name: true } } } }, projects: { where: { status: { notIn: ["ARCHIVED", "DELIVERED", "DRAFT"] } }, select: { id: true } } },
    orderBy: { name: "asc" },
  });
  const [contracts, plans, packs, overdue, pending] = await Promise.all([
    prisma.contract.findMany({ where: { clientId: { in: clients.map((c) => c.id) }, status: { in: ["active", "paused", "ending"] } }, include: { contact: { include: { user: { select: { name: true } } } } } }),
    prisma.platformPlan.findMany(),
    prisma.teamPack.findMany(),
    opts.money ? prisma.invoice.groupBy({ by: ["clientId"], where: { status: "OVERDUE" }, _count: true }) : Promise.resolve([] as { clientId: string; _count: number }[]),
    prisma.purchaseRequest.groupBy({ by: ["clientId"], where: { status: "pending" }, _count: true }),
  ]);
  const rows: ClientRow[] = [];
  for (const c of clients) {
    const contract = contracts.find((x) => x.clientId === c.id) ?? null;
    const [ai, team] = await Promise.all([aiCreditStatus(c.id, now), teamBalances(c.id, now)]);
    const pool = (k: "pm" | "creative"): Bal => {
      const p = team?.[k];
      return p && (p.monthly > 0 || p.left !== 0) ? { left: p.left, of: poolOf(p) } : null;
    };
    const way: Way | null = contract ? (!contract.teamPackKey ? 1 : contract.creativeCreditsPerMonth > 0 ? 3 : 2) : null;
    const contactStaff = contract?.contact ?? c.accountLead ?? null;
    const row: ClientRow = {
      id: c.id,
      name: c.name,
      status: c.status,
      way,
      plan: contract ? (plans.find((p) => p.key === contract.platformPlanKey)?.name ?? contract.platformPlanKey) : `${PLAN_TIER_LABEL[c.planTier] ?? c.planTier} (old)`,
      pack: contract?.teamPackKey ? (packs.find((p) => p.key === contract.teamPackKey)?.name ?? contract.teamPackKey) : null,
      ai: ai.ownModel ? null : { left: ai.left, of: ai.used + ai.left },
      pm: pool("pm"),
      creative: pool("creative"),
      contact: contactStaff ? { id: contactStaff.id, name: contactStaff.user.name } : null,
      activeProjects: c.projects.length,
      noticeDeadline: contract?.noticeDeadline ?? null,
      endDate: contract?.endDate ?? c.renewalDate ?? null,
      overdueInvoices: overdue.find((o) => o.clientId === c.id)?._count ?? 0,
      pendingRequests: pending.find((o) => o.clientId === c.id)?._count ?? 0,
      attention: [],
    };
    if (row.overdueInvoices) row.attention.push(`${row.overdueInvoices} overdue invoice${row.overdueInvoices === 1 ? "" : "s"}`);
    for (const [label, b] of [["PM", row.pm], ["Creative", row.creative]] as const) if (b && b.of > 0 && b.left < b.of * 0.2) row.attention.push(`${label} credits low`);
    if (contract?.autoRenew && contract.noticeDeadline.getTime() - now.getTime() <= 30 * DAY && contract.noticeDeadline >= now) row.attention.push("Notice deadline within 30 days");
    if (row.pendingRequests) row.attention.push(`${row.pendingRequests} request${row.pendingRequests === 1 ? "" : "s"} waiting`);
    rows.push(row);
  }
  return rows;
}

export type ClientFilters = { contact?: string | null; way?: string | null; plan?: string | null; attention?: boolean };

export function filterClientRows(rows: ClientRow[], f: ClientFilters) {
  return rows.filter((r) => (!f.contact || r.contact?.id === f.contact) && (!f.way || String(r.way ?? "none") === f.way) && (!f.plan || r.plan === f.plan) && (!f.attention || r.attention.length > 0));
}
