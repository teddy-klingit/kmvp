"use server";

import { withAiCharge, assistantCharge, ASSISTANTS } from "@/lib/ai-context";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { requireOpsRole } from "@/lib/authz";
import { writePlanSuggestions } from "@/lib/content-plan-suggestions";
import { startStudio } from "@/lib/brief-studio/studio";

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
  revalidatePath("/plan");
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
  revalidatePath("/plan");
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
  revalidatePath("/plan");
}

// ---------------------------------------------------------------------
// Portal-side: the client reads their KPIs/calendar, generates fresh
// suggestions, and approves/rejects them.
// ---------------------------------------------------------------------

export type GenerateSuggestionsState = { error?: string | null };

export async function generateContentPlanSuggestionsAction(_prev: GenerateSuggestionsState, _formData: FormData): Promise<GenerateSuggestionsState> {
  const viewer = await getPortalViewer();
  const r = await withAiCharge(assistantCharge(viewer.clientId, viewer.userId, ASSISTANTS.contentPlan), () => writePlanSuggestions(viewer));
  if (!r.error) revalidatePath("/plan");
  return r;
}

export async function rejectContentPlanSuggestionAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const suggestionId = String(formData.get("suggestionId") ?? "");

  await prisma.contentPlanSuggestion.updateMany({
    where: { id: suggestionId, clientId: viewer.clientId },
    data: { status: "REJECTED", resolvedAt: new Date() },
  });

  revalidatePath("/plan");
}

/**
 * "Add" on a suggestion: it becomes a planned post on the calendar and a draft brief in the Brief studio, then
 * the Calendar confirms what was created with a link to the draft. The suggestion is claimed first, atomically, so
 * repeated clicks (the brief takes a few seconds) can never create a second draft.
 */
export async function approveContentPlanSuggestionAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const suggestionId = String(formData.get("suggestionId") ?? "");

  const claimed = await prisma.contentPlanSuggestion.updateMany({
    where: { id: suggestionId, clientId: viewer.clientId, status: "PENDING" },
    data: { status: "APPROVED", stage: "SCHEDULED", resolvedAt: new Date() },
  });
  // Already added (a second click, another tab): show what the first one created.
  if (claimed.count === 0) redirect(`/plan?added=${encodeURIComponent(suggestionId)}`);
  const suggestion = await prisma.contentPlanSuggestion.findUniqueOrThrow({ where: { id: suggestionId } });

  if (suggestion.platform && suggestion.suggestedVolumeChange) {
    const current = await prisma.contentPlanTarget.findUnique({
      where: { clientId_platform: { clientId: viewer.clientId, platform: suggestion.platform } },
    });
    const newVolume = Math.max(0, (current?.weeklyVolume ?? 0) + suggestion.suggestedVolumeChange);
    await prisma.contentPlanTarget.upsert({
      where: { clientId_platform: { clientId: viewer.clientId, platform: suggestion.platform } },
      update: { weeklyVolume: newVolume },
      create: { clientId: viewer.clientId, platform: suggestion.platform, weeklyVolume: newVolume },
    });
  }

  // It becomes a real PLANNED post on the calendar, on the proposed day (or a week out).
  if (suggestion.platform) {
    await prisma.contentPost.create({
      data: {
        clientId: viewer.clientId,
        platform: suggestion.platform,
        channelType: "ORGANIC",
        title: suggestion.title,
        status: "PLANNED",
        scheduledDate: suggestion.proposedDate && suggestion.proposedDate > new Date() ? suggestion.proposedDate : new Date(Date.now() + 7 * 86400000),
        sourceSuggestionId: suggestion.id,
      },
    });
  }

  // And a draft brief to start from. If writing it fails, the plan change and calendar entry still stand.
  try {
    const projectId = await withAiCharge(assistantCharge(viewer.clientId, viewer.userId, ASSISTANTS.brief), () => startStudio(viewer, `${suggestion.title}\n\n${suggestion.rationale}`));
    await prisma.contentPlanSuggestion.update({ where: { id: suggestion.id }, data: { briefedProjectId: projectId } });
  } catch {
    // Confirmed below without a draft link.
  }
  revalidatePath("/plan");
  revalidatePath("/projects");
  redirect(`/plan?added=${encodeURIComponent(suggestion.id)}`);
}
