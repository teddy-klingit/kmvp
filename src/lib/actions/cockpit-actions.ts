"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { addAssetVersion } from "@/lib/qc/quality-check";
import { runBrandCheck } from "@/lib/qc/brand-check";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/lib/auth";
import { requireOpsRole } from "@/lib/authz";
import { logDecision } from "@/lib/decision-log";
import { postProjectEvent } from "@/lib/project-events";
import { createStaffNote } from "@/lib/staff-notes";
import { snapshotLines } from "@/lib/autopilot-runner";
import { generateDraftEstimate, type UnresolvedNeed } from "@/lib/estimate-generation";
import { saveUpload, rejectUpload } from "@/lib/uploads";
import { DEMO_PASSWORD, DEMO_PERSONAS } from "@/lib/demo-personas";
import { addBusinessDays, formatDay, FIRST_DRAFT_BUSINESS_DAYS } from "@/lib/project-state";
import { jsonArray } from "@/lib/utils";
import { COMPLEXITY_LABEL } from "@/lib/estimate-display";
import type { ComplexityTier } from "@/generated/prisma";
import { notify } from "@/lib/notifier";

export type CockpitState = { error?: string; ok?: string };

/** Estimates are valid this long from when they're sent — the same rule for v1 and every revision. */
const ESTIMATE_VALID_MS = 4 * 86400000;

function revalidate(projectId: string) {
  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath("/ops", "layout");
  revalidatePath(`/projects/${projectId}`, "layout");
}

async function activeProject(projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, status: { notIn: ["DRAFT", "ARCHIVED"] } } });
}

async function notifyClientOwner(projectId: string, title: string, body: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;
  const owner = await prisma.clientUser.findFirst({ where: { clientId: project.clientId, permission: "OWNER" } });
  if (!owner) return;
  await notify({ userId: owner.userId, clientId: project.clientId, projectId, type: "APPROVAL_NEEDED", title, body, actionUrl: `/projects/${projectId}`, actionLabel: "Review" });
}

// ─── Autopilot ──────────────────────────────────────────────────────────────

export async function setAutopilotAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const on = formData.get("on") === "1";
  const project = await activeProject(projectId);
  if (!project || project.autopilot === on) return;
  await prisma.project.update({
    where: { id: projectId },
    data: on ? { autopilot: true, autopilotPausedAt: null, autopilotPausedByUserId: null } : { autopilot: false, autopilotPausedAt: new Date(), autopilotPausedByUserId: viewer.userId },
  });
  await logDecision({ projectId, actorUserId: viewer.userId, area: "autopilot", action: on ? "Turned autopilot on" : "Paused autopilot", before: { autopilot: !on }, after: { autopilot: on } });
  revalidate(projectId);
}

// ─── Brief ──────────────────────────────────────────────────────────────────

const BRIEF_FIELDS = ["goals", "targetAudience", "successMetrics", "references", "deliverablesNotes"] as const;

export async function updateBriefAction(_prev: CockpitState, formData: FormData): Promise<CockpitState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const brief = await prisma.brief.findFirst({ where: { projectId, project: { status: { notIn: ["DRAFT", "ARCHIVED"] } } } });
  if (!brief) return { error: "This project has no brief." };

  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};
  for (const f of BRIEF_FIELDS) {
    const next = String(formData.get(f) ?? "").trim() || null;
    if (next !== (brief[f] ?? null)) {
      before[f] = brief[f] ?? null;
      after[f] = next;
    }
  }
  if (Object.keys(after).length === 0) return { error: "Nothing changed." };

  await prisma.brief.update({ where: { id: brief.id }, data: after });
  await prisma.briefRevision.create({
    data: {
      briefId: brief.id,
      goals: brief.goals,
      targetAudience: brief.targetAudience,
      successMetrics: brief.successMetrics,
      references: brief.references,
      changedByName: viewer.user.name,
    },
  });
  await logDecision({ projectId, actorUserId: viewer.userId, area: "brief", action: "Edited the brief", before, after, reason: reason || null, overridesAgentKey: "brief_agent" });
  revalidate(projectId);
  return { ok: "Brief saved." };
}

