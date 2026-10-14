import { prisma } from "@/lib/prisma";
import type { InternalRole } from "@/generated/prisma";
import { roleTierFor } from "@/lib/role-tier";

/**
 * Which clients are a PM's own (Phase S): those whose live contract names them as the contact person (the Marketing
 * PM), and, for clients not on a contract yet (or without a contact on it), those they're the account lead for.
 * PMs see their own clients by default and can switch to All; admins see everything by default.
 */
export async function myClientIds(staffId: string) {
  const [contracts, led] = await Promise.all([
    prisma.contract.findMany({ where: { status: { in: ["active", "paused", "ending"] } }, select: { clientId: true, contactStaffId: true } }),
    prisma.client.findMany({ where: { accountLeadId: staffId }, select: { id: true } }),
  ]);
  const withContact = new Map(contracts.filter((c) => c.contactStaffId).map((c) => [c.clientId, c.contactStaffId]));
  const mine = new Set(contracts.filter((c) => c.contactStaffId === staffId).map((c) => c.clientId));
  for (const { id } of led) if (!withContact.has(id)) mine.add(id);
  return [...mine];
}

export type Scope = { mine: boolean; clientIds: string[] | null };

/** ?scope=mine|all, defaulting to mine for a PM and all for an admin. clientIds null = every client. */
export async function scopeFor(viewer: { id: string; title: InternalRole }, q?: string | null): Promise<Scope> {
  const admin = roleTierFor(viewer.title) === "ADMIN";
  const mine = q === "mine" ? true : q === "all" ? false : !admin;
  return { mine, clientIds: mine ? await myClientIds(viewer.id) : null };
}
