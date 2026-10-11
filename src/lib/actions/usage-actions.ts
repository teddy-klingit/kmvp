"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { notify } from "@/lib/notifier";

export type TopUpState = { error?: string; ok?: string };

/**
 * Usage → "Buy bundle": no payment in this phase. It creates a top-up request that Klingit confirms (ops → Plans &
 * AI credits); the credits land when it's confirmed. Admins only (checked here, not just hidden).
 */
export async function requestTopUpAction(_prev: TopUpState, formData: FormData): Promise<TopUpState> {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return { error: "Only an admin on your account can top up." };
  const bundle = await prisma.aiCreditBundle.findFirst({ where: { id: String(formData.get("bundleId") ?? ""), active: true } });
  if (!bundle) return { error: "Pick a bundle first." };
  const open = await prisma.aiTopUpRequest.findFirst({ where: { clientId: viewer.clientId, status: "PENDING" } });
  if (open) return { error: "A top-up is already waiting for Klingit to confirm." };
  await prisma.aiTopUpRequest.create({ data: { clientId: viewer.clientId, bundleId: bundle.id, requestedByUserId: viewer.userId } });
  const client = await prisma.client.findUnique({ where: { id: viewer.clientId }, include: { accountLead: true } });
  if (client?.accountLead)
    await notify({ userId: client.accountLead.userId, clientId: viewer.clientId, type: "SYSTEM", title: "AI credit top-up requested", body: `${viewer.user.name} at ${client.name} asked for ${bundle.size.toLocaleString("en-GB")} AI credits.`, actionUrl: "/ops/plans", actionLabel: "Confirm" });
  revalidatePath("/settings/usage");
  return { ok: `${bundle.size.toLocaleString("en-GB")} AI credits requested. Klingit confirms it, then they're yours.` };
}
