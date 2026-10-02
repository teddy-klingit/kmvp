"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";
import { activateQueued } from "@/lib/active-slots";
import { runAutopilot } from "@/lib/autopilot-runner";
import type { PlanTier } from "@/generated/prisma";

const TIERS: PlanTier[] = ["STARTER", "GROWTH", "SCALE", "ENTERPRISE"];

/** Admin: how many projects a plan runs at once. More slots start queued, approved projects right away. */
export async function setPlanSlotsAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const tier = String(formData.get("tier") ?? "") as PlanTier;
  const slots = Math.round(Number(formData.get("activeSlots")));
  if (!TIERS.includes(tier) || !Number.isFinite(slots) || slots < 1 || slots > 50) return;
  await prisma.plan.upsert({ where: { tier }, update: { activeSlots: slots }, create: { tier, activeSlots: slots } });
  const clients = await prisma.client.findMany({ where: { planTier: tier }, select: { id: true } });
  for (const c of clients) for (const id of await activateQueued(c.id)) await runAutopilot(id);
  revalidatePath("/ops/settings");
  revalidatePath("/projects");
}