// ─── Estimate ───────────────────────────────────────────────────────────────

const LineSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("price"),
    deliverableType: z.string().min(1),
    complexityTier: z.enum(["LOW", "MEDIUM", "HIGH"]),
    quantity: z.number().int().min(1).max(500),
    detail: z.string().max(200).default(""),
  }),
  z.object({
    kind: z.literal("custom"),
    deliverable: z.string().min(1).max(120),
    detail: z.string().max(200).default(""),
    quantity: z.number().int().min(1).max(500).default(1),
    complexityTier: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().default(null),
    credits: z.number().int().min(0).max(10000),
    reason: z.string().trim().min(1, "Every custom line needs a reason."),
  }),
]);
const ResolutionSchema = z.object({ index: z.number().int().min(0), kind: z.enum(["priced", "excluded"]), credits: z.number().int().min(0).optional(), note: z.string().optional() });

export type EstimateLineInput = z.input<typeof LineSchema>;

/** Credits are always computed here: quantity × Price List cost, or the stated credits on a custom line. */
async function priceLines(lines: z.infer<typeof LineSchema>[]) {
  const priced: {
    deliverable: string;
    detail: string;
    quantity: number;
    complexityTier: ComplexityTier | null;
    priceListItemId: string | null;
    isCustom: boolean;
    customReason: string | null;
    credits: number;
    hours: number;
    order: number;
  }[] = [];
  for (const [order, l] of lines.entries()) {
    if (l.kind === "price") {
      const row = await prisma.priceListItem.findUnique({ where: { deliverableType_complexityTier: { deliverableType: l.deliverableType, complexityTier: l.complexityTier } } });
      if (!row || row.archivedAt) throw new Error(`${l.deliverableType} has no ${COMPLEXITY_LABEL[l.complexityTier].toLowerCase()} tier on the price list.`);
      priced.push({ deliverable: row.deliverableType, detail: l.detail, quantity: l.quantity, complexityTier: row.complexityTier, priceListItemId: row.id, isCustom: false, customReason: null, credits: l.quantity * row.creditCost, hours: l.quantity * row.creditCost, order });
    } else {
      priced.push({ deliverable: l.deliverable, detail: l.detail, quantity: l.quantity, complexityTier: l.complexityTier, priceListItemId: null, isCustom: true, customReason: l.reason, credits: l.credits, hours: l.credits, order });
    }
  }
  return priced;
}

/**
 * Saves the PM's estimate edits. If the client hasn't seen this estimate yet (DRAFT), it just updates.
 * If they have a version, saving creates v(n+1) with the required "Reason for the client" and sends it for
 * re-approval with the changes highlighted. The project stage never moves back; if the client declines,
 * the last approved version stays in force.
 */
