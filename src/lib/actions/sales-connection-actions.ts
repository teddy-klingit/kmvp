"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { notifyMany } from "@/lib/notifier";
import { DEMO_ACCOUNT, guessStage, isSalesSource, KLINGIT_STAGES, PURGE_AFTER_DAYS, salesSource, type KlingitStage, type SalesSettings, type SalesSourceKey } from "@/lib/sales-sources";

/**
 * Phase V: Sales & revenue connections. Client admins only; every connect and disconnect is in the AuditLog. For now
 * a demo client's sign-in is simulated (DEMO_ACCOUNT); a real client's Connect asks Klingit's admins to set it up.
 * Read-only and totals only: nothing here ever writes to the client's CRM or shop, and no personal data is stored.
 */

export type SalesState = { error?: string; ok?: string; settings?: SalesSettings; status?: string };

const revalidate = () => {
  revalidatePath("/settings/connections");
  revalidatePath("/insights", "layout");
};

async function adminViewer() {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) throw new Error("Only your account's admins can change connections.");
  return viewer;
}

const audit = (clientId: string, actorUserId: string, action: string, before: unknown, after: unknown) =>
  prisma.auditLog.create({ data: { clientId, actorUserId, area: "connections", action, before: (before ?? Prisma.JsonNull) as Prisma.InputJsonValue, after: (after ?? Prisma.JsonNull) as Prisma.InputJsonValue } });

async function current(clientId: string, source: string) {
  return prisma.dataSource.findUnique({ where: { clientId_source: { clientId, source } } });
}

/** Step 1, log in. A demo account signs in (simulated) and moves to the next step; a real one asks Klingit. */
export async function salesLoginAction(source: string): Promise<SalesState> {
  const viewer = await adminViewer();
  if (!isSalesSource(source) || salesSource(source)?.soon) return { error: "That one isn't ready yet." };
  const before = await current(viewer.clientId, source);
  if (!viewer.client.isDemo) {
    await prisma.dataSource.upsert({ where: { clientId_source: { clientId: viewer.clientId, source } }, update: { status: "requested" }, create: { clientId: viewer.clientId, source, status: "requested" } });
    await audit(viewer.clientId, viewer.userId, `Asked Klingit to connect ${source}`, before ? { status: before.status } : null, { status: "requested" });
    const admins = await prisma.staffMember.findMany({ where: { title: "ADMIN", user: { status: "ACTIVE" } }, select: { userId: true } });
    await notifyMany(admins.map((a) => ({ userId: a.userId, clientId: viewer.clientId, type: "SYSTEM" as const, title: `Connect ${source} for ${viewer.client.name}`, body: `${viewer.user.name} asked to connect ${source} (read-only, totals only).`, actionUrl: `/ops/clients/${viewer.clientId}/admin`, actionLabel: "Open client" })));
    revalidate();
    return { status: "requested", ok: `We've asked Klingit to connect ${source}. You'll get a notification when it's ready.` };
  }
  const demo = DEMO_ACCOUNT[source as keyof typeof DEMO_ACCOUNT];
  const settings: SalesSettings = {
    step: 2,
    login: viewer.user.email,
    domain: demo.domain,
    stages: demo.stages?.map((s) => ({ ...s, mapTo: guessStage(s.name) })),
    pipelines: demo.pipelines.map((name) => ({ name, selected: true })),
    currency: demo.currency,
    historyMonths: 12,
  };
  await prisma.dataSource.upsert({
    where: { clientId_source: { clientId: viewer.clientId, source } },
    update: { status: "setting_up", account: demo.domain ?? viewer.client.name, settings, isDemo: true, disconnectedAt: null, purgeAfter: null, lastError: null },
    create: { clientId: viewer.clientId, source, status: "setting_up", account: demo.domain ?? viewer.client.name, settings, isDemo: true, connectedAt: new Date() },
  });
  await audit(viewer.clientId, viewer.userId, `Connected ${source} (read-only, setting up)`, before ? { status: before.status } : null, { status: "setting_up" });
  revalidate();
  return { status: "setting_up", settings };
}

