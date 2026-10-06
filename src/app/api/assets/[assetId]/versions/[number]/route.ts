import { assetFile, attachment, findDownloadableVersion } from "@/lib/asset-files";

/** One version's file (the quality check's cells, "compare with v1"). A client gets 404 for a version not sent to them. */
export async function GET(req: Request, { params }: { params: Promise<{ assetId: string; number: string }> }) {
  const { assetId, number } = await params;
  const version = await findDownloadableVersion(assetId, Number(number));
  if (!version) return new Response("Not found", { status: 404 });
  const file = await assetFile({ ...version.asset, storageKey: version.storageKey, mimeType: version.mimeType });
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