export async function saveEstimateAction(_prev: CockpitState, formData: FormData): Promise<CockpitState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const project = await activeProject(projectId);
  if (!project) return { error: "Project not found." };
  const estimate = await prisma.estimate.findUnique({ where: { projectId }, include: { lineItems: { orderBy: { order: "asc" } } } });
  if (!estimate) return { error: "There's no estimate yet. Generate one first." };

  let lines: z.infer<typeof LineSchema>[];
  let resolutions: z.infer<typeof ResolutionSchema>[];
  try {
    lines = z.array(LineSchema).parse(JSON.parse(String(formData.get("lines") ?? "[]")));
    resolutions = z.array(ResolutionSchema).parse(JSON.parse(String(formData.get("resolutions") ?? "[]")));
  } catch (e) {
    const issue = e instanceof z.ZodError ? e.issues[0]?.message : null;
    return { error: issue ?? "Some lines aren't valid." };
  }

  const clientHasVersion = estimate.status !== "DRAFT";
  if (clientHasVersion && !reason) return { error: "Add a reason for the client. They see it with the changes." };

  // Out-of-scope items: priced ones become custom lines, excluded ones are marked and stay out.
  const needs = jsonArray<UnresolvedNeed>(estimate.unresolvedNeeds);
  for (const r of resolutions) {
    const need = needs[r.index];
    if (!need || need.resolution) continue;
    if (r.kind === "priced") {
      if (r.credits === undefined) return { error: `Add credits for “${need.description}”.` };
      lines.push({ kind: "custom", deliverable: need.description, detail: r.note ?? "", quantity: 1, complexityTier: null, credits: r.credits, reason: "Out-of-scope item priced by the PM" });
    }
    need.resolution = { kind: r.kind, byUserId: viewer.userId, byName: viewer.user.name, at: new Date().toISOString(), credits: r.credits, note: r.note };
  }

  let priced: Awaited<ReturnType<typeof priceLines>>;
  try {
    priced = await priceLines(lines);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't price these lines." };
  }
  if (priced.length === 0) return { error: "An estimate needs at least one line." };
  const total = priced.reduce((n, l) => n + l.credits, 0);
  const beforeLines = await snapshotLines(estimate.id);
  const nextVersion = clientHasVersion ? estimate.version + 1 : estimate.version;

  await prisma.$transaction(async (tx) => {
    await tx.estimateLineItem.deleteMany({ where: { estimateId: estimate.id } });
    await tx.estimateLineItem.createMany({ data: priced.map((l) => ({ ...l, estimateId: estimate.id })) });
    await tx.estimate.update({
      where: { id: estimate.id },
      data: {
        totalCredits: total,
        totalHours: priced.reduce((n, l) => n + l.hours, 0),
        unresolvedNeeds: needs.length ? needs : undefined,
        ...(clientHasVersion
          ? { version: nextVersion, revisionReason: reason, status: "SENT", sentAt: new Date(), expiresAt: new Date(Date.now() + ESTIMATE_VALID_MS), respondedAt: null, sentByStaffId: viewer.id }
          : {}),
      },
    });
    if (clientHasVersion) {
      await tx.estimateRevision.updateMany({ where: { estimateId: estimate.id, status: "SENT" }, data: { status: "SUPERSEDED" } });
    }
  });

  const afterLines = await snapshotLines(estimate.id);
  if (clientHasVersion) {
    await prisma.estimateRevision.upsert({
      where: { estimateId_version: { estimateId: estimate.id, version: nextVersion } },
      update: { lineItems: afterLines, totalCredits: total, reason, createdByUserId: viewer.userId, status: "SENT" },
      create: { estimateId: estimate.id, version: nextVersion, lineItems: afterLines, totalCredits: total, reason, createdByUserId: viewer.userId, status: "SENT" },
    });
    await postProjectEvent(projectId, `Estimate v${nextVersion} sent: ${reason}`);
    await notifyClientOwner(projectId, `Revised estimate v${nextVersion}`, `${project.name} · ${total} credits · ${reason}`);
  }
  await logDecision({
    projectId,
    actorUserId: viewer.userId,
    area: "estimate",
    action: clientHasVersion ? `Sent estimate v${nextVersion}` : "Edited the draft estimate",
    before: { lines: beforeLines, total: estimate.totalCredits },
    after: { lines: afterLines, total },
    reason: reason || null,
    overridesAgentKey: "estimate_agent",
  });
  revalidate(projectId);
  return { ok: clientHasVersion ? `v${nextVersion} sent to the client.` : "Draft saved." };
}

export async function sendEstimateAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const estimate = await prisma.estimate.findFirst({ where: { projectId, status: "DRAFT", project: { status: { notIn: ["DRAFT", "ARCHIVED"] } } } });
  if (!estimate) return;
  const sent = await prisma.estimate.updateMany({
    where: { id: estimate.id, status: "DRAFT" },
    data: { status: "SENT", sentAt: new Date(), expiresAt: new Date(Date.now() + ESTIMATE_VALID_MS), sentByStaffId: viewer.id },
  });
  if (sent.count === 0) return;
  await prisma.estimateRevision.upsert({
    where: { estimateId_version: { estimateId: estimate.id, version: estimate.version } },
    update: { status: "SENT", lineItems: await snapshotLines(estimate.id), totalCredits: estimate.totalCredits },
    create: { estimateId: estimate.id, version: estimate.version, lineItems: await snapshotLines(estimate.id), totalCredits: estimate.totalCredits, createdByUserId: viewer.userId },
  });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  await notifyClientOwner(projectId, "Estimate approval", `Review ${project.name} · ${estimate.totalCredits} credits`);
  await postProjectEvent(projectId, `Estimate v${estimate.version} sent`);
  await logDecision({ projectId, actorUserId: viewer.userId, area: "estimate", action: `Sent estimate v${estimate.version}`, after: { total: estimate.totalCredits } });
  revalidate(projectId);
}

