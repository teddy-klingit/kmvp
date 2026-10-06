"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { loadProjectState } from "@/lib/project-state-loader";
import { onLabel } from "@/lib/context-label";
import { runAutopilot } from "@/lib/autopilot-runner";
import { activateQueued } from "@/lib/active-slots";
import type { SnapshotLine } from "@/lib/estimate-diff";
import { postProjectEvent } from "@/lib/project-events";
import { clientVisibleAsset } from "@/lib/qc/visibility";
import type { Prisma } from "@/generated/prisma";

type EmptyState = Record<string, never>;
const EMPTY: EmptyState = {};

export async function approveEstimateAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const estimateId = String(formData.get("estimateId") ?? "");

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, status: "SENT", project: { clientId: viewer.clientId } },
    include: { project: true },
  });
  if (!estimate) return;

  await prisma.estimate.update({
    where: { id: estimateId },
    data: { status: "APPROVED", respondedAt: new Date(), approvedVersion: estimate.version },
  });
  await prisma.estimateRevision.updateMany({ where: { estimateId, version: estimate.version }, data: { status: "APPROVED", respondedAt: new Date() } });

  // A revision approved after the first approval: the work continues, the stage never moves back.
  const isRevision = estimate.approvedVersion !== null || !["ESTIMATING", "BRIEFING"].includes(estimate.project.status);
  await postProjectEvent(estimate.projectId, estimate.version > 1 ? `Estimate v${estimate.version} approved` : "Estimate approved");
  if (!isRevision) {
    // It moves to Active (staffing) when a slot is free; otherwise it waits in the queue for one.
    if (estimate.project.status === "BRIEFING") await prisma.project.update({ where: { id: estimate.projectId }, data: { status: "ESTIMATING" } });
    const activated = await activateQueued(viewer.clientId);
    if (!activated.includes(estimate.projectId)) await postProjectEvent(estimate.projectId, "Queued: starts when an active slot frees up");
    // Autopilot: auto-staff what just became active, when every role has a strong match.
    for (const id of activated) await runAutopilot(id);
  }

  revalidatePath(`/projects/${estimate.projectId}`, "layout");
  revalidatePath(`/ops/projects/${estimate.projectId}`);
  revalidatePath("/dashboard");
}

/**
 * The client asks for changes. On a revision of an estimate they'd already approved, this declines it:
 * the last approved version is restored and stays in force.
 */
export async function requestEstimateChangesAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const estimateId = String(formData.get("estimateId") ?? "");
  const note = String(formData.get("note") ?? "");

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, status: "SENT", project: { clientId: viewer.clientId } },
  });
  if (!estimate) return;

  if (estimate.approvedVersion !== null) {
    const approved = await prisma.estimateRevision.findUnique({ where: { estimateId_version: { estimateId, version: estimate.approvedVersion } } });
    if (approved) {
      const lines = jsonArray<SnapshotLine & { customReason?: string | null }>(approved.lineItems);
      await prisma.$transaction([
        prisma.estimateLineItem.deleteMany({ where: { estimateId } }),
        prisma.estimateLineItem.createMany({
          data: lines.map((l, order) => ({
            estimateId,
            deliverable: l.deliverable,
            detail: l.detail ?? "",
            quantity: l.quantity,
            complexityTier: l.complexityTier,
            priceListItemId: l.priceListItemId ?? null,
            isCustom: Boolean(l.isCustom),
            customReason: l.customReason ?? null,
            credits: l.credits,
            hours: l.credits,
            order,
          })),
        }),
        prisma.estimate.update({ where: { id: estimateId }, data: { status: "APPROVED", totalCredits: approved.totalCredits, respondedAt: new Date() } }),
        prisma.estimateRevision.updateMany({ where: { estimateId, version: estimate.version }, data: { status: "DECLINED", respondedAt: new Date() } }),
      ]);
      await postProjectEvent(estimate.projectId, `Estimate v${estimate.version} declined · v${estimate.approvedVersion} stays in force`);
      revalidatePath(`/projects/${estimate.projectId}`, "layout");
      revalidatePath(`/ops/projects/${estimate.projectId}`);
      return;
    }
  }

  await prisma.estimate.update({
    where: { id: estimateId },
    data: { status: "CHANGES_REQUESTED", respondedAt: new Date(), notes: note || estimate.notes },
  });
  await prisma.estimateRevision.updateMany({ where: { estimateId, version: estimate.version }, data: { status: "DECLINED", respondedAt: new Date() } });

  revalidatePath(`/projects/${estimate.projectId}`, "layout");
  revalidatePath(`/ops/projects/${estimate.projectId}`);
}

