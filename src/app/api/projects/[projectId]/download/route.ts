import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { assetFile, attachment, clientCanSeeProject } from "@/lib/asset-files";
import { createZip } from "@/lib/zip";
import { clientVisibleAsset } from "@/lib/qc/visibility";

/** "Download all (.zip)": every approved or delivered asset in the project. */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) return new Response("Not found", { status: 404 });
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return new Response("Not found", { status: 404 });
  if (session.user.role !== "INTERNAL" && !(await clientCanSeeProject(session.user.id, projectId))) {
    return new Response("Not found", { status: 404 });
  }

  const assets = await prisma.asset.findMany({
    where: { projectId, status: { in: ["APPROVED", "DELIVERED"] }, ...clientVisibleAsset },
    orderBy: { createdAt: "asc" },
  });
  const used = new Set<string>();
  const entries = [];
  for (const a of assets) {
    const file = await assetFile(a);
    let name = file.filename;
    for (let i = 2; used.has(name); i++) name = file.filename.replace(/(\.\w+)$/, `-${i}$1`);
    used.add(name);
    entries.push({ name, data: file.data });
  }
  const zip = createZip(entries);
  const base = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "delivery";
  return new Response(Buffer.from(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": attachment(`${base}.zip`), "Cache-Control": "private, no-store" },
  });
}
