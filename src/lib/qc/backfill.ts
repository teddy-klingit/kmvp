import type { AssetVersionState, PrismaClient } from "@/generated/prisma";

/**
 * Gives every asset without a version its first one, the same way the quality-check migration did: work on a
 * project the client already reviews (or delivered work) counts as sent; anything else waits in the quality check.
 * Seeds and demo scripts call this after creating assets directly.
 */
export async function ensureAssetVersions(db: PrismaClient) {
  const assets = await db.asset.findMany({ where: { versions: { none: {} } }, include: { project: { select: { status: true, deliveredAt: true } } } });
  for (const a of assets) {
    const sent = a.status === "DELIVERED" || Boolean(a.project.deliveredAt) || ["AWAITING_REVIEW", "IN_FEEDBACK", "DELIVERED"].includes(a.project.status);
    const state: AssetVersionState = !sent ? "QC_READY" : a.status === "APPROVED" || a.status === "DELIVERED" ? "APPROVED" : a.status === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "SENT_TO_CLIENT";
    await db.assetVersion.create({
      data: { assetId: a.id, projectId: a.projectId, number: a.version, state, storageKey: a.storageKey, mimeType: a.mimeType, sizeBytes: a.sizeBytes, fileUrl: a.fileUrl, uploadedByUserId: a.uploadedByUserId, sentAt: sent ? (a.project.deliveredAt ?? a.createdAt) : null, createdAt: a.createdAt },
    });
    if (sent && a.sentVersion === null) await db.asset.update({ where: { id: a.id }, data: { sentVersion: a.version } });
  }
  return assets.length;
}