export async function approveAllAssetsAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");

  // Only once the work is delivered: before that, IN_REVIEW is Klingit's internal QA.
  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId, status: "AWAITING_REVIEW" } });
  if (!project) return;

  // "Approve N in review" — assets the client asked to change stay with Klingit.
  await approveSentVersions({ projectId, status: "IN_REVIEW", ...clientVisibleAsset });
  await settleReviewRound(projectId);

  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function approveAssetAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const assetId = String(formData.get("assetId") ?? "");

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, status: "IN_REVIEW", ...clientVisibleAsset, client: { id: viewer.clientId }, project: { status: "AWAITING_REVIEW" } },
  });
  if (!asset) return;

  await approveSentVersions({ id: assetId });
  await settleReviewRound(asset.projectId);
  revalidatePath(`/projects/${asset.projectId}`, "layout");
}

/** The client approves the version they were sent: the asset and that version both read approved. */
async function approveSentVersions(where: Prisma.AssetWhereInput) {
  const assets = await prisma.asset.findMany({ where: { ...where, ...clientVisibleAsset }, select: { id: true, sentVersion: true } });
  for (const a of assets) {
    await prisma.$transaction([
      prisma.asset.update({ where: { id: a.id }, data: { status: "APPROVED" } }),
      prisma.assetVersion.updateMany({ where: { assetId: a.id, number: a.sentVersion! }, data: { state: "APPROVED" } }),
    ]);
  }
}

/** Once every asset is approved, the project moves on to final delivery. */
async function settleReviewRound(projectId: string) {
  const open = await prisma.asset.count({ where: { projectId, ...clientVisibleAsset, status: { in: ["IN_REVIEW", "CHANGES_REQUESTED"] } } });
  if (open > 0) return;
  const moved = await prisma.project.updateMany({ where: { id: projectId, status: "AWAITING_REVIEW" }, data: { status: "IN_FEEDBACK" } });
  if (moved.count > 0) await postProjectEvent(projectId, "All assets approved");
}

export async function requestAssetChangesAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const assetId = String(formData.get("assetId") ?? "");

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, ...clientVisibleAsset, client: { id: viewer.clientId } },
  });
  if (!asset) return;

  // Counted per asset: the second request on the same asset becomes a PM exception.
  await prisma.asset.update({ where: { id: assetId }, data: { status: "CHANGES_REQUESTED", changeRequestCount: { increment: 1 } } });
  await prisma.assetVersion.updateMany({ where: { assetId, number: asset.sentVersion! }, data: { state: "CHANGES_REQUESTED" } });
  revalidatePath(`/projects/${asset.projectId}`, "layout");
}

export async function postCommentAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const assetId = formData.get("assetId") ? String(formData.get("assetId")) : null;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId } });
  if (!project) return;

  const context = await messageContext(projectId, formData);
  await prisma.comment.create({
    data: { projectId, assetId: context.assetId ?? assetId, authorClientUserId: viewer.id, body, ...context.fields },
  });

  revalidatePath(`/projects/${projectId}`, "layout");
}

/**
 * Optional "what this message is about" chip. Only kinds we can link back to
 * are accepted, and the referenced row must belong to this project.
 */
