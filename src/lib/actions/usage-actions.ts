"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { createRequest, RequestError } from "@/lib/requests";

export type TopUpState = { error?: string; ok?: string };

/**
 * Usage → Top up AI credits: a request (Phase S), never a card payment. Staff approve it in /ops → Requests (or it's
 * auto-approved under the client's limit); the credits land then and the line goes on the next invoice. Admins only.
 */
export async function requestTopUpAction(_prev: TopUpState, formData: FormData): Promise<TopUpState> {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return { error: "Only an admin on your account can top up." };
  const count = Math.max(1, Math.min(10, Math.round(Number(formData.get("bundleId") ?? 1)) || 1));
  const open = await prisma.purchaseRequest.findFirst({ where: { clientId: viewer.clientId, kind: "ai_topup", status: "pending" } });
  if (open) return { error: "A top-up is already waiting for Klingit to approve." };
  try {
    const req = await createRequest(viewer.clientId, viewer.userId, "ai_topup", { count });
    revalidatePath("/settings/usage");
    const credits = Number((req.payload as { credits?: number }).credits ?? 0).toLocaleString("en-GB");
    return { ok: req.status === "approved" ? `${credits} AI credits added. The line comes on your next invoice.` : `${credits} AI credits requested. Klingit approves it, then they're yours.` };
  } catch (e) {
    if (e instanceof RequestError) return { error: e.message };
    throw e;
  }
}
