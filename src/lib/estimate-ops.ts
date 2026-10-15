import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logDecision } from "@/lib/decision-log";
import { postProjectEvent } from "@/lib/project-events";
import { snapshotLines } from "@/lib/autopilot-runner";
import type { UnresolvedNeed } from "@/lib/estimate-generation";
import { jsonArray } from "@/lib/utils";
import { lineRow, priceLines, sendBlockers, totals } from "@/lib/estimate-lines";
import { notify } from "@/lib/notifier";

/**
 * Saving and sending an estimate (Phase S step 3; shared in Phase T): the cockpit's editor and Today's inline
 * editor both call these, so both are priced, guarded and logged the same way (Decision log, project events,
 * the client's notice).
 */

type Viewer = { id: string; userId: string; user: { name: string } };

/** Estimates are valid this long from when they're sent — the same rule for v1 and every revision. */
export const ESTIMATE_VALID_MS = 4 * 86400000;


export async function notifyClientOwner(projectId: string, title: string, body: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;
  const owner = await prisma.clientUser.findFirst({ where: { clientId: project.clientId, permission: "OWNER" } });
  if (!owner) return;
  await notify({ userId: owner.userId, clientId: project.clientId, projectId, type: "APPROVAL_NEEDED", title, body, actionUrl: `/projects/${projectId}`, actionLabel: "Review" });
}

export const LineSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("price"),
    priceListItemId: z.string().min(1),
    quantity: z.number().int().min(1).max(500),
    detail: z.string().max(200).default(""),
    /** Estimate and quote items: the PM's number, and whether they confirmed it. */
    credits: z.number().min(0).max(10000).nullable().default(null),
    confirmed: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("custom"),
    deliverable: z.string().min(1).max(120),
    detail: z.string().max(200).default(""),
    quantity: z.number().int().min(1).max(500).default(1),
    credits: z.number().min(0).max(10000),
    reason: z.string().trim().min(1, "Every custom line needs a reason."),
    balance: z.enum(["pm", "creative"]).default("creative"),
    taskType: z.string().max(80).nullable().default(null),
  }),
  z.object({ kind: z.literal("pm"), credits: z.number().min(0).max(10000), detail: z.string().max(200).default("") }),
]);
export const ResolutionSchema = z.object({ index: z.number().int().min(0), kind: z.enum(["priced", "excluded"]), credits: z.number().min(0).optional(), note: z.string().optional() });

export type EstimateLineInput = z.input<typeof LineSchema>;

/** Credits are always computed on the server (estimate-lines.ts): quantity × the item's credits, or the PM's number. */
async function priceEstimate(lines: z.infer<typeof LineSchema>[]) {
  const ids = lines.flatMap((l) => (l.kind === "price" ? [l.priceListItemId] : []));
  const items = await prisma.priceListItem.findMany({ where: { id: { in: ids } } });
  return priceLines(lines, items);
}

/**
 * Saves the PM's estimate edits. If the client hasn't seen this estimate yet (DRAFT), it just updates.
 * If they have a version, saving creates v(n+1) with the required "Reason for the client" and sends it for
 * re-approval with the changes highlighted. The project stage never moves back; if the client declines,
 * the last approved version stays in force.
 */
