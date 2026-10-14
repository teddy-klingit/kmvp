"use server";

import { revalidatePath } from "next/cache";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { prisma } from "@/lib/prisma";
import { createRequest, isRequestKind, RequestError, REQUEST_KINDS } from "@/lib/requests";

export type PlanRequestState = { error?: string; ok?: string };

/**
 * Settings → Plan: change plan or pack, buy creative packs, top up AI, add a slot, ask to pause, Per request. Each is
 * a request staff approve (Phase S); the client saw the price and the rule before sending. Admins only.
 */
export async function submitRequestAction(_prev: PlanRequestState, formData: FormData): Promise<PlanRequestState> {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return { error: "Only an admin on your account can change the plan or buy credits." };
  const kind = formData.get("kind");
  if (!isRequestKind(kind)) return { error: "Unknown request." };
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { error: "Something went wrong. Try again." };
  }
  const note = String(formData.get("note") ?? "").trim();
  if (note) payload.note = note.slice(0, 500);
  if ((kind === "pause" || kind === "per_request") && !note) return { error: "Tell us a little about it." };
  const open = await prisma.purchaseRequest.findFirst({ where: { clientId: viewer.clientId, kind, status: "pending" } });
  if (open && kind !== "creative_pack") return { error: `A ${REQUEST_KINDS[kind].label.toLowerCase()} request is already waiting for Klingit.` };
  try {
    const r = await createRequest(viewer.clientId, viewer.userId, kind, payload);
    revalidatePath("/settings/plan");
    return { ok: r.status === "approved" ? "Done: it's on your account, and on your next invoice." : "Sent to Klingit. Your Marketing PM approves it, and you'll get a notification." };
  } catch (e) {
    if (e instanceof RequestError) return { error: e.message };
    throw e;
  }
}
