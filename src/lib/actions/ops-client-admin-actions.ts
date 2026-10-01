"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";

export async function updateClientPlanAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  const planTier = String(formData.get("planTier") ?? "") as "STARTER" | "GROWTH" | "SCALE";
  if (!["STARTER", "GROWTH", "SCALE"].includes(planTier)) return;

  const allowance = { STARTER: 16, GROWTH: 40, SCALE: 80 }[planTier];
  await prisma.client.update({ where: { id: clientId }, data: { planTier, monthlyCreditAllowance: allowance } });
  revalidatePath(`/ops/clients/${clientId}/admin`);
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