export async function saveEstimate(viewer: Viewer, projectId: string, input: { lines: unknown; resolutions: unknown; reason: string }): Promise<{ error?: string; ok?: string; sent?: boolean }> {
  const reason = input.reason.trim();
  const project = await prisma.project.findFirst({ where: { id: projectId, status: { notIn: ["DRAFT", "ARCHIVED"] } } });
  if (!project) return { error: "Project not found." };
  const estimate = await prisma.estimate.findUnique({ where: { projectId }, include: { lineItems: { orderBy: { order: "asc" } } } });
  if (!estimate) return { error: "There's no estimate yet. Generate one first." };

  let lines: z.infer<typeof LineSchema>[];
  let resolutions: z.infer<typeof ResolutionSchema>[];
  try {
    lines = z.array(LineSchema).parse(input.lines);
    resolutions = z.array(ResolutionSchema).parse(input.resolutions);
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
      lines.push({ kind: "custom", deliverable: need.description, detail: r.note ?? "", quantity: 1, credits: r.credits, reason: "PM quote: not on the price list", balance: "creative", taskType: null });
    }
    need.resolution = { kind: r.kind, byUserId: viewer.userId, byName: viewer.user.name, at: new Date().toISOString(), credits: r.credits, note: r.note };
  }

  let priced: Awaited<ReturnType<typeof priceEstimate>>;
  try {
    priced = await priceEstimate(lines);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't price these lines." };
  }
  if (priced.length === 0) return { error: "An estimate needs at least one line." };
  const { pm: pmCredits, creative: creativeCredits, total } = totals(priced);
  // Sending a new version to the client: every estimate/quote line needs the PM's number first.
  if (clientHasVersion) {
    const blockers = sendBlockers({ lineItems: priced.map((l) => ({ needsConfirm: l.needsConfirm, confirmedAt: l.confirmed ? new Date() : null })), unresolvedNeeds: needs });
    if (blockers.length) return { error: `Can't send yet: ${blockers.join(" and ")}.` };
  }
  const beforeLines = await snapshotLines(estimate.id);
  const nextVersion = clientHasVersion ? estimate.version + 1 : estimate.version;

  await prisma.$transaction(async (tx) => {
    await tx.estimateLineItem.deleteMany({ where: { estimateId: estimate.id } });
    await tx.estimateLineItem.createMany({ data: priced.map((l) => ({ ...lineRow(l, viewer.id), estimateId: estimate.id })) });
    await tx.estimate.update({
      where: { id: estimate.id },
      data: {
        totalCredits: total,
        pmCredits,
        creativeCredits,
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
  return { sent: clientHasVersion, ok: clientHasVersion ? `v${nextVersion} sent to the client.` : "Draft saved." };
}


/** Sends the draft as it is. Refused while an estimate or quote line still needs the PM's number. */
export async function sendEstimate(viewer: Viewer, projectId: string): Promise<{ error?: string; ok?: string }> {
  const estimate = await prisma.estimate.findFirst({ where: { projectId, status: "DRAFT", project: { status: { notIn: ["DRAFT", "ARCHIVED"] } } }, include: { lineItems: true } });
  if (!estimate) return { error: "There’s no draft estimate to send." };
  // Estimate and quote lines need the PM's number, and unmatched items a PM quote, before it goes to the client.
  const blockers = sendBlockers(estimate);
  if (blockers.length) return { error: `Can’t send yet: ${blockers.join(" and ")}.` };
  const sent = await prisma.estimate.updateMany({
    where: { id: estimate.id, status: "DRAFT" },
    data: { status: "SENT", sentAt: new Date(), expiresAt: new Date(Date.now() + ESTIMATE_VALID_MS), sentByStaffId: viewer.id },
  });
  if (sent.count === 0) return { error: "It was already sent." };
  await prisma.estimateRevision.upsert({
    where: { estimateId_version: { estimateId: estimate.id, version: estimate.version } },
    update: { status: "SENT", lineItems: await snapshotLines(estimate.id), totalCredits: estimate.totalCredits },
    create: { estimateId: estimate.id, version: estimate.version, lineItems: await snapshotLines(estimate.id), totalCredits: estimate.totalCredits, createdByUserId: viewer.userId },
  });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  await notifyClientOwner(projectId, "Estimate approval", `Review ${project.name} · ${estimate.totalCredits} credits`);
  await postProjectEvent(projectId, `Estimate v${estimate.version} sent`);
  await logDecision({ projectId, actorUserId: viewer.userId, area: "estimate", action: `Sent estimate v${estimate.version}`, after: { total: estimate.totalCredits } });
  return { ok: `Estimate v${estimate.version} sent.` };
}

