import { prisma } from "@/lib/prisma";
import { assetFile, fileResponse, findDownloadableAsset, videoPart, videoPartFile } from "@/lib/asset-files";

/**
 * One asset's file. `?inline=1` serves it for previews instead of as a download; `?part=poster|strip` serves a
 * video's poster frame or thumbnail strip (of the version the client was sent, or the newest one for staff).
 */
export async function GET(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await findDownloadableAsset(assetId);
  if (!asset) return new Response("Not found", { status: 404 });
  const query = new URL(req.url).searchParams;
  const part = videoPart(query.get("part"));
  if (part) {
    const version = await prisma.assetVersion.findUnique({ where: { assetId_number: { assetId, number: asset.sentVersion ?? asset.version } } });
    const file = version ? await videoPartFile(version, part) : null;
    return file ? fileResponse(req, file, true) : new Response("Not found", { status: 404 });
  }
  return fileResponse(req, await assetFile(asset), query.get("inline") === "1");
}
