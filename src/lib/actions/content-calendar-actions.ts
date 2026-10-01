"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { requireOpsRole } from "@/lib/authz";
import { generateContentPlanSuggestions } from "@/lib/ai/agents/content-plan-agent";
import { runIntake, createProjectFromAnalysis } from "@/lib/brief-intake";

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
  revalidatePath("/calendar");
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
  revalidatePath("/calendar");
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
  revalidatePath("/calendar");
}

// ---------------------------------------------------------------------
// Portal-side: the client reads their KPIs/calendar, generates fresh
// suggestions, and approves/rejects them.
// ---------------------------------------------------------------------

export type GenerateSuggestionsState = { error?: string | null };

export async function generateContentPlanSuggestionsAction(
  _prev: GenerateSuggestionsState,
  _formData: FormData
): Promise<GenerateSuggestionsState> {
  const viewer = await getPortalViewer();

  const [planTargets, recentPosts, followerSnapshots, businessOutcomes] = await Promise.all([
    prisma.contentPlanTarget.findMany({ where: { clientId: viewer.clientId } }),
    prisma.contentPost.findMany({
      where: { clientId: viewer.clientId, status: "PUBLISHED" },
      orderBy: { publishedDate: "desc" },
      take: 25,
    }),
    prisma.followerSnapshot.findMany({ where: { clientId: viewer.clientId }, orderBy: { capturedAt: "desc" }, take: 20 }),
    prisma.clientBusinessOutcome.findMany({ where: { clientId: viewer.clientId }, orderBy: { periodStart: "desc" }, take: 6 }),
  ]);

  const result = await generateContentPlanSuggestions({
    clientId: viewer.clientId,
    clientName: viewer.client.name,
    planTargets: planTargets.map((t) => ({ platform: t.platform, weeklyVolume: t.weeklyVolume })),
    recentPosts: recentPosts.map((p) => ({
      platform: p.platform,
      contentType: p.contentType,
      engagementRate: p.engagementRate,
      videoViews: p.videoViews,
      impressions: p.impressions,
    })),
    followerTrend: followerSnapshots.map((f) => ({ platform: f.platform, followerCount: f.followerCount, capturedAt: f.capturedAt.toISOString().slice(0, 10) })),
    businessOutcomes: businessOutcomes.map((o) => ({
      periodStart: o.periodStart.toISOString().slice(0, 10),
      periodEnd: o.periodEnd.toISOString().slice(0, 10),
      revenue: o.revenue,
      leadsGenerated: o.leadsGenerated,
    })),
  });

  if (!result.ok) return { error: result.error };

  await prisma.contentPlanSuggestion.createMany({
    data: result.data.suggestions.map((s) => ({
      clientId: viewer.clientId,
      title: s.title,
      rationale: s.rationale,
      platform: s.platform,
      suggestedVolumeChange: s.suggestedVolumeChange,
      sourceCadence: s.sourceCadence,
      stage: "IN_REVIEW",
    })),
  });

  revalidatePath("/calendar");
  return {};
}

export async function rejectContentPlanSuggestionAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const suggestionId = String(formData.get("suggestionId") ?? "");

  await prisma.contentPlanSuggestion.updateMany({
    where: { id: suggestionId, clientId: viewer.clientId },
    data: { status: "REJECTED", resolvedAt: new Date() },
  });

  revalidatePath("/calendar");
}

/** Approving flows straight into a new brief — same AI-intake path as
 * starting a brief from a Market Intelligence idea, so an approved
 * suggestion never dead-ends as just a calendar change. */
export async function approveContentPlanSuggestionAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const suggestionId = String(formData.get("suggestionId") ?? "");

  const suggestion = await prisma.contentPlanSuggestion.findFirst({
    where: { id: suggestionId, clientId: viewer.clientId },
  });
  if (!suggestion) return;

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

  // Approving visibly moves the suggestion into the plan, not just a
  // status flip — it becomes a real PLANNED post on the calendar, dated a
  // week out, so "Upcoming" shows exactly where the approval went.
  if (suggestion.platform) {
    await prisma.contentPost.create({
      data: {
        clientId: viewer.clientId,
        platform: suggestion.platform,
        channelType: "ORGANIC",
        title: suggestion.title,
        status: "PLANNED",
        scheduledDate: new Date(Date.now() + 7 * 86400000),
        sourceSuggestionId: suggestion.id,
      },
    });
  }

  const rawText = `${suggestion.title}\n\n${suggestion.rationale}`;
  let project;
  try {
    const analysis = await runIntake({
      clientId: viewer.clientId,
      client: viewer.client,
      rawText,
      link: "",
      fileName: "",
      fileText: "",
    });
    project = await createProjectFromAnalysis(viewer, analysis, rawText);
  } catch {
    // The plan change and calendar entry above still apply even if brief
    // creation fails — mark it scheduled without a linked brief rather
    // than losing the approval entirely.
    await prisma.contentPlanSuggestion.update({
      where: { id: suggestion.id },
      data: { status: "APPROVED", stage: "SCHEDULED", resolvedAt: new Date() },
    });
    revalidatePath("/calendar");
    return;
  }

  await prisma.contentPlanSuggestion.update({
    where: { id: suggestion.id },
    data: { status: "APPROVED", stage: "SCHEDULED", resolvedAt: new Date(), briefedProjectId: project.id },
  });

  redirect(`/projects/${project.id}`);
}
