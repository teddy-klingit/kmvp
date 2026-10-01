import { prisma } from "@/lib/prisma";
import { assetTitle, formatLabel } from "@/lib/asset-display";
import type { AssetStatus } from "@/generated/prisma";
import type { ReviewAsset } from "@/components/portal/asset-review-viewer";

/** Assets with their pinned/timestamped comments, shaped for AssetReviewGrid. */
export async function loadReviewAssets(projectId: string, clientId: string, statuses?: AssetStatus[]): Promise<ReviewAsset[]> {
  const [assets, comments] = await Promise.all([
    prisma.asset.findMany({
      where: { projectId, clientId, ...(statuses ? { status: { in: statuses } } : {}) },
      orderBy: { createdAt: "asc" },
    }),
    prisma.comment.findMany({
      where: { projectId, archivedAt: null, assetId: { not: null } },
      include: { author: true, clientAuthor: { include: { user: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return assets.map((asset) => ({
    id: asset.id,
    name: assetTitle(asset.name, asset.format),
    format: formatLabel(asset.format),
    thumbnailColor: asset.thumbnailColor,
    status: asset.status,
    type: asset.type,
    durationSeconds: asset.durationSeconds,
    comments: comments
      .filter((c) => c.assetId === asset.id)
      .map((c) => ({
        id: c.id,
        body: c.body,
        xPercent: c.xPercent,
        yPercent: c.yPercent,
        widthPercent: c.widthPercent,
        heightPercent: c.heightPercent,
        timestampSeconds: c.timestampSeconds,
        createdAt: c.createdAt.toISOString(),
        authorName: c.clientAuthor?.user.name ?? c.author?.name ?? "Someone",
      })),
  }));
}
