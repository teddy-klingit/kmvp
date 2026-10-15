import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { PLAN_TIER_LABEL } from "@/lib/labels";
import { myClientIds } from "@/lib/staff-scope";

/**
 * The client page header (Phase T): plan · pack · term · currency read from the contract (the old plan only when
 * there's none yet), the main contact, how many people, the markets from their briefs, and whose client it is.
 */
const MARKET_CODE: Record<string, string> = { sweden: "SE", norway: "NO", denmark: "DK", finland: "FI", "united kingdom": "UK", uk: "UK", germany: "DE", "united states": "US", us: "US", global: "Global" };

export async function clientHeader(clientId: string, viewerStaffId: string) {
  const [client, contract, users, briefs, mine] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, name: true, planTier: true, status: true, isDemo: true, accountLead: { select: { id: true, user: { select: { name: true } } } } } }),
    prisma.contract.findFirst({ where: { clientId, status: { in: ["active", "paused", "ending", "scheduled"] } }, orderBy: { startDate: "asc" }, include: { contact: { select: { id: true, user: { select: { name: true } } } } } }),
    prisma.clientUser.findMany({ where: { clientId }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.brief.findMany({ where: { project: { clientId } }, select: { sections: true } }),
    myClientIds(viewerStaffId),
  ]);
  const [plan, pack] = contract ? await Promise.all([prisma.platformPlan.findUnique({ where: { key: contract.platformPlanKey } }), contract.teamPackKey ? prisma.teamPack.findUnique({ where: { key: contract.teamPackKey } }) : null]) : [null, null];
  const eyebrow = contract
    ? [plan?.name ?? contract.platformPlanKey, pack?.name ?? (contract.teamPackKey ? contract.teamPackKey : "platform only"), `${contract.termMonths} months, ${contract.invoicing}`, contract.currency, contract.status === "scheduled" ? `starts ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(contract.startDate)}` : null]
    : [`${PLAN_TIER_LABEL[client.planTier] ?? client.planTier} (old plan)`, client.status === "ACTIVE" ? null : client.status.toLowerCase()];
  const owner = users.find((u) => u.permission === "OWNER") ?? users[0] ?? null;
  const markets = new Set<string>();
  for (const b of briefs)
    for (const s of jsonArray<{ key: string; items?: string[]; value?: string }>(b.sections))
      if (s.key === "markets") for (const m of s.items ?? (s.value ? s.value.split(/,\s*/) : [])) markets.add(MARKET_CODE[m.trim().toLowerCase()] ?? m.trim());
  const pm = contract?.contact ?? client.accountLead ?? null;
  return {
    client,
    eyebrow: [...eyebrow, client.isDemo ? "demo account" : null].filter(Boolean).join(" · "),
    contact: owner ? { name: owner.user.name, first: owner.user.name.split(" ")[0], admin: owner.permission === "OWNER" } : null,
    people: users.length,
    markets: [...markets],
    pm: pm ? { id: pm.id, name: pm.user.name, isViewer: mine.includes(clientId) && pm.id === viewerStaffId } : null,
  };
}