export async function regenerateEstimateAction(_prev: CockpitState, formData: FormData): Promise<CockpitState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const project = await activeProject(projectId);
  if (!project) return { error: "Project not found." };
  const result = await generateDraftEstimate(projectId, { replace: true });
  if (!result.ok) return { error: result.error };
  await logDecision({ projectId, actorUserId: viewer.userId, area: "estimate", action: "Regenerated the estimate with AI", after: { total: result.totalCredits, lines: result.lines } });
  revalidate(projectId);
  return { ok: `Regenerated: ${result.lines} lines, ${result.totalCredits} credits.` };
}

// ─── Staffing ───────────────────────────────────────────────────────────────

async function staffName(staffMemberId: string) {
  const s = await prisma.staffMember.findUnique({ where: { id: staffMemberId }, include: { user: true } });
  return s?.user.name ?? "Someone";
}

/** After a confirmed team changes: the first-draft clock restarts (confirmedAt) and the client is told. */
async function teamChanged(projectId: string, teamId: string, message: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (team?.confirmed) {
    await prisma.team.update({ where: { id: teamId }, data: { confirmedAt: new Date() } });
    await postProjectEvent(projectId, message);
  }
}

export async function addTeamMemberAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const staffMemberId = String(formData.get("staffMemberId") ?? "");
  const role = String(formData.get("role") ?? "").trim() || "Creative";
  const hours = Math.max(0, Number(formData.get("hours") ?? 0) || 0);
  const project = await activeProject(projectId);
  const staff = await prisma.staffMember.findUnique({ where: { id: staffMemberId } });
  if (!project || !staff) return;
  const team = await prisma.team.upsert({ where: { projectId }, update: {}, create: { projectId, proposedByStaffId: viewer.id } });
  const existing = await prisma.teamMember.findUnique({ where: { teamId_staffMemberId: { teamId: team.id, staffMemberId } } });
  if (existing) return;
  await prisma.teamMember.create({ data: { teamId: team.id, staffMemberId, roleOnProject: role, allocatedHours: hours } });
  const name = await staffName(staffMemberId);
  await logDecision({ projectId, actorUserId: viewer.userId, area: "staffing", action: `Added ${name} as ${role}`, after: { staffMemberId, role, hours }, overridesAgentKey: "staffing_agent" });
  await teamChanged(projectId, team.id, `${name.split(" ")[0]} joined your team as ${role.toLowerCase()}`);
  revalidate(projectId);
}

export async function removeTeamMemberAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const memberId = String(formData.get("teamMemberId") ?? "");
  const member = await prisma.teamMember.findFirst({ where: { id: memberId, team: { projectId } }, include: { staffMember: { include: { user: true } } } });
  if (!member) return;
  await prisma.teamMember.delete({ where: { id: memberId } });
  await logDecision({ projectId, actorUserId: viewer.userId, area: "staffing", action: `Removed ${member.staffMember.user.name}`, before: { staffMemberId: member.staffMemberId, role: member.roleOnProject }, overridesAgentKey: "staffing_agent" });
  await teamChanged(projectId, member.teamId, `${member.staffMember.user.name.split(" ")[0]} left your team`);
  revalidate(projectId);
}

