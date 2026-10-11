"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { notify } from "@/lib/notifier";
import { AD_ACCOUNTS, AI_MODELS } from "@/lib/connections";
import type { Prisma } from "@/generated/prisma";

export type ConnectionState = { error?: string; ok?: string };

function revalidate() {
  revalidatePath("/settings/connections");
  revalidatePath("/assets", "layout");
  revalidatePath("/insights", "layout");
}

/** Ad accounts: there's no per-client sign-in yet, so Connect / Reconnect asks Klingit to set it up (admins only). */
export async function requestAdAccountAction(formData: FormData) {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return;
  const app = AD_ACCOUNTS.find((a) => a.key === formData.get("app"));
  if (!app) return;
  await prisma.brandConnection.upsert({
    where: { clientId_app: { clientId: viewer.clientId, app: app.key } },
    update: { status: "REQUESTED" },
    create: { clientId: viewer.clientId, app: app.key, status: "REQUESTED", isDemo: false },
  });
  const client = await prisma.client.findUnique({ where: { id: viewer.clientId }, include: { accountLead: true } });
  if (client?.accountLead) await notify({ userId: client.accountLead.userId, clientId: viewer.clientId, type: "SYSTEM", title: `Connect ${app.name}`, body: `${viewer.user.name} at ${client.name} asked to connect ${app.name}.`, actionUrl: `/ops/clients/${viewer.clientId}/admin`, actionLabel: "Open client" });
  revalidate();
}

/** Your own AI model (used on Basic): the API key, stored for the client's skills and assistants to run on. */
export async function connectOwnModelAction(_prev: ConnectionState, formData: FormData): Promise<ConnectionState> {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return { error: "Only an admin on your account can change connections." };
  const model = AI_MODELS.find((m) => m.key === formData.get("app"));
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!model) return { error: "Unknown provider." };
  if (!apiKey.startsWith(model.keyPrefix) || apiKey.length < 20) return { error: `That doesn't look like a ${model.name} API key.` };
  const meta = { apiKey, last4: apiKey.slice(-4) } as Prisma.InputJsonValue;
  await prisma.brandConnection.upsert({
    where: { clientId_app: { clientId: viewer.clientId, app: model.key } },
    update: { status: "CONNECTED", connectedAt: new Date(), isDemo: false, meta },
    create: { clientId: viewer.clientId, app: model.key, status: "CONNECTED", connectedAt: new Date(), isDemo: false, meta },
  });
  revalidate();
  return { ok: `${model.name} connected.` };
}

/** Disconnect anything on the Connections page (admins only). */
export async function disconnectConnectionAction(formData: FormData) {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return;
  const app = String(formData.get("app") ?? "");
  await prisma.brandConnection.updateMany({ where: { clientId: viewer.clientId, app }, data: { status: "DISCONNECTED", ...(AI_MODELS.some((m) => m.key === app) ? { meta: {} } : {}) } });
  revalidate();
}