/** Step 2 (CRMs): their stages → Klingit's. */
export async function salesStagesAction(source: string, mapping: Record<string, KlingitStage>): Promise<SalesState> {
  const viewer = await adminViewer();
  const ds = await current(viewer.clientId, source);
  if (!ds || ds.status === "disconnected") return { error: "Log in first." };
  const settings = (ds.settings ?? {}) as SalesSettings;
  const valid = new Set<string>(KLINGIT_STAGES.map((s) => s.key));
  const stages = (settings.stages ?? []).map((s) => ({ ...s, mapTo: valid.has(mapping[s.name]) ? mapping[s.name] : s.mapTo }));
  const next: SalesSettings = { ...settings, stages, step: 3 };
  await prisma.dataSource.update({ where: { id: ds.id }, data: { settings: next } });
  revalidate();
  return { status: ds.status, settings: next };
}

/** Last step: what to sync (pipelines, currency, history). The source is connected and its first sync is recorded. */
export async function salesFinishAction(source: string, choice: { pipelines: string[]; currency: string; historyMonths: number }): Promise<SalesState> {
  const viewer = await adminViewer();
  const ds = await current(viewer.clientId, source);
  if (!ds || ds.status === "disconnected") return { error: "Log in first." };
  const settings = (ds.settings ?? {}) as SalesSettings;
  const pipelines = (settings.pipelines ?? []).map((p) => ({ ...p, selected: choice.pipelines.includes(p.name) }));
  if (pipelines.length && !pipelines.some((p) => p.selected)) return { error: "Pick at least one to sync." };
  const historyMonths = [6, 12, 24].includes(choice.historyMonths) ? choice.historyMonths : 12;
  const next: SalesSettings = { ...settings, pipelines, currency: choice.currency || settings.currency, historyMonths, step: undefined };
  const demo = DEMO_ACCOUNT[source as keyof typeof DEMO_ACCOUNT];
  await prisma.dataSource.update({ where: { id: ds.id }, data: { status: "connected", settings: next, lastSyncAt: new Date(), health: demo?.health ?? Prisma.JsonNull } });
  await audit(viewer.clientId, viewer.userId, `${source} set up: syncing ${pipelines.filter((p) => p.selected).map((p) => p.name).join(", ") || "everything"}, ${historyMonths} months`, { status: ds.status }, { status: "connected", historyMonths, currency: next.currency });
  revalidate();
  return { status: "connected", settings: next, ok: `${source} is connected.` };
}

/** Disconnect: syncing stops now; the synced numbers are deleted within 30 days (the scheduler purges them). */
export async function salesDisconnectAction(formData: FormData) {
  const viewer = await adminViewer();
  const source = String(formData.get("source") ?? "");
  const ds = await current(viewer.clientId, source);
  if (!ds || ds.status === "disconnected") return;
  const purgeAfter = new Date(Date.now() + PURGE_AFTER_DAYS * 86400000);
  await prisma.dataSource.update({ where: { id: ds.id }, data: { status: "disconnected", disconnectedAt: new Date(), purgeAfter } });
  await audit(viewer.clientId, viewer.userId, `Disconnected ${source}; synced data deleted by ${purgeAfter.toISOString().slice(0, 10)}`, { status: ds.status }, { status: "disconnected", purgeAfter: purgeAfter.toISOString() });
  revalidate();
}

/** "Tell me when it's ready" for a source that's coming soon. */
export async function salesWaitlistAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const source = String(formData.get("source") ?? "") as SalesSourceKey;
  if (!salesSource(source)?.soon) return;
  await prisma.dataSource.upsert({ where: { clientId_source: { clientId: viewer.clientId, source } }, update: { status: "waitlist" }, create: { clientId: viewer.clientId, source, status: "waitlist" } });
  revalidate();
}
