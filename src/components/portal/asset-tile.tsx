import { cn } from "@/lib/utils";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { performanceTierFor } from "@/lib/asset-performance";
import Link from "next/link";
import { assetTitle, formatLabel } from "@/lib/asset-display";
import { clientVisibleVersion } from "@/lib/qc/visibility";
import { VideoThumb } from "@/components/review/video-thumb";

const TIER_TONE: Record<string, PillTone> = { success: "success", info: "neutral", warning: "watch", danger: "danger", neutral: "neutral" };

/** Include this on an asset query to get what the tile needs for a video (its poster). */
export const assetTileInclude = { versions: { where: clientVisibleVersion, orderBy: { number: "desc" as const }, take: 1, select: { posterKey: true } } };

/** The tile's media from an asset row: an image file, or a video with its poster. */
export function tileMedia(a: { id: string; type: string; fileUrl: string | null; mimeType: string | null; storageKey: string | null; tags?: unknown; versions?: { posterKey: string | null }[] }) {
  const copy = (a.tags as { copy?: Record<string, string> } | null)?.copy;
  if (a.type === "COPY" && copy) return { copy: Object.entries(copy).map(([lang, text]) => ({ lang: lang.toUpperCase(), text })) };
  if (a.type === "VIDEO" && a.storageKey) return { video: { src: `/api/assets/${a.id}/download?inline=1`, poster: a.versions?.[0]?.posterKey ? `/api/assets/${a.id}/download?part=poster` : null } };
  return { fileUrl: a.mimeType?.startsWith("image/") || !a.storageKey ? a.fileUrl : null };
}

/** A delivered asset: its real name (assetTitle(), never "Static 1:1 / Static 1:1"), format and project, plus its measured CTR when there is one. */
export function AssetTile({
  name,
  format,
  color,
  ctr,
  campaign,
  fileUrl,
  video,
  copy,
  average,
  href,
}: {
  name: string;
  format: string;
  color: string;
  ctr: number | null;
  campaign?: string;
  fileUrl?: string | null;
  video?: { src: string; poster: string | null } | null;
  /** A copy line: its text per language. */
  copy?: { lang: string; text: string }[];
  /** The client's average CTR: the tier label is relative to it. */
  average?: number | null;
  /** Opens the asset's page (performance, how it was made). */
  href?: string;
}) {
  const tier = performanceTierFor(ctr, average);
  const Tag = href ? Link : "div";
  return (
    <Tag href={href!} className={cn("group flex min-w-0 flex-col gap-2", href && "text-brand-ink no-underline")}>
      <div className={cn("relative flex aspect-square flex-col justify-between overflow-hidden rounded-[12px] p-3", href && "transition-shadow group-hover:shadow-md")} style={fileUrl || video || copy ? undefined : { backgroundColor: `color-mix(in srgb, ${color} 18%, white)` }}>
        {video && <VideoThumb src={video.src} poster={video.poster} />}
        {copy && (
          <span className="absolute inset-0 flex flex-col justify-center gap-2 bg-white px-4 text-left">
            {copy.map((l) => (
              <span key={l.lang} className="line-clamp-2 text-[13px] leading-[1.4]">
                <span className="mr-1.5 font-brand-mono text-[11px] text-brand-ink-2">{l.lang}</span>
                {l.text}
              </span>
            ))}
          </span>
        )}
        {fileUrl && !video && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl} alt="" className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </>
        )}
        {ctr !== null && (
          <div className="relative flex items-start justify-between gap-2">
            <StatusPill tone={TIER_TONE[tier.tone]}>{tier.label}</StatusPill>
            <span className="rounded-full bg-white/85 px-2 py-0.5 text-[12px] tabular-nums text-brand-ink">{ctr}% CTR</span>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="m-0 truncate text-[15px]">{assetTitle(name, format)}</p>
        <p className="m-0 truncate text-[12px] text-brand-ink-2">{[formatLabel(format), campaign].filter(Boolean).join(" · ")}</p>
      </div>
    </Tag>
  );
}
