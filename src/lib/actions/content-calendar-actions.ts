"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";

// ---------------------------------------------------------------------
// Ops-side: manage the underlying data (plan targets, business outcomes,
// logged posts) — mirrors how Ops manages other pre-integration data this
// session (e.g. Custom Apps) until a real organic/CRM integration exists.
// ---------------------------------------------------------------------

export async function setContentPlanTargetAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const clientId = String(formData.get("clientId") ?? "");
  const platform = String(formData.get("platform") ?? "").trim();
  const weeklyVolume = Number(formData.get("weeklyVolume") ?? 0);
  if (!clientId || !platform || !Number.isFinite(weeklyVolume)) return;

  await prisma.contentPlanTarget.upsert({
    where: { clientId_platform: { clientId, platform } },
    update: { weeklyVolume },
    create: { clientId, platform, weeklyVolume },
  });

  revalidatePath(`/ops/clients/${clientId}/content-plan`);
  revalidatePath("/planner");
}

export async function logBusinessOutcomeAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const clientId = String(formData.get("clientId") ?? "");
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");
  const revenue = formData.get("revenue") ? Number(formData.get("revenue")) : null;
  const leadsGenerated = formData.get("leadsGenerated") ? Number(formData.get("leadsGenerated")) : null;
  const note = String(formData.get("note") ?? "").trim();
  if (!clientId || !periodStart || !periodEnd) return;

  await prisma.clientBusinessOutcome.create({
    data: { clientId, periodStart: new Date(periodStart), periodEnd: new Date(periodEnd), revenue, leadsGenerated, note: note || null },
  });

  revalidatePath(`/ops/clients/${clientId}/content-plan`);
  revalidatePath("/planner");
}

export async function createContentPostAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM"]);
  const clientId = String(formData.get("clientId") ?? "");
  const platform = String(formData.get("platform") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const channelType = String(formData.get("channelType") ?? "ORGANIC") as "PAID" | "ORGANIC";
  const contentType = String(formData.get("contentType") ?? "").trim();
  const status = String(formData.get("status") ?? "PLANNED") as "PLANNED" | "PUBLISHED";
  const scheduledDate = String(formData.get("scheduledDate") ?? "");
  const impressions = formData.get("impressions") ? Number(formData.get("impressions")) : null;
  const engagementRate = formData.get("engagementRate") ? Number(formData.get("engagementRate")) : null;
  const videoViews = formData.get("videoViews") ? Number(formData.get("videoViews")) : null;
  if (!clientId || !platform || !title) return;

  await prisma.contentPost.create({
    data: {
      clientId,
      platform,
      title,
      channelType,
      contentType: contentType || null,
      status,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      publishedDate: status === "PUBLISHED" ? new Date() : null,
      impressions,
      engagementRate,
      videoViews,
    },
  });

  revalidatePath(`/ops/clients/${clientId}/content-plan`);
  revalidatePath("/planner");
}
