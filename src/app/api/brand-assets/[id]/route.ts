import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { readUpload } from "@/lib/uploads";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", webp: "image/webp" };

/**
 * A brand file (logo, photo) stored with the uploads: Klingit staff, or a member of the brand's client. Seeded
 * brand files are stored under demo/<client>/<name>, the name being the file's path in the brand pack.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return new Response("Not found", { status: 404 });
  const asset = await prisma.brandAsset.findUnique({ where: { id }, include: { client: { select: { id: true, isDemo: true } } } });
  if (!asset) return new Response("Not found", { status: 404 });
  if (session.user.role !== "INTERNAL") {
    const member = await prisma.clientUser.findUnique({ where: { userId: session.user.id } });
    if (member?.clientId !== asset.clientId) return new Response("Not found", { status: 404 });
  }
  const data = asset.client.isDemo ? await readUpload(`demo/ouhers/${asset.name}`) : null;
  if (!data) return new Response("Not found", { status: 404 });
  const ext = asset.name.split(".").pop()?.toLowerCase() ?? "";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      ...(ext === "svg" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } : {}),
    },
  });
}