async function messageContext(projectId: string, formData: FormData) {
  const kind = String(formData.get("contextKind") ?? "");
  const ref = String(formData.get("contextRef") ?? "");
  const raw = String(formData.get("contextLabel") ?? "").trim();
  if (!raw) return { fields: {} };
  const label = onLabel(raw).slice(0, 120);

  if (kind === "asset") {
    const asset = await prisma.asset.findFirst({ where: { id: ref, projectId, ...clientVisibleAsset }, select: { id: true } });
    return asset ? { assetId: asset.id, fields: { contextKind: kind, contextRef: asset.id, contextLabel: label } } : { fields: {} };
  }
  if (kind === "estimate_line") {
    const line = await prisma.estimateLineItem.findFirst({ where: { id: ref, estimate: { projectId } }, select: { id: true } });
    return line ? { fields: { contextKind: kind, contextRef: line.id, contextLabel: label } } : { fields: {} };
  }
  if (kind === "estimate" || kind === "brief") {
    return { fields: { contextKind: kind, contextRef: null, contextLabel: label } };
  }
  return { fields: {} };
}

export async function postPinCommentAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const xPercent = Number(formData.get("xPercent") ?? NaN);
  const yPercent = Number(formData.get("yPercent") ?? NaN);
  const widthPercent = formData.get("widthPercent") ? Number(formData.get("widthPercent")) : null;
  const heightPercent = formData.get("heightPercent") ? Number(formData.get("heightPercent")) : null;
  if (!body || !assetId || Number.isNaN(xPercent) || Number.isNaN(yPercent)) return EMPTY;

  const asset = await prisma.asset.findFirst({ where: { id: assetId, projectId, ...clientVisibleAsset, client: { id: viewer.clientId } } });
  if (!asset) return EMPTY;

  await prisma.comment.create({
    data: { projectId, assetId, authorClientUserId: viewer.id, body, xPercent, yPercent, widthPercent, heightPercent },
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  return EMPTY;
}

export async function postTimestampCommentAction(_prev: EmptyState, formData: FormData): Promise<EmptyState> {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const timestampSeconds = Number(formData.get("timestampSeconds") ?? NaN);
  if (!body || !assetId || Number.isNaN(timestampSeconds)) return EMPTY;

  const asset = await prisma.asset.findFirst({ where: { id: assetId, projectId, ...clientVisibleAsset, client: { id: viewer.clientId } } });
  if (!asset) return EMPTY;

  await prisma.comment.create({
    data: { projectId, assetId, authorClientUserId: viewer.id, body, timestampSeconds },
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  return EMPTY;
}

export async function rateProjectAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");
  const rating = Number(formData.get("rating") ?? 0);
  const feedback = String(formData.get("feedback") ?? "").trim();

  // Stars start empty: no rating is ever recorded unless the client picked one.
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;

  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId } });
  if (!project) return;

  await prisma.comment.create({
    data: {
      projectId,
      authorClientUserId: viewer.id,
      body: feedback ? `Rated ${rating}/5 — ${feedback}` : `Rated ${rating}/5.`,
    },
  });

  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function signOffProjectAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const projectId = String(formData.get("projectId") ?? "");

  const loaded = await loadProjectState(projectId, viewer.clientId);
  if (!loaded || loaded.state.stage !== "final" || loaded.state.ballInCourt !== "client") return;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "DELIVERED", deliveredAt: new Date() },
  });
  await prisma.pipelineStage.updateMany({
    where: { projectId, name: "FINAL_DELIVERY" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  // Rating is separate (RatingCard); signing off never invents one.
  await postProjectEvent(projectId, "Signed off and delivered");
  // Signing off frees the slot: the next approved project in the queue starts.
  for (const id of await activateQueued(viewer.clientId)) await runAutopilot(id);

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/dashboard");
}
