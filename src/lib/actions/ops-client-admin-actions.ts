"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { activateQueued } from "@/lib/active-slots";
import { runAutopilot } from "@/lib/autopilot-runner";
import { requireOpsRole } from "@/lib/authz";
import { adjustAiCredits, ensurePeriod, planFor } from "@/lib/ai-credits";
import type { PlanTier } from "@/generated/prisma";

export async function updateClientPlanAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  const planTier = String(formData.get("planTier") ?? "") as PlanTier;
  if (!["BASIC", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"].includes(planTier)) return;

  // This month moves to the new plan: team allowance from the plan, and the AI allowance difference as an adjustment.
  const { period, plan: oldPlan } = await ensurePeriod(clientId);
  const plan = await planFor(planTier);
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
