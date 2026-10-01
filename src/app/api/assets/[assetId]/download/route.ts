import { assetFile, attachment, findDownloadableAsset } from "@/lib/asset-files";

/** One asset's file. `?inline=1` serves it for previews instead of as a download. */
export async function GET(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await findDownloadableAsset(assetId);
  if (!asset) return new Response("Not found", { status: 404 });
  const file = await assetFile(asset);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": inline ? "inline" : attachment(file.filename),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
