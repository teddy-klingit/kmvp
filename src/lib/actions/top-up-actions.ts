"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { aiCreditStatus } from "@/lib/ai-credits";
import { getSetting } from "@/lib/platform-settings";
import { billingProfile, invoicePeriods } from "@/lib/invoicing";
import { liveContract } from "@/lib/contracts";
import { createRequest, RequestError } from "@/lib/requests";
import { topUpOptions } from "@/lib/top-ups";
import { notifyMany } from "@/lib/notifier";

/** The top-up panel (Phase U, design ClientTopUp): what it shows, topping up, automatic top-ups, asking an admin. */

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);

export type TopUpPanel = {
  left: number;
  allowance: number;
  usedPct: number;
  resets: string;
  options: Awaited<ReturnType<typeof topUpOptions>>;
  auto: boolean;
  autoRule: { below: number; credits: number; maxPerMonth: number };
  admin: boolean;
  adminName: string;
  instant: boolean;
  rollover: boolean;
  nextInvoice: string;
};

export async function topUpPanelAction(): Promise<TopUpPanel> {
  const viewer = await getPortalViewer();
  const now = new Date();
  const [s, profile, rule, approval, rollover, owner, contract] = await Promise.all([
    aiCreditStatus(viewer.clientId, now),
    prisma.billingProfile.findUnique({ where: { clientId: viewer.clientId }, select: { autoTopUp: true } }),
    getSetting("autoTopUpRule"),
    getSetting("topUpApproval"),
    getSetting("topUpRollover"),
    prisma.clientUser.findFirst({ where: { clientId: viewer.clientId, permission: "OWNER" }, include: { user: { select: { name: true } } } }),
    liveContract(viewer.clientId),
  ]);
  const options = await topUpOptions(viewer.clientId, s.used, now);
  const next = contract ? invoicePeriods(contract).find((p) => p.start > now) : null;
  return {
    left: Math.round(s.left),
    allowance: Math.round(s.allowance),
    usedPct: s.allowance ? Math.round((s.used / s.allowance) * 100) : 0,
    resets: day(s.periodEnd),
    options,
    auto: Boolean(profile?.autoTopUp),
    autoRule: { below: rule.below, credits: options[rule.option]?.credits ?? 1000, maxPerMonth: rule.maxPerMonth },
    admin: isClientAdmin(viewer),
    adminName: owner?.user.name.split(" ")[0] ?? "your admin",
    instant: approval === "instant",
    rollover,
    nextInvoice: next ? day(next.start) : "your next invoice",
  };
}

export async function topUpAction(_prev: { ok?: string; error?: string }, formData: FormData): Promise<{ ok?: string; error?: string }> {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return { error: "Only an admin on your account can top up." };
  try {
    const req = await createRequest(viewer.clientId, viewer.userId, "ai_topup", { option: Number(formData.get("option") ?? 0) });
    revalidatePath("/", "layout");
    const credits = Number((req.payload as { credits?: number }).credits ?? 0).toLocaleString("en-GB");
    return { ok: req.status === "approved" ? `${credits} AI credits added. The line comes on your next invoice.` : `${credits} AI credits requested. Klingit approves it, then they're yours.` };
  } catch (e) {
    if (e instanceof RequestError) return { error: e.message };
    throw e;
  }
}

export async function setAutoTopUpAction(on: boolean) {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return { error: "Only an admin can change this." };
  await billingProfile(viewer.clientId);
  await prisma.billingProfile.update({ where: { clientId: viewer.clientId }, data: { autoTopUp: on } });
  await prisma.auditLog.create({ data: { clientId: viewer.clientId, actorUserId: viewer.userId, area: "billing", action: `Automatic AI top-up turned ${on ? "on" : "off"}`, after: { autoTopUp: on } } });
  revalidatePath("/", "layout");
  return {};
}

/** A member can't top up: "Ask Maja to top up" tells the client's admins. */
export async function askAdminTopUpAction() {
  const viewer = await getPortalViewer();
  const admins = await prisma.clientUser.findMany({ where: { clientId: viewer.clientId, permission: "OWNER" }, select: { userId: true } });
  await notifyMany(admins.map((a) => ({ userId: a.userId, clientId: viewer.clientId, type: "APPROVAL_NEEDED" as const, title: `${viewer.user.name.split(" ")[0]} asks you to top up AI credits`, body: "Skills are running low this month. Top up in a click from Home or Usage.", actionUrl: "/dashboard?topup=1", actionLabel: "Top up" })));
  return { ok: "Sent." };
}
