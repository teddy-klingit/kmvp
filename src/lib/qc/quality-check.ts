import type { AssetVersion, QcFlag } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { logDecision } from "@/lib/decision-log";
import { postProjectEvent } from "@/lib/project-events";
import { createStaffNote } from "@/lib/staff-notes";
import type { StoredCheck } from "@/lib/qc/brand-check";
import { notify } from "@/lib/notifier";

/**
 * The quality check (QCAdSet.dc.html): Klingit's step between the designer's upload and the client. Each asset's
 * latest version is checked; the PM or QA sends a flag back to the designer or accepts it with a reason, and
 * "Send to client" opens only when every flag is dealt with. Only then does the client get the work.
 */

/** Small teams: the person who made the work can't send it (configurable later). */
export const SELF_SEND_ALLOWED = false;

export type QcVersion = AssetVersion & { flags: QcFlag[]; asset: { id: string; name: string; format: string; platform: string | null; sentVersion: number | null; thumbnailColor: string; type: string } };

/** Each live asset's latest version, with its flags. */
export async function loadQcSet(projectId: string): Promise<QcVersion[]> {
  const assets = await prisma.asset.findMany({
    where: { projectId, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "asc" },
    include: { versions: { orderBy: { number: "desc" }, take: 1, include: { flags: { orderBy: { createdAt: "asc" } } } } },
  });
  return assets.flatMap((a) => (a.versions[0] ? [{ ...a.versions[0], asset: { id: a.id, name: a.name, format: a.format, platform: a.platform, sentVersion: a.sentVersion, thumbnailColor: a.thumbnailColor, type: a.type } }] : []));
}

/** Flags that still need a decision before the version can go: open ones, and ones the designer is fixing. */
export const blockingFlags = (v: Pick<QcVersion, "flags">) => v.flags.filter((f) => !f.late && f.status !== "ACCEPTED");

export type Gate = { canSend: boolean; toSend: QcVersion[]; blockers: string[] };

/** Whether "Send to client" is enabled for this viewer, and what it would send. */
export function qcGate(set: QcVersion[], viewerUserId: string): Gate {
  const toSend = set.filter((v) => v.state === "QC_READY");
  const checking = set.filter((v) => v.state === "CHECKING").length;
  const withDesigner = set.filter((v) => v.state === "DRAFT").length;
  const flagged = toSend.reduce((n, v) => n + blockingFlags(v).length, 0);
  const own = SELF_SEND_ALLOWED ? [] : toSend.filter((v) => v.uploadedByUserId === viewerUserId);
  const blockers = [
    toSend.length === 0 && "Nothing new to send",
    checking > 0 && `${checking} still being checked`,
    withDesigner > 0 && `${withDesigner} back with the designer`,
    flagged > 0 && `Fix or accept the ${flagged} flag${flagged === 1 ? "" : "s"} to send`,
    own.length > 0 && `You made ${own.map((v) => v.asset.name).join(", ")}: someone else on the team sends it`,
  ].filter((x): x is string => Boolean(x));
  return { canSend: blockers.length === 0, toSend, blockers };
}

/** "Send to designer": the flag goes back as a task and its version returns to draft. */
export async function sendFlagToDesigner(flagId: string, actorUserId: string) {
  const flag = await prisma.qcFlag.findUnique({ where: { id: flagId }, include: { version: { include: { asset: true } } } });
  if (!flag || flag.status === "ACCEPTED") return { error: "That flag is already dealt with." };
  const v = flag.version;
  await prisma.qcFlag.update({ where: { id: flagId }, data: { status: "SENT_TO_DESIGNER", resolvedByUserId: actorUserId, resolvedAt: new Date() } });
  // A version the client already has stays with the client; the fix comes as the next version.
  if (!flag.late && v.state !== "DRAFT") await prisma.assetVersion.update({ where: { id: v.id }, data: { state: "DRAFT" } });
  const task = `Fix ${v.asset.name} v${v.number}: ${flag.detail} (${flag.source}). Upload a new version when it's done.`;
  await createStaffNote(v.projectId, task);
  if (v.uploadedByUserId && v.uploadedByUserId !== actorUserId) {
    await notify({ userId: v.uploadedByUserId, projectId: v.projectId, clientId: v.asset.clientId, type: "SYSTEM", title: `Fix needed: ${v.asset.name}`, body: task, actionUrl: `/ops/projects/${v.projectId}/qc`, actionLabel: "Open quality check" });
  }
  await logDecision({ projectId: v.projectId, actorUserId, area: "assets", action: `Sent back to the designer: ${v.asset.name} v${v.number} · ${flag.label}` });
  return { ok: true as const };
}

/** "Accept as is": needs a reason, which goes in the decision log and overrides the check's agent run. */
export async function acceptFlag(flagId: string, actorUserId: string, reason: string) {
  const why = reason.trim().slice(0, 500);
  if (why.length < 3) return { error: "Say why it's fine as it is." };
  const flag = await prisma.qcFlag.findUnique({ where: { id: flagId }, include: { version: { include: { asset: true } } } });
  if (!flag || flag.status === "ACCEPTED") return { error: "That flag is already dealt with." };
  const v = flag.version;
  await prisma.qcFlag.update({ where: { id: flagId }, data: { status: "ACCEPTED", reason: why, resolvedByUserId: actorUserId, resolvedAt: new Date() } });
  if (v.checkRunId) await prisma.agentRun.update({ where: { id: v.checkRunId }, data: { overridden: true, overriddenByUserId: actorUserId, overrideReason: `${flag.label}: ${why}` } }).catch(() => undefined);
  await logDecision({ projectId: v.projectId, actorUserId, area: "assets", action: `Accepted as is: ${v.asset.name} v${v.number} · ${flag.label}`, before: { flag: flag.detail, source: flag.source }, reason: why });
  return { ok: true as const };
}

