import { prisma } from "@/lib/prisma";
import { assetTitle, formatLabel } from "@/lib/asset-display";
import { clientVisibleAsset, clientVisibleVersion } from "@/lib/qc/visibility";
import { expectedShape } from "@/lib/qc/specs";
import { clientCheckSummary } from "@/lib/qc/quality-check";
import { loadMeasuredAssets } from "@/lib/insights-data";

/**
 * One asset in the client's library, with how it performed: CTR next to the client's own average and the average
 * of its format, its rank among measured creative, and how it got made (versions, change rounds, approval).
 * Only work sent to the client.
 */
export async function loadAssetDetail(assetId: string, clientId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, clientId, ...clientVisibleAsset },
    include: {
      project: { select: { id: true, name: true, status: true } },
      versions: { where: clientVisibleVersion, orderBy: { number: "desc" }, select: { number: true, width: true, height: true, posterKey: true, sentAt: true, fps: true, durationSeconds: true } },
    },
  });
  if (!asset) return null;
  const [{ measured }, comments, approval, checks] = await Promise.all([
    loadMeasuredAssets(clientId),
    prisma.comment.count({ where: { assetId, archivedAt: null, kind: "MESSAGE" } }),
    prisma.decisionLog.findFirst({ where: { projectId: asset.projectId, area: "assets", action: { startsWith: "Approved" } }, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } }),
    clientCheckSummary(asset.projectId),
  ]);

  const v = asset.versions[0];
  const shape = expectedShape(asset.format);
  const format = formatLabel(asset.format);
  const family = asset.format.split(" · ")[0];
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const ranked = [...measured].sort((a, b) => b.ctr - a.ctr);
  const sameFormat = measured.filter((m) => m.format.split(" · ")[0] === family);
  const ctr = asset.performanceCtr;
  const clientAvg = avg(measured.map((m) => m.ctr));
  const formatAvg = avg(sameFormat.map((m) => m.ctr));
  const others = measured.filter((m) => m.id !== asset.id && m.title === assetTitle(asset.name, asset.format));
  const tags = (asset.tags ?? {}) as { copy?: Record<string, string> };

  return {
    id: asset.id,
    title: assetTitle(asset.name, asset.format),
    format,
    type: asset.type,
    status: asset.status,
    project: asset.project,
    ratio: v?.width && v?.height ? v.width / v.height : (shape?.ratio ?? 1),
    size: v?.width && v?.height ? `${v.width} × ${v.height}` : null,
    file: asset.storageKey ? `/api/assets/${asset.id}/download?inline=1` : null,
    download: asset.storageKey ? `/api/assets/${asset.id}/download` : null,
    poster: v?.posterKey ? `/api/assets/${asset.id}/download?part=poster` : null,
    video: asset.type === "VIDEO" ? { durationSeconds: v?.durationSeconds ?? asset.durationSeconds, fps: v?.fps ?? null } : null,
    copy: tags.copy ? Object.entries(tags.copy).map(([lang, text]) => ({ lang: lang.toUpperCase(), text })) : null,
    version: asset.sentVersion ?? asset.version,
    sentAt: v?.sentAt ?? null,
    changeRounds: asset.changeRequestCount,
    comments,
    approval: asset.status === "APPROVED" || asset.status === "DELIVERED" ? { by: approval?.actor?.name ?? null, at: approval?.createdAt ?? null } : null,
    checks: checks.total,
    performance:
      ctr === null
        ? null
        : {
            ctr,
            clientAvg,
            formatAvg,
            formatFamily: family,
            formatCount: sameFormat.length,
            rank: ranked.findIndex((m) => m.id === asset.id) + 1,
            of: ranked.length,
            score: asset.performanceScore,
            /** The same concept in other sizes, for comparison. */
            siblings: others.map((m) => ({ id: m.id, format: formatLabel(m.format), ctr: m.ctr })).sort((a, b) => b.ctr - a.ctr),
          },
  };
}

export type AssetDetail = NonNullable<Awaited<ReturnType<typeof loadAssetDetail>>>;
