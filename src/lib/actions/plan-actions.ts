"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";
import { activateQueued } from "@/lib/active-slots";
import { runAutopilot } from "@/lib/autopilot-runner";
import { adjustAiCredits, confirmTopUp } from "@/lib/ai-credits";
import type { PlanTier } from "@/generated/prisma";

const TIERS: PlanTier[] = ["BASIC", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"];
const num = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : Number(v));

function revalidatePlans() {
  revalidatePath("/ops/plans");
  revalidatePath("/settings/usage");
  revalidatePath("/projects");
}

/** Admin: a plan's slots, AI and team credits and price (all placeholders until pricing is decided). */
export async function savePlanAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const tier = String(formData.get("tier") ?? "") as PlanTier;
  if (!TIERS.includes(tier)) return;
  const slots = Math.round(Number(formData.get("activeSlots")));
  const ai = Math.round(Number(formData.get("monthlyAiCredits")));
  const team = Math.round(Number(formData.get("monthlyTeamCredits")));
  const price = num(formData.get("priceAmount"));
  if (![slots, ai, team].every((n) => Number.isFinite(n) && n >= 0) || slots < 1 || slots > 50 || (price !== null && !(price >= 0))) return;
  const before = await prisma.plan.findUnique({ where: { tier } });
  await prisma.plan.upsert({ where: { tier }, update: { activeSlots: slots, monthlyAiCredits: ai, monthlyTeamCredits: team, priceAmount: price }, create: { tier, activeSlots: slots, monthlyAiCredits: ai, monthlyTeamCredits: team, priceAmount: price } });
  // More slots start queued, approved projects right away.
  if (!before || slots > before.activeSlots) {
    const clients = await prisma.client.findMany({ where: { planTier: tier }, select: { id: true } });
    for (const c of clients) for (const id of await activateQueued(c.id)) await runAutopilot(id);
  }
  revalidatePlans();
}

/** Kept for the old settings form: only the slots. */
export async function setPlanSlotsAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const tier = String(formData.get("tier") ?? "") as PlanTier;
  const slots = Math.round(Number(formData.get("activeSlots")));
  if (!TIERS.includes(tier) || !Number.isFinite(slots) || slots < 1 || slots > 50) return;
  await prisma.plan.upsert({ where: { tier }, update: { activeSlots: slots }, create: { tier, activeSlots: slots } });
  const clients = await prisma.client.findMany({ where: { planTier: tier }, select: { id: true } });
  for (const c of clients) for (const id of await activateQueued(c.id)) await runAutopilot(id);
  revalidatePlans();
}

/** Admin: an AI-credit bundle's size and price (placeholders), or turn it off. */
export async function saveBundleAction(formData: FormData) {
  await requireOpsRole(["ADMIN"]);
  const id = String(formData.get("id") ?? "");
  const size = Math.round(Number(formData.get("size")));
  const price = num(formData.get("priceAmount"));
  const active = formData.get("active") === "on";
  if (!Number.isFinite(size) || size < 1 || (price !== null && !(price >= 0))) return;
  if (id) await prisma.aiCreditBundle.update({ where: { id }, data: { size, priceAmount: price, active } });
  else await prisma.aiCreditBundle.create({ data: { size, priceAmount: price, active: true, sortOrder: size } });
  revalidatePlans();
}

/** Admin / PM: confirm or reject a client's top-up request (no payment in this phase); the ledger keeps who. */
export async function decideTopUpAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const id = String(formData.get("requestId") ?? "");
  const approve = formData.get("decision") === "confirm";
  const req = await confirmTopUp(id, viewer.userId, approve);
  revalidatePlans();
  if (req) revalidatePath(`/ops/clients/${req.clientId}/admin`);
}

/** Admin: add or remove AI credits for one client, with a reason (logged). */
export async function adjustAiCreditsAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "");
  const amount = Math.round(Number(formData.get("amount")));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!clientId || !Number.isFinite(amount) || amount === 0 || reason.length < 3) return;
  await adjustAiCredits(clientId, amount, reason, viewer.userId);
  // The ledger row itself is the log: amount, reason (note) and who (createdById).
  revalidatePath(`/ops/clients/${clientId}/admin`);
  revalidatePath("/settings/usage");
}
