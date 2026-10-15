"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { notify } from "@/lib/notifier";
import { AD_ACCOUNTS, AI_MODELS } from "@/lib/connections";
import { Prisma } from "@/generated/prisma";
import { encryptSecret, secretsConfigured } from "@/lib/secrets";

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

/**
 * Your own AI model (any plan, Phase U): the API key, encrypted (secrets.ts) for the client's own skills and
 * assistants to run on. Admins only. The page only ever gets the last 4 characters and the date it was added; the
 * AuditLog says who added, replaced or removed which provider's key, never the key.
 */
export async function connectOwnModelAction(_prev: ConnectionState, formData: FormData): Promise<ConnectionState> {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return { error: "Only an admin on your account can change connections." };
  const model = AI_MODELS.find((m) => m.key === formData.get("app"));
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!model) return { error: "Unknown provider." };
  if (!apiKey.startsWith(model.keyPrefix) || apiKey.length < 20) return { error: `That doesn't look like a ${model.name} API key.` };
  if (!secretsConfigured()) return { error: "Keys can't be stored right now. Klingit has been told." };
  const existing = await prisma.brandConnection.findUnique({ where: { clientId_app: { clientId: viewer.clientId, app: model.key } }, select: { status: true } });
  const replacing = existing?.status === "CONNECTED";
  const meta = { encryptedKey: encryptSecret(apiKey), last4: apiKey.slice(-4), addedAt: new Date().toISOString() } as Prisma.InputJsonValue;
  await prisma.$transaction([
    prisma.brandConnection.upsert({
      where: { clientId_app: { clientId: viewer.clientId, app: model.key } },
      update: { status: "CONNECTED", connectedAt: new Date(), isDemo: false, meta },
      create: { clientId: viewer.clientId, app: model.key, status: "CONNECTED", connectedAt: new Date(), isDemo: false, meta },
    }),
    prisma.auditLog.create({ data: { clientId: viewer.clientId, actorUserId: viewer.userId, area: "ai-keys", action: `${replacing ? "Replaced" : "Added"} the ${model.name} key (ending ${apiKey.slice(-4)})`, before: { provider: model.key, connected: replacing }, after: { provider: model.key, connected: true } } }),
  ]);
  revalidate();
  return { ok: `${model.name} ${replacing ? "key replaced" : "connected"}.` };
}

/** Disconnect anything on the Connections page (admins only). An AI key is deleted, not hidden. */
export async function disconnectConnectionAction(formData: FormData) {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return;
  const app = String(formData.get("app") ?? "");
  const model = AI_MODELS.find((m) => m.key === app);
  if (model) {
    const removed = await prisma.brandConnection.deleteMany({ where: { clientId: viewer.clientId, app } });
    if (removed.count) await prisma.auditLog.create({ data: { clientId: viewer.clientId, actorUserId: viewer.userId, area: "ai-keys", action: `Removed the ${model.name} key`, before: { provider: app, connected: true }, after: { provider: app, connected: false } } });
  } else {
    await prisma.brandConnection.updateMany({ where: { clientId: viewer.clientId, app }, data: { status: "DISCONNECTED" } });
  }
  revalidate();
}
