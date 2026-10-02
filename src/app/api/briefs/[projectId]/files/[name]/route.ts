import { auth } from "@/lib/auth";
import { clientCanSeeProject } from "@/lib/asset-files";
import { readUpload } from "@/lib/uploads";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

/** A reference file attached in the Brief studio: the project's client (who can see it) and Klingit staff only. */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string; name: string }> }) {
  const { projectId, name } = await params;
  const session = await auth();
  if (!session?.user) return new Response("Not found", { status: 404 });
  if (session.user.role !== "INTERNAL" && !(await clientCanSeeProject(session.user.id, projectId))) return new Response("Not found", { status: 404 });
  const file = decodeURIComponent(name);
  if (file.includes("/") || file.includes("..")) return new Response("Not found", { status: 404 });
  const data = await readUpload(`${projectId}/${file}`);
  if (!data) return new Response("Not found", { status: 404 });
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[ext] ?? "application/octet-stream";
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": type, "Content-Disposition": `inline; filename="${file.replace(/"/g, "")}"`, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
