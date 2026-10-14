import { prisma } from "@/lib/prisma";
import { klingitChatHref } from "@/lib/client-home";

/**
 * The client's Marketing PM (Phase S): the contract's contact person, else the account lead (clients not yet on a
 * contract). Shown on Home, every project, the profile menu and Settings → Plan, with Message (their Klingit thread).
 */
export async function marketingPm(clientId: string) {
  const [contract, client] = await Promise.all([
    prisma.contract.findFirst({ where: { clientId, status: { in: ["active", "paused", "ending"] } }, orderBy: { startDate: "desc" }, include: { contact: { include: { user: { select: { name: true, email: true } } } } } }),
    prisma.client.findUnique({ where: { id: clientId }, select: { accountLead: { include: { user: { select: { name: true, email: true } } } } } }),
  ]);
  const staff = contract?.contact ?? client?.accountLead ?? null;
  if (!staff) return null;
  return { staffId: staff.id, name: staff.user.name, email: staff.user.email, messageHref: await klingitChatHref(clientId), fromContract: Boolean(contract?.contact) };
}
export type MarketingPm = NonNullable<Awaited<ReturnType<typeof marketingPm>>>;
