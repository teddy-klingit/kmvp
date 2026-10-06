import { assetFile, fileResponse, findDownloadableVersion, videoPart, videoPartFile } from "@/lib/asset-files";

/**
 * One version's file (the quality check's cells, "compare with v1"); `?part=poster|strip` for a video's poster or
 * thumbnail strip. A client gets 404 for a version not sent to them.
 */
export async function GET(req: Request, { params }: { params: Promise<{ assetId: string; number: string }> }) {
  const { assetId, number } = await params;
  const version = await findDownloadableVersion(assetId, Number(number));
  if (!version) return new Response("Not found", { status: 404 });
  const query = new URL(req.url).searchParams;
  const part = videoPart(query.get("part"));
  if (part) {
    const file = await videoPartFile(version, part);
    return file ? fileResponse(req, file, true) : new Response("Not found", { status: 404 });
  }
  return fileResponse(req, await assetFile({ ...version.asset, storageKey: version.storageKey, mimeType: version.mimeType }), query.get("inline") === "1");
}
