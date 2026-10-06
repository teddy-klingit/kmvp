import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { postProjectEvent } from "@/lib/project-events";
import { clientVisibleAsset } from "@/lib/qc/visibility";

/** The client approves the version they were sent: the asset and that version both read approved. */
export async function approveSentVersions(where: Prisma.AssetWhereInput) {
  const assets = await prisma.asset.findMany({ where: { ...where, ...clientVisibleAsset }, select: { id: true, sentVersion: true } });
  for (const a of assets) {
    await prisma.$transaction([
      prisma.asset.update({ where: { id: a.id }, data: { status: "APPROVED" } }),
      prisma.assetVersion.updateMany({ where: { assetId: a.id, number: a.sentVersion! }, data: { state: "APPROVED" } }),
    ]);
  }
  return assets.length;
}

/** Once every asset is approved, the project moves on to final delivery. */
export async function settleReviewRound(projectId: string) {
  const open = await prisma.asset.count({ where: { projectId, ...clientVisibleAsset, status: { in: ["IN_REVIEW", "CHANGES_REQUESTED"] } } });
  if (open > 0) return;
  const moved = await prisma.project.updateMany({ where: { id: projectId, status: "AWAITING_REVIEW" }, data: { status: "IN_FEEDBACK" } });
  if (moved.count > 0) await postProjectEvent(projectId, "All assets approved");
}
