import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assetFile, clientCanSeeProject } from "@/lib/asset-files";
import { readUpload, extensionFor } from "@/lib/uploads";
import { clientVisibleAsset } from "@/lib/qc/visibility";
import { createZip } from "@/lib/zip";

/**
 * Output library → "Download selected": one ZIP with the chosen outputs (?ids=a_<assetId>,s_<skillOutputId>).
 * Each one is checked: only the signed-in client's own sent work and their own skills' outputs.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENT") return new Response("Not found", { status: 404 });
  const member = await prisma.clientUser.findUnique({ where: { userId: session.user.id }, select: { clientId: true } });
  if (!member) return new Response("Not found", { status: 404 });
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 100);
  const files: { name: string; data: Uint8Array }[] = [];
  for (const key of ids) {
    const id = key.slice(2);
    if (key.startsWith("a_")) {
      const asset = await prisma.asset.findFirst({ where: { id, clientId: member.clientId, ...clientVisibleAsset } });
      if (!asset || !(await clientCanSeeProject(session.user.id, asset.projectId))) continue;
      if (asset.type === "COPY") {
        const copy = (asset.tags as { copy?: Record<string, string> } | null)?.copy ?? {};
        files.push({ name: `${asset.name}.txt`, data: new TextEncoder().encode(Object.entries(copy).map(([l, t]) => `${l.toUpperCase()}: ${t}`).join("\n")) });
        continue;
      }
      const f = await assetFile(asset);
      files.push({ name: f.filename, data: f.data });
    } else if (key.startsWith("s_")) {
      const o = await prisma.skillOutput.findFirst({ where: { id, clientId: member.clientId } });
      if (!o) continue;
      const file = o.storageKey ? await readUpload(o.storageKey) : null;
      if (file) files.push({ name: `${o.title.slice(0, 60)}.${extensionFor(o.mimeType)}`, data: new Uint8Array(file) });
      if (o.text) files.push({ name: `${o.title.slice(0, 60)}.txt`, data: new TextEncoder().encode(o.text) });
    }
  }
  if (files.length === 0) return new Response("Nothing to download", { status: 404 });
  // Unique names inside the archive.
  const seen = new Map<string, number>();
  const named = files.map((f) => {
    const base = f.name.replace(/[\\/:*?"<>|]+/g, "-");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...f, name: n === 1 ? base : base.replace(/(\.[^.]+)?$/, ` (${n})$1`) };
  });
  return new Response(new Uint8Array(createZip(named)), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="klingit-outputs-${new Date().toISOString().slice(0, 10)}.zip"`, "Cache-Control": "no-store" },
  });
}
