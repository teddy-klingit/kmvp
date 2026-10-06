import { prisma } from "@/lib/prisma";
import { assetTitle, formatLabel } from "@/lib/asset-display";
import type { AssetStatus } from "@/generated/prisma";
import type { ReviewAsset } from "@/components/portal/asset-review-viewer";
import { clientVisibleVersion } from "@/lib/qc/visibility";

const LANG: Record<string, string> = { sv: "SV", no: "NO", da: "DA", en: "EN" };

/** A copy element's text per language and its open suggestion, from the asset's tags. */
function copyOf(tags: unknown): ReviewAsset["copy"] {
  const t = tags as { copy?: Record<string, string>; suggestion?: { by: string; lang: string; from: string; to: string } | null } | null;
  if (!t?.copy) return null;
  const s = t.suggestion;
  return {
    lines: Object.entries(t.copy).map(([lang, text]) => ({ lang: LANG[lang] ?? lang, text })),
    suggestion: s ? `${s.by} suggests ${s.to ? `"${s.to}"` : "removing"} "${s.from.trim()}" (${LANG[s.lang] ?? s.lang})` : null,
  };
}
import { clientVisibleAsset } from "@/lib/qc/visibility";

/** Assets with their pinned/timestamped comments, shaped for AssetReviewGrid. */
export async function loadReviewAssets(projectId: string, clientId: string, statuses?: AssetStatus[]): Promise<ReviewAsset[]> {
  const [assets, comments] = await Promise.all([
    prisma.asset.findMany({
      where: { projectId, clientId, ...clientVisibleAsset, ...(statuses ? { status: { in: statuses } } : {}) },
      orderBy: { createdAt: "asc" },
      include: { versions: { where: clientVisibleVersion, orderBy: { number: "desc" }, take: 1, select: { width: true, height: true, number: true } } },
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
    fileUrl: asset.storageKey && asset.mimeType?.startsWith("image/") ? `/api/assets/${asset.id}/download?inline=1` : null,
    aspect: asset.versions[0]?.width && asset.versions[0]?.height ? asset.versions[0].width / asset.versions[0].height : null,
    copy: copyOf(asset.tags),
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