/**
 * "Send to client": every checked version goes to the client at once, the project moves to their review, the
 * client is notified and the timeline gets an event. Refused unless the gate is open for this viewer.
 */
export async function sendToClient(projectId: string, actorUserId: string) {
  const gate = qcGate(await loadQcSet(projectId), actorUserId);
  if (!gate.canSend) return { error: gate.blockers.join(" · ") };
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const now = new Date();
  for (const v of gate.toSend) {
    await prisma.$transaction([
      prisma.assetVersion.update({ where: { id: v.id }, data: { state: "SENT_TO_CLIENT", sentAt: now, sentByUserId: actorUserId } }),
      prisma.asset.update({
        where: { id: v.assetId },
        data: { sentVersion: v.number, version: v.number, status: "IN_REVIEW", storageKey: v.storageKey, mimeType: v.mimeType, sizeBytes: v.sizeBytes, ...(v.storageKey ? { fileUrl: `/api/assets/${v.assetId}/download?inline=1` } : {}) },
      }),
    ]);
  }
  const first = !project.deliveredAt;
  if (first) {
    await prisma.pipelineStage.updateMany({ where: { projectId, name: { in: ["QA", "FIRST_DRAFT_DELIVERY"] } }, data: { status: "COMPLETED", completedAt: now } });
    await prisma.pipelineStage.updateMany({ where: { projectId, name: "FEEDBACK" }, data: { status: "ACTIVE", startedAt: now } });
  }
  await prisma.project.update({ where: { id: projectId }, data: { status: "AWAITING_REVIEW", ...(first ? { deliveredAt: now } : {}) } });

  const n = gate.toSend.length;
  const checks = gate.toSend.reduce((a, v) => a + ((v.checks as StoredCheck[] | null)?.length ?? 0), 0);
  await postProjectEvent(projectId, `${first ? "First draft" : `${n} updated asset${n === 1 ? "" : "s"}`} sent · quality checked by Klingit`);
  const owner = await prisma.clientUser.findFirst({ where: { clientId: project.clientId, permission: "OWNER" } });
  if (owner) {
    await notify({
        userId: owner.userId,
        clientId: project.clientId,
        projectId,
        type: "APPROVAL_NEEDED",
        title: `${n} asset${n === 1 ? "" : "s"} ready to review`,
        body: `${project.name}: quality checked by Klingit${checks ? ` (${checks} checks)` : ""}.`,
        actionUrl: `/projects/${projectId}/work`,
        actionLabel: "Review",
      });
  }
  await logDecision({ projectId, actorUserId, area: "assets", action: `Sent ${n} asset${n === 1 ? "" : "s"} to the client`, after: { versions: gate.toSend.map((v) => `${v.asset.name} v${v.number}`) } });
  return { ok: true as const, sent: n };
}

/** A designer's upload: a new asset (v1) or the next version of one. Returns the version to check. */
export async function addAssetVersion(args: {
  projectId: string;
  clientId: string;
  assetId?: string | null;
  name: string;
  format: string;
  file: { storageKey: string; mimeType: string; sizeBytes: number };
  uploadedByUserId: string;
}) {
  const type = args.file.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE";
  if (args.assetId) {
    const asset = await prisma.asset.findFirst({ where: { id: args.assetId, projectId: args.projectId, status: { not: "ARCHIVED" } }, include: { versions: { orderBy: { number: "desc" }, take: 1 } } });
    if (!asset) return null;
    const number = Math.max(asset.version, asset.versions[0]?.number ?? 0) + 1;
    const version = await prisma.assetVersion.create({ data: { assetId: asset.id, projectId: args.projectId, number, state: "CHECKING", ...args.file, uploadedByUserId: args.uploadedByUserId } });
    // The client keeps the file they were sent; an unsent asset just shows its newest file to staff.
    await prisma.asset.update({
      where: { id: asset.id },
      data: { version: number, ...(asset.sentVersion === null ? { ...args.file, type, uploadedByUserId: args.uploadedByUserId, fileUrl: `/api/assets/${asset.id}/download?inline=1` } : {}) },
    });
    return version;
  }
  const asset = await prisma.asset.create({
    data: { projectId: args.projectId, clientId: args.clientId, name: args.name, format: args.format, type, status: "IN_REVIEW", ...args.file, uploadedByUserId: args.uploadedByUserId, sentVersion: null },
  });
  await prisma.asset.update({ where: { id: asset.id }, data: { fileUrl: `/api/assets/${asset.id}/download?inline=1` } });
  return prisma.assetVersion.create({ data: { assetId: asset.id, projectId: args.projectId, number: 1, state: "CHECKING", ...args.file, uploadedByUserId: args.uploadedByUserId } });
}

/** What the client's "Quality checked by Klingit" chip lists: the checks on the versions they have, all passed or accepted. Never a reason. */
export async function clientCheckSummary(projectId: string) {
  const versions = await prisma.assetVersion.findMany({
    where: { projectId, state: { in: ["SENT_TO_CLIENT", "APPROVED", "CHANGES_REQUESTED"] }, asset: { status: { not: "ARCHIVED" } } },
    include: { asset: { select: { sentVersion: true } } },
  });
  const current = versions.filter((v) => v.asset.sentVersion === v.number);
  const byLabel = new Map<string, { label: string; source: string; count: number }>();
  for (const v of current) {
    for (const c of (v.checks as StoredCheck[] | null) ?? []) {
      const e = byLabel.get(c.label) ?? { label: c.label, source: c.source, count: 0 };
      e.count += 1;
      byLabel.set(c.label, e);
    }
  }
  const items = [...byLabel.values()];
  return { total: items.reduce((a, i) => a + i.count, 0), items };
}
