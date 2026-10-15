"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOpsRole } from "@/lib/authz";
import { FACT_LABELS, isCategory } from "@/lib/output-categories";

/**
 * Output library (Phase U): "+ Add how it did" (a short note, an optional number and a label) on a piece the client
 * can see, by the client or Klingit staff; and staff fixing a piece's category. Facts also show in Insights.
 */

export type FactState = { error?: string; ok?: string };

async function target(key: string) {
  const id = key.slice(2);
  if (key.startsWith("a_")) {
    const a = await prisma.asset.findUnique({ where: { id }, select: { id: true, clientId: true } });
    return a ? { clientId: a.clientId, assetId: a.id, skillOutputId: null } : null;
  }
  if (key.startsWith("s_")) {
    const o = await prisma.skillOutput.findUnique({ where: { id }, select: { id: true, clientId: true } });
    return o ? { clientId: o.clientId, assetId: null, skillOutputId: o.id } : null;
  }
  return null;
}

export async function addOutputFactAction(_prev: FactState, formData: FormData): Promise<FactState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in again." };
  const t = await target(String(formData.get("key") ?? ""));
  if (!t) return { error: "That piece is gone." };
  const staff = session.user.role === "INTERNAL";
  if (!staff && !(await prisma.clientUser.findFirst({ where: { userId: session.user.id, clientId: t.clientId }, select: { id: true } }))) return { error: "That piece isn't yours." };
  const label = String(formData.get("label") ?? "").trim();
  const custom = String(formData.get("customLabel") ?? "").trim();
  const name = label === "Other" ? custom : label;
  if (!name || (!FACT_LABELS.includes(label as (typeof FACT_LABELS)[number]) && label !== "")) return { error: "Pick a label." };
  const rawValue = String(formData.get("value") ?? "").replace(/[\s,]/g, "");
  const value = rawValue ? Number(rawValue) : null;
  if (value != null && (!Number.isFinite(value) || value < 0)) return { error: "The number doesn't look right." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 140) || null;
  if (value == null && !note) return { error: "Add a number or a short note." };
  await prisma.outputFact.create({ data: { ...t, label: name.slice(0, 40), value, note, source: staff ? "staff" : "client", createdByUserId: session.user.id } });
  revalidatePath("/library", "layout");
  revalidatePath("/insights");
  return { ok: "Saved." };
}

export async function setOutputCategoryAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const assetId = String(formData.get("assetId") ?? "");
  const category = String(formData.get("category") ?? "");
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { clientId: true, category: true, name: true } });
  if (!asset) return;
  const next = isCategory(category) ? category : null;
  await prisma.asset.update({ where: { id: assetId }, data: { category: next } });
  await prisma.auditLog.create({ data: { clientId: asset.clientId, actorUserId: viewer.userId, area: "library", action: `Category of “${asset.name}” set to ${next ?? "automatic"}`, before: { category: asset.category }, after: { category: next } } });
  revalidatePath("/library", "layout");
  revalidatePath(`/ops/clients/${asset.clientId}/project-files`);
}
