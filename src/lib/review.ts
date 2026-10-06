import { prisma } from "@/lib/prisma";
import { assetTitle } from "@/lib/asset-display";
import { jsonArray } from "@/lib/utils";
import { clientVisibleAsset, clientVisibleVersion } from "@/lib/qc/visibility";
import { expectedShape } from "@/lib/qc/specs";
import { clientCheckSummary } from "@/lib/qc/quality-check";
export { textDiff } from "@/lib/review-text";

/**
 * One review for every format (ReviewAdSet, ReviewSlides, ReviewVideo, ReviewCopy): what the client was sent on a
 * project, split by format, with the comment threads, the "what changed" notes and the quality-check summary.
 * Only versions sent to the client are read (src/lib/qc/visibility.ts).
 */

export type ReviewKind = "adset" | "slides" | "video" | "copy";
export const KIND_LABEL: Record<ReviewKind, string> = { adset: "Ad set", slides: "Slides", video: "Video", copy: "Copy" };

export type CopyLine = { lang: string; label: string; text: string; limit: number | null; voice: { ok: boolean; note: string } | null };
export type CopySuggestion = { id: string; lang: string; label: string; text: string; by: string; note: string | null };

export type ReviewItem = {
  id: string;
  kind: ReviewKind;
  name: string;
  concept: string;
  format: string;
  /** "9:16", "1.91:1", … (ad set columns). */
  size: string;
  ratio: number;
  /** Slide / frame number when the format names one. */
  order: number | null;
  status: string;
  fileUrl: string | null;
  isVideo: boolean;
  /** A real uploaded file (demo assets without one are drawn as a labelled placeholder). */
  hasFile: boolean;
  version: number;
  changed: boolean;
  durationSeconds: number | null;
  copy: { element: string; locked: boolean; lines: CopyLine[]; suggestions: CopySuggestion[] } | null;
};

export type ThreadMessage = { id: string; author: string; org: string; fromClient: boolean; at: string; body: string };
export type Thread = {
  id: string;
  assetId: string | null;
  label: string;
  number: number | null;
  pin: { x: number; y: number; w: number | null; h: number | null } | null;
  timestamp: number | null;
  resolved: boolean;
  messages: ThreadMessage[];
};

const LANG: Record<string, string> = { sv: "Swedish", no: "Norwegian", da: "Danish", en: "English", fi: "Finnish" };
const LIMITS: [RegExp, number][] = [
  [/headline/i, 40],
  [/primary/i, 125],
  [/call to action|cta/i, 20],
  [/description/i, 30],
];

export function kindOf(a: { type: string; format: string }): ReviewKind {
  if (a.type === "COPY") return "copy";
  if (a.type === "VIDEO") return "video";
  if (/slide|frame|deck|carousel/i.test(a.format)) return "slides";
  return "adset";
}

/** Words the brand avoids, from Brand OS don'ts written as `Avoid "word"`. */
export function avoidedWords(donts: unknown) {
  return jsonArray<string>(donts).flatMap((d) => [...d.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase()));
}

/** On voice when none of the avoided words is used; nothing to say when the Brand OS lists none. */
export function voiceCheck(text: string, avoid: string[]): { ok: boolean; note: string } | null {
  if (avoid.length === 0) return null;
  const hit = avoid.find((w) => text.toLowerCase().includes(w.replace(/\s*\(.*\)$/, "")));
  return hit ? { ok: false, note: `Uses "${hit}"` } : { ok: true, note: "On voice" };
}

type StoredSuggestion = { id: string; lang: string; text: string; by: string; note?: string | null };
export type CopyTags = { copy?: Record<string, string>; status?: string; suggestions?: StoredSuggestion[]; suggestion?: { by: string; lang: string; from: string; to: string } | null };

/** A copy asset's suggestions, including the one-line form older data used ({ from, to }). */
export function copySuggestions(tags: CopyTags): StoredSuggestion[] {
  const list = [...(tags.suggestions ?? [])];
  const legacy = tags.suggestion;
  if (legacy && tags.copy?.[legacy.lang] !== undefined && !list.some((s) => s.id === "legacy")) {
    list.push({ id: "legacy", lang: legacy.lang, text: tags.copy[legacy.lang].replace(legacy.from, legacy.to), by: legacy.by, note: null });
  }
  return list;
}

