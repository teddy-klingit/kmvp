import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

/** Railway mounts the persistent volume at /data; locally files go in a git-ignored ./uploads. */
export const UPLOADS_DIR = path.resolve(
  process.env.UPLOADS_DIR ?? (existsSync("/data") ? "/data/uploads" : path.join(process.cwd(), "uploads"))
);

const MB = 1024 * 1024;
/** Approved limits: 25 MB for images and PDF, 250 MB for video. */
export const UPLOAD_LIMITS = { image: 25 * MB, pdf: 25 * MB, video: 250 * MB } as const;

export type UploadKind = keyof typeof UPLOAD_LIMITS;

export function uploadKind(mimeType: string): UploadKind | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

/** Returns an error message for a file we won't accept, or null. */
export function rejectUpload(file: { type: string; size: number }): string | null {
  const kind = uploadKind(file.type);
  if (!kind) return "Only images, PDFs and videos can be uploaded.";
  if (file.size > UPLOAD_LIMITS[kind]) return `${kind === "video" ? "Videos" : kind === "pdf" ? "PDFs" : "Images"} can be up to ${UPLOAD_LIMITS[kind] / MB} MB.`;
  if (file.size === 0) return "That file is empty.";
  return null;
}

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";
}

function resolveKey(storageKey: string) {
  const full = path.resolve(UPLOADS_DIR, storageKey);
  if (!full.startsWith(UPLOADS_DIR + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function saveUpload(projectId: string, file: File) {
  const storageKey = `${projectId}/${randomBytes(6).toString("hex")}-${safeName(file.name)}`;
  const full = resolveKey(storageKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()));
  return { storageKey, mimeType: file.type, sizeBytes: file.size };
}

export async function readUpload(storageKey: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveKey(storageKey));
  } catch {
    return null;
  }
}

export function extensionFor(mimeType: string | null | undefined) {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };
  return (mimeType && map[mimeType]) || "bin";
}
