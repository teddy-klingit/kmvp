"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { activateQueued } from "@/lib/active-slots";
import { runAutopilot } from "@/lib/autopilot-runner";
import { requireOpsRole } from "@/lib/authz";
import { adjustAiCredits, ensurePeriod, planFor } from "@/lib/ai-credits";
import type { PlanTier } from "@/generated/prisma";
import { LIVE_AD_PROVIDERS, setLiveAdsOwner, type LiveAdProvider } from "@/lib/integrations/live-ads-owner";

export async function updateClientPlanAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  const planTier = String(formData.get("planTier") ?? "") as PlanTier;
  if (!["BASIC", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"].includes(planTier)) return;

  // This month moves to the new plan: team allowance from the plan, and the AI allowance difference as an adjustment.
  const { period, plan: oldPlan } = await ensurePeriod(clientId);
  const plan = await planFor(planTier);
  // Team credits follow the plan (teamAllowance), unless staff set an override on the client.
  await prisma.client.update({ where: { id: clientId }, data: { planTier, monthlyCreditAllowance: plan.monthlyTeamCredits } });
  await prisma.clientPlan.update({ where: { id: period.id }, data: { tier: planTier } });
  const diff = plan.monthlyAiCredits - oldPlan.monthlyAiCredits;
  if (diff !== 0 && !plan.ownModel) await adjustAiCredits(clientId, diff, `Plan changed to ${plan.name} this month`, viewer.userId);
  // A bigger plan starts queued, approved projects straight away.
  for (const id of await activateQueued(clientId)) await runAutopilot(id);
  revalidatePath(`/ops/clients/${clientId}/admin`);
  revalidatePath("/settings/usage");
}

export async function pauseClientAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  await prisma.client.update({ where: { id: clientId }, data: { status: "PAUSED" } });
  revalidatePath(`/ops/clients/${clientId}/admin`);
  revalidatePath("/ops/clients");
}

export async function reactivateClientAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  await prisma.client.update({ where: { id: clientId }, data: { status: "ACTIVE" } });
  revalidatePath(`/ops/clients/${clientId}/admin`);
  revalidatePath("/ops/clients");
}

export async function offboardClientAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  await prisma.client.update({ where: { id: clientId }, data: { status: "OFFBOARDED" } });
  revalidatePath(`/ops/clients/${clientId}/admin`);
  revalidatePath("/ops/clients");
}

/** Assign or unassign one of the platform's live ad accounts to this client (logged in the AuditLog). */
export async function setLiveAdsOwnerAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  const provider = String(formData.get("provider") ?? "") as LiveAdProvider;
  const assign = formData.get("assign") === "1";
  if (!LIVE_AD_PROVIDERS.some((p) => p.provider === provider) || !clientId) return;
  const { error } = await setLiveAdsOwner(provider, assign ? clientId : null, viewer.userId);
  if (error) throw new Error(error);
  revalidatePath(`/ops/clients/${clientId}/admin`);
  revalidatePath("/ops");
  revalidatePath("/insights", "layout");
}

/** Staff set (a number) or clear (empty) a client's team-credit override; logged in the AuditLog. */
export async function setTeamCreditsOverrideAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  const raw = String(formData.get("override") ?? "").trim();
  const override = raw === "" ? null : Math.round(Number(raw));
  if (!clientId || (override !== null && (!Number.isFinite(override) || override < 0))) return;
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { teamCreditsOverride: true, planTier: true } });
  if (client.teamCreditsOverride === override) return;
  const plan = await planFor(client.planTier);
  await prisma.$transaction([
    prisma.client.update({ where: { id: clientId }, data: { teamCreditsOverride: override } }),
    prisma.auditLog.create({
      data: {
        clientId,
        actorUserId: viewer.userId,
        area: "team-credits",
        action: override === null ? `Team credits back to the ${plan.name} plan (${plan.monthlyTeamCredits} a month)` : `Team credits set to ${override} a month (${plan.name} plan: ${plan.monthlyTeamCredits})`,
        before: { override: client.teamCreditsOverride, plan: plan.monthlyTeamCredits },
        after: { override, plan: plan.monthlyTeamCredits },
      },
    }),
  ]);
  revalidatePath(`/ops/clients/${clientId}/admin`);
  revalidatePath("/", "layout");
}