export async function loadReview(projectId: string, clientId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, clientId }, include: { client: { include: { brandOS: true } }, brief: { select: { sections: true } } } });
  if (!project) return null;
  const [assets, comments, checks, events] = await Promise.all([
    prisma.asset.findMany({
      where: { projectId, ...clientVisibleAsset },
      orderBy: { createdAt: "asc" },
      include: { versions: { where: clientVisibleVersion, orderBy: { number: "desc" }, take: 1, select: { width: true, height: true } } },
    }),
    prisma.comment.findMany({
      where: { projectId, archivedAt: null, kind: "MESSAGE", OR: [{ assetId: { not: null } }, { contextKind: "set" }] },
      include: { author: true, clientAuthor: { include: { user: true } }, asset: { select: { name: true, format: true } } },
      orderBy: { createdAt: "asc" },
    }),
    clientCheckSummary(projectId),
    prisma.comment.findMany({ where: { projectId, kind: "SYSTEM", body: { startsWith: "Version " } }, orderBy: { createdAt: "desc" }, take: 1 }),
  ]);
  const avoid = avoidedWords(project.client.brandOS?.donts);

  const items: ReviewItem[] = assets.map((a) => {
    const kind = kindOf(a);
    const shape = expectedShape(a.format);
    const v = a.versions[0];
    const tags = (a.tags ?? {}) as CopyTags;
    const element = assetTitle(a.name, a.format);
    const limit = LIMITS.find(([re]) => re.test(element))?.[1] ?? null;
    const locked = tags.status === "locked" || /legal/i.test(element);
    return {
      id: a.id,
      kind,
      name: assetTitle(a.name, a.format),
      concept: assetTitle(a.name, a.format).replace(/,? (slide|frame) \d+$/i, ""),
      format: a.format,
      size: shape?.label ?? a.format,
      ratio: v?.width && v?.height ? v.width / v.height : (shape?.ratio ?? 1),
      order: Number(a.format.match(/(?:slide|frame) (\d+)/i)?.[1] ?? a.name.match(/(?:slide|frame) (\d+)/i)?.[1] ?? NaN) || null,
      status: a.status,
      fileUrl: a.storageKey || a.type !== "COPY" ? `/api/assets/${a.id}/download?inline=1` : null,
      isVideo: a.type === "VIDEO",
      hasFile: Boolean(a.storageKey),
      version: a.sentVersion ?? a.version,
      changed: (a.sentVersion ?? 1) > 1,
      durationSeconds: a.durationSeconds,
      copy:
        kind === "copy"
          ? {
              element,
              locked,
              lines: Object.entries(tags.copy ?? {}).map(([lang, text]) => ({ lang, label: LANG[lang] ?? lang.toUpperCase(), text, limit: locked ? null : limit, voice: locked ? null : voiceCheck(text, avoid) })),
              suggestions: copySuggestions(tags).map((s) => ({ id: s.id, lang: s.lang, label: LANG[s.lang] ?? s.lang, text: s.text, by: s.by, note: s.note ?? null })),
            }
          : null,
    };
  });

  // Threads: a comment on an asset (or on the whole set) starts one; replies point at it (contextKind "reply").
  const roots = comments.filter((c) => c.contextKind !== "reply");
  let pinNo = 0;
  const threads: Thread[] = roots.map((c) => {
    const pinned = c.xPercent != null && c.yPercent != null;
    const msg = (m: (typeof comments)[number]): ThreadMessage => ({
      id: m.id,
      author: m.clientAuthor?.user.name ?? m.author?.name ?? "Klingit",
      org: m.authorClientUserId ? project.client.name : "Klingit",
      fromClient: Boolean(m.authorClientUserId),
      at: m.createdAt.toISOString(),
      body: m.body,
    });
    const replies = comments.filter((r) => r.contextKind === "reply" && r.contextRef === c.id);
    const item = c.asset ? items.find((i) => i.id === c.assetId) : null;
    return {
      id: c.id,
      assetId: c.assetId,
      label: c.contextKind === "set" || !c.asset ? "Whole set" : item ? `${item.concept} · ${item.size}` : assetTitle(c.asset.name, c.asset.format),
      number: pinned || c.timestampSeconds != null ? ++pinNo : null,
      pin: pinned ? { x: c.xPercent!, y: c.yPercent!, w: c.widthPercent, h: c.heightPercent } : null,
      timestamp: c.timestampSeconds,
      resolved: c.resolved,
      messages: [msg(c), ...replies.map(msg)],
    };
  });

  const kinds = (["adset", "slides", "video", "copy"] as ReviewKind[]).map((k) => ({ kind: k, count: items.filter((i) => i.kind === k).length, open: items.filter((i) => i.kind === k && i.status === "IN_REVIEW").length })).filter((k) => k.count > 0);
  const markets = jsonArray<{ key: string; items?: string[] }>(project.brief?.sections).find((s) => s.key === "markets")?.items ?? [];
  // "Version 2 sent · a · b": the change notes of the latest version.
  const changes = events[0]?.body.split(" · ").slice(1).filter((x) => !/quality checked/i.test(x)) ?? [];
  return { project: { id: project.id, name: project.name, status: project.status }, canReview: project.status === "AWAITING_REVIEW", items, threads, kinds, markets, checks, changes };
}

export type ReviewData = NonNullable<Awaited<ReturnType<typeof loadReview>>>;