export async function swapTeamMemberAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const memberId = String(formData.get("teamMemberId") ?? "");
  const staffMemberId = String(formData.get("staffMemberId") ?? "");
  const member = await prisma.teamMember.findFirst({ where: { id: memberId, team: { projectId } }, include: { staffMember: { include: { user: true } } } });
  if (!member || member.staffMemberId === staffMemberId) return;
  const clash = await prisma.teamMember.findUnique({ where: { teamId_staffMemberId: { teamId: member.teamId, staffMemberId } } });
  if (clash) return;
  await prisma.teamMember.update({ where: { id: memberId }, data: { staffMemberId, recommended: false } });
  const newName = await staffName(staffMemberId);
  await logDecision({
    projectId,
    actorUserId: viewer.userId,
    area: "staffing",
    action: `Swapped ${member.staffMember.user.name} for ${newName}`,
    before: { staffMemberId: member.staffMemberId },
    after: { staffMemberId },
    overridesAgentKey: "staffing_agent",
  });
  await teamChanged(projectId, member.teamId, `${newName.split(" ")[0]} replaces ${member.staffMember.user.name.split(" ")[0]} as ${member.roleOnProject.toLowerCase()}`);
  revalidate(projectId);
}

/** Role and hours edits never restart the first-draft clock — the team itself didn't change. */
export async function updateTeamMemberAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const memberId = String(formData.get("teamMemberId") ?? "");
  const role = String(formData.get("role") ?? "").trim();
  const hours = Math.max(0, Number(formData.get("hours") ?? 0) || 0);
  const member = await prisma.teamMember.findFirst({ where: { id: memberId, team: { projectId } }, include: { staffMember: { include: { user: true } } } });
  if (!member || !role || (role === member.roleOnProject && hours === member.allocatedHours)) return;
  await prisma.teamMember.update({ where: { id: memberId }, data: { roleOnProject: role, allocatedHours: hours } });
  await logDecision({
    projectId,
    actorUserId: viewer.userId,
    area: "staffing",
    action: `Updated ${member.staffMember.user.name}`,
    before: { role: member.roleOnProject, hours: member.allocatedHours },
    after: { role, hours },
  });
  revalidate(projectId);
}

export async function confirmTeamAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const team = await prisma.team.findUnique({ where: { projectId }, include: { members: { include: { staffMember: { include: { user: true } } } } } });
  if (!team || team.confirmed || team.members.length === 0) return;
  await prisma.team.update({ where: { id: team.id }, data: { confirmed: true, confirmedAt: new Date() } });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.status === "STAFFING") {
    await prisma.pipelineStage.updateMany({ where: { projectId, name: "STAFFING" }, data: { status: "COMPLETED", completedAt: new Date() } });
    await prisma.pipelineStage.updateMany({ where: { projectId, name: "PRODUCTION" }, data: { status: "ACTIVE", startedAt: new Date() } });
    await prisma.project.update({ where: { id: projectId }, data: { status: "IN_PRODUCTION", startedAt: project.startedAt ?? new Date() } });
  }
  const names = team.members.map((m) => m.staffMember.user.name.split(" ")[0]).join(", ");
  await postProjectEvent(projectId, `Your team is confirmed: ${names} · first draft by ${formatDay(addBusinessDays(new Date(), FIRST_DRAFT_BUSINESS_DAYS))}`);
  await logDecision({ projectId, actorUserId: viewer.userId, area: "staffing", action: "Confirmed the team", after: { members: names }, overridesAgentKey: "staffing_agent" });
  revalidate(projectId);
}

// ─── Dates ──────────────────────────────────────────────────────────────────

const ETA_STAGES = ["PRODUCTION", "FIRST_DRAFT_DELIVERY", "FEEDBACK", "FINAL_DELIVERY"] as const;

