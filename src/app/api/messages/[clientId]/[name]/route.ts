import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/uploads";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

/** A file sent in the PM message panel (Phase U): that client's people and Klingit staff only. */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string; name: string }> }) {
  const { clientId, name } = await params;
  const session = await auth();
  if (!session?.user) return new Response("Not found", { status: 404 });
  if (session.user.role !== "INTERNAL" && !(await prisma.clientUser.findFirst({ where: { userId: session.user.id, clientId }, select: { id: true } }))) return new Response("Not found", { status: 404 });
  const file = decodeURIComponent(name);
  if (file.includes("/") || file.includes("..")) return new Response("Not found", { status: 404 });
  const data = await readUpload(`messages-${clientId}/${file}`);
  if (!data) return new Response("Not found", { status: 404 });
  const type = TYPES[file.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Content-Disposition": `inline; filename="${file.replace(/"/g, "")}"`, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
