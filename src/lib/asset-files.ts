import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { readUpload, extensionFor } from "@/lib/uploads";
import { assetTitle, formatLabel } from "@/lib/asset-display";
import { isClientVisibleVersion } from "@/lib/qc/visibility";

const AVATAR_HEX: Record<string, string> = {
  "--avatar-1": "#e0447a",
  "--avatar-2": "#d9772a",
  "--avatar-3": "#2f5fe3",
  "--avatar-4": "#2f9e6b",
  "--avatar-5": "#8447c9",
  "--avatar-6": "#c9a227",
  "--avatar-7": "#2b9e9e",
  "--avatar-8": "#b5495b",
};

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "asset";
}

/**
 * Who may fetch an asset's file: Klingit staff, or a member of the asset's client once it was sent to them.
 * Returns the asset or null — callers answer 404 either way, so ids can't be probed.
 */
export async function findDownloadableAsset(assetId: string) {
  const session = await auth();
  if (!session?.user) return null;
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return null;
  if (session.user.role === "INTERNAL") return asset;
  // Nothing in Klingit's quality check reaches a client: an asset never sent is not there for them.
  if (asset.sentVersion === null) return null;
  return (await clientCanSeeProject(session.user.id, asset.projectId)) ? asset : null;
}

/** One version's file: any version for staff; for a client, only versions that were sent to them. */
export async function findDownloadableVersion(assetId: string, number: number) {
  const session = await auth();
  if (!session?.user || !Number.isInteger(number)) return null;
  const version = await prisma.assetVersion.findUnique({ where: { assetId_number: { assetId, number } }, include: { asset: true } });
  if (!version) return null;
  if (session.user.role === "INTERNAL") return version;
  if (!isClientVisibleVersion(version.state)) return null;
  return (await clientCanSeeProject(session.user.id, version.asset.projectId)) ? version : null;
}

/** A client user may see a project of their own company, unless it's confidential and not shared with them. */
export async function clientCanSeeProject(userId: string, projectId: string) {
  const member = await prisma.clientUser.findUnique({ where: { userId } });
  if (!member) return false;
  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: member.clientId, ...projectVisibilityWhere(member.id) } });
  return Boolean(project);
}

/** The uploaded file, or — for demo assets that never had one — a labelled SVG placeholder in the asset's colour. */
export async function assetFile(asset: { name: string; format: string; storageKey: string | null; mimeType: string | null; thumbnailColor: string }) {
  const title = assetTitle(asset.name, asset.format);
  if (asset.storageKey) {
    const data = await readUpload(asset.storageKey);
    if (data) return { data: new Uint8Array(data), mimeType: asset.mimeType ?? "application/octet-stream", filename: `${slug(title)}.${extensionFor(asset.mimeType)}` };
  }
  const varName = asset.thumbnailColor.match(/--avatar-\d/)?.[0];
  const color = (varName && AVATAR_HEX[varName]) || (asset.thumbnailColor.startsWith("#") ? asset.thumbnailColor : "#6b7280");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="${color}" fill-opacity="0.18"/><rect x="0.5" y="0.5" width="1199" height="899" fill="none" stroke="${color}"/><text x="600" y="430" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="56" font-weight="600" fill="#15171a">${esc(title)}</text><text x="600" y="500" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="32" fill="#5b616b">${esc(formatLabel(asset.format))} · demo placeholder</text></svg>`;
  return { data: new TextEncoder().encode(svg), mimeType: "image/svg+xml", filename: `${slug(title)}.svg` };
}

/**
 * The file as a response. Honours a Range header (206), which a <video> needs to seek and to start playing before
 * the whole file is in.
 */
export function fileResponse(req: Request, file: { data: Uint8Array; mimeType: string; filename: string }, inline: boolean) {
  const headers: Record<string, string> = {
    "Content-Type": file.mimeType,
    "Content-Disposition": inline ? "inline" : attachment(file.filename),
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  const size = file.data.byteLength;
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    return new Response(Buffer.from(file.data.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(Buffer.from(file.data), { headers: { ...headers, "Content-Length": String(size) } });
}

export type VideoPart = "poster" | "strip";
export const videoPart = (v: string | null): VideoPart | null => (v === "poster" || v === "strip" ? v : null);

/** A video version's poster frame or thumbnail strip (JPEG), or null when it has none. */
export async function videoPartFile(version: { posterKey: string | null; thumbStripKey: string | null }, part: VideoPart) {
  const key = part === "poster" ? version.posterKey : version.thumbStripKey;
  const data = key ? await readUpload(key) : null;
  return data ? { data: new Uint8Array(data), mimeType: key!.endsWith(".png") ? "image/png" : "image/jpeg", filename: `${part}.jpg` } : null;
}

export function attachment(filename: string) {
  return `attachment; filename="${filename.replace(/"/g, "")}"`;
}
