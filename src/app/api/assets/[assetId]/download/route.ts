import { prisma } from "@/lib/prisma";
import { assetResponseFile, fileResponse, findDownloadableAsset, videoPart, videoPartFile } from "@/lib/asset-files";
import { readUpload } from "@/lib/uploads";

/**
 * One asset's file. `?inline=1` serves it for previews instead of as a download; `?part=poster|strip` serves a
 * video's poster frame or thumbnail strip (of the version the client was sent, or the newest one for staff);
 * `?part=preview` the preview image of work a browser can't show (a deck's first slide). A real download (not
 * inline, not a preview) counts toward "Downloaded N×" in the Output library.
 */
export async function GET(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await findDownloadableAsset(assetId);
  if (!asset) return new Response("Not found", { status: 404 });
  const query = new URL(req.url).searchParams;
  if (query.get("part") === "preview") {
    const data = asset.previewKey ? await readUpload(asset.previewKey) : null;
    return data ? fileResponse(req, { data: new Uint8Array(data), mimeType: asset.previewKey!.endsWith(".png") ? "image/png" : "image/jpeg", filename: "preview.jpg" }, true) : new Response("Not found", { status: 404 });
  }
  const part = videoPart(query.get("part"));
  if (part) {
    const version = await prisma.assetVersion.findUnique({ where: { assetId_number: { assetId, number: asset.sentVersion ?? asset.version } } });
    const file = version ? await videoPartFile(version, part) : null;
    return file ? fileResponse(req, file, true) : new Response("Not found", { status: 404 });
  }
  const inline = query.get("inline") === "1";
  if (!inline && !req.headers.get("range")) await prisma.asset.update({ where: { id: assetId }, data: { downloadCount: { increment: 1 } } });
  return fileResponse(req, await assetResponseFile(asset), inline);
}
