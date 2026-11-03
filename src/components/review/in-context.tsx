import { Bookmark, ChevronRight, Heart, MessageCircle, MoreHorizontal, Send } from "lucide-react";
import { safeZoneFor, type SafeZone } from "@/lib/safe-zones";
import { cn } from "@/lib/utils";

/** The dead areas shaded on top of an ad: what the platform's UI covers, so it's clear what would be hidden. */
export function SafeZoneOverlay({ zone }: { zone: SafeZone }) {
  const band = "absolute inset-x-0 flex justify-center bg-[repeating-linear-gradient(135deg,rgba(220,38,38,0.28)_0_6px,rgba(220,38,38,0.12)_6px_12px)] text-[10px] font-semibold uppercase tracking-[0.06em] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]";
  return (
    <span aria-label={`Safe zone: ${zone.label}`} className="pointer-events-none absolute inset-0 z-10">
      <span className={`${band} items-end pb-1`} style={{ top: 0, height: `${zone.top * 100}%` }}>
        UI covers this
      </span>
      <span className={`${band} items-start pt-1`} style={{ bottom: 0, height: `${zone.bottom * 100}%` }}>
        UI covers this
      </span>
      {zone.side > 0 && (
        <>
          <span className="absolute left-0 bg-[rgba(220,38,38,0.18)]" style={{ top: `${zone.top * 100}%`, bottom: `${zone.bottom * 100}%`, width: `${zone.side * 100}%` }} />
          <span className="absolute right-0 bg-[rgba(220,38,38,0.18)]" style={{ top: `${zone.top * 100}%`, bottom: `${zone.bottom * 100}%`, width: `${zone.side * 100}%` }} />
        </>
      )}
    </span>
  );
}

/**
 * An ad in its placement, with the platform UI on top: a story frame for 9:16, a feed post for 4:5 and 1:1, a link
 * post for 1.91:1. `safeZones` shades the dead areas (Stories and Reels). Used by project review and skill runs.
 */
export function InContext({ src, alt, ratio, brand, domain, caption, safeZones = false, width, format }: { src: string | null; alt: string; ratio: number; brand: string; domain?: string; caption: string; safeZones?: boolean; width?: number; format?: string | null }) {
  const handle = brand.toLowerCase().replace(/\s+/g, "");
  const img = src ? (
    // eslint-disable-next-line @next/next/no-img-element -- an access-checked file or a generated image
    <img src={src} alt={alt} className="size-full object-cover" />
  ) : null;
  const avatar = <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-peach-pale text-[11px] font-semibold text-brand-ink">{brand.charAt(0)}</span>;
  const zone = safeZones ? safeZoneFor(format ?? ratio) : null;
  if (ratio < 0.7) {
    const w = width ?? 236;
    return (
      <span className="relative block overflow-hidden rounded-[28px] border-[6px] border-brand-ink bg-black shadow-lg" style={{ width: w, height: Math.round((w * 420) / 236) }}>
        <span className="absolute inset-0">{img}</span>
        {zone && <SafeZoneOverlay zone={zone} />}
        <span className="absolute inset-x-2 top-2 z-20 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("h-0.5 flex-1 rounded-full", i === 0 ? "bg-white" : "bg-white/40")} />
          ))}
        </span>
        <span className="absolute left-3 top-5 z-20 flex items-center gap-2 text-[12px] font-semibold text-white drop-shadow">
          {avatar}
          {handle} <span className="font-normal opacity-80">Sponsored</span>
        </span>
        <span className="absolute inset-x-3 bottom-12 z-20 flex items-center justify-center rounded-full bg-white/90 py-1.5 text-[12px] font-semibold text-brand-ink">Shop now ›</span>
        <span className="absolute inset-x-3 bottom-3 z-20 flex h-7 items-center rounded-full border border-white/60 px-3 text-[11px] text-white/80">Send message</span>
      </span>
    );
  }
  if (ratio > 1.5) {
    return (
      <span className="block overflow-hidden rounded-[12px] border border-brand-line bg-white shadow-sm" style={{ width: width ?? 340 }}>
        <span className="flex items-center gap-2 px-3 py-2 text-[12px]">
          {avatar}
          <span className="flex flex-col">
            <span className="font-semibold">{brand}</span>
            <span className="text-brand-mute">Sponsored</span>
          </span>
        </span>
        <span className="block aspect-[1.91/1]">{img}</span>
        <span className="flex items-center gap-2 bg-[#F4F4F2] px-3 py-2">
          <span className="flex min-w-0 flex-1 flex-col">
            {domain && <span className="text-[11px] uppercase text-brand-mute">{domain}</span>}
            <span className="truncate text-[13px] font-semibold">{caption}</span>
          </span>
          <span className="rounded-[6px] bg-brand-chip px-3 py-1.5 text-[12px] font-semibold">Shop now</span>
        </span>
      </span>
    );
  }
  return (
    <span className="block overflow-hidden rounded-[12px] border border-brand-line bg-white shadow-sm" style={{ width: width ?? 270 }}>
      <span className="flex items-center gap-2 px-3 py-2 text-[12px]">
        {avatar}
        <span className="flex flex-1 flex-col">
          <span className="font-semibold">{handle}</span>
          <span className="text-brand-mute">Sponsored</span>
        </span>
        <MoreHorizontal className="size-4" />
      </span>
      <span className="block" style={{ aspectRatio: String(ratio) }}>
        {img}
      </span>
      <span className="flex items-center justify-between bg-brand-chip px-3 py-2 text-[12px] font-semibold">
        Shop now <ChevronRight className="size-4" />
      </span>
      <span className="flex items-center gap-3 px-3 py-2">
        <Heart className="size-4" /> <MessageCircle className="size-4" /> <Send className="size-4" />
        <span className="flex-1" />
        <Bookmark className="size-4" />
      </span>
      <span className="block px-3 pb-3 text-[12px]">
        <span className="font-semibold">{handle}</span> {caption}
      </span>
    </span>
  );
}