export async function updateDatesAction(_prev: CockpitState, formData: FormData): Promise<CockpitState> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Add a reason. The client sees it with the new dates." };
  const project = await activeProject(projectId);
  if (!project) return { error: "Project not found." };
  const parse = (v: FormDataEntryValue | null) => (v && String(v) ? new Date(`${String(v)}T12:00:00`) : null);

  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};
  const changes: string[] = [];
  const due = parse(formData.get("dueDate"));
  if ((due?.toDateString() ?? null) !== (project.dueDate?.toDateString() ?? null)) {
    before.dueDate = project.dueDate?.toISOString() ?? null;
    after.dueDate = due?.toISOString() ?? null;
    await prisma.project.update({ where: { id: projectId }, data: { dueDate: due } });
    if (due) changes.push(`due date moved to ${formatDay(due)}`);
  }
  const stages = await prisma.pipelineStage.findMany({ where: { projectId, name: { in: [...ETA_STAGES] } } });
  for (const s of stages) {
    const next = parse(formData.get(`eta_${s.name}`));
    if ((next?.toDateString() ?? null) === (s.etaAt?.toDateString() ?? null)) continue;
    before[s.name] = s.etaAt?.toISOString() ?? null;
    after[s.name] = next?.toISOString() ?? null;
    await prisma.pipelineStage.update({ where: { id: s.id }, data: { etaAt: next } });
    if (next) changes.push(`${s.name === "FIRST_DRAFT_DELIVERY" ? "first draft" : s.name === "FEEDBACK" ? "review" : s.name === "FINAL_DELIVERY" ? "final delivery" : "production"} now ${formatDay(next)}`);
  }
  if (Object.keys(after).length === 0) return { error: "No dates changed." };
  const summary = changes.length ? changes.join(", ") : "dates updated";
  await postProjectEvent(projectId, `${summary.charAt(0).toUpperCase()}${summary.slice(1)}: ${reason}`);
  await logDecision({ projectId, actorUserId: viewer.userId, area: "dates", action: "Changed dates", before, after, reason });
  revalidate(projectId);
  return { ok: "Dates saved and the client was told." };
}

// ─── Assets ─────────────────────────────────────────────────────────────────

export async function uploadAssetAction(_prev: CockpitState, formData: FormData): Promise<CockpitState> {
  const viewer = await requireOpsRole(["ADMIN", "PM", "CREATOR"]);
  const projectId = String(formData.get("projectId") ?? "");
  const assetId = String(formData.get("assetId") ?? "") || null;
  const file = formData.get("file");
  const name = String(formData.get("name") ?? "").trim();
  const format = String(formData.get("format") ?? "").trim();
  const project = await activeProject(projectId);
  if (!project) return { error: "Project not found." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  const rejected = rejectUpload(file);
  if (rejected) return { error: rejected };
  if (!assetId && (!name || !format)) return { error: "Add a title and a format." };

  const saved = await saveUpload(projectId, file);
  const version = await addAssetVersion({ projectId, clientId: project.clientId, assetId, name, format, file: saved, uploadedByUserId: viewer.userId });
  if (!version) return { error: "That asset isn't in this project." };
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: version.assetId } });
  await logDecision({ projectId, actorUserId: viewer.userId, area: "assets", action: `Uploaded ${asset.name} v${version.number}`, after: { assetId: asset.id, version: version.number, sizeBytes: saved.sizeBytes, mimeType: saved.mimeType } });
  // The Brand OS check runs behind the response; the version is "checking" until it's done.
  after(() => runBrandCheck(version.id));
  revalidate(projectId);
  return { ok: `${asset.name} v${version.number} uploaded. The Brand OS check is running; it goes to the client only from the quality check.` };
}

// ─── Conversation ──────────────────────────────────────────────────────────

/** A PM reply in the client's "With Klingit" thread, shown to the client under the staff member's name. */
export async function staffReplyAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const projectId = String(formData.get("projectId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) return;
  const project = await activeProject(projectId);
  if (!project) return;
  await prisma.comment.create({ data: { projectId, authorUserId: viewer.userId, body } });
  revalidate(projectId);
}

export async function staffNoteAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM", "CREATOR"]);
  const projectId = String(formData.get("projectId") ?? "");
  await createStaffNote(projectId, String(formData.get("body") ?? ""));
  revalidate(projectId);
}

/** "View as client": signs in as the project's demo client contact and opens their project page. */
export async function viewAsClientAction(formData: FormData) {
  await requireOpsRole(["ADMIN", "PM", "CREATOR"]);
  const projectId = String(formData.get("projectId") ?? "");
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { client: { include: { users: { include: { user: true } } } } } });
  const persona = project && DEMO_PERSONAS.find((p) => project.client.users.some((u) => u.user.email === p.email));
  if (!persona) return;
  await signIn("credentials", { email: persona.email, password: DEMO_PASSWORD, redirectTo: `/projects/${projectId}` });
}
