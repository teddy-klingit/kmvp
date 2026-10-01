import { siDropbox, siFigma, siGoogledrive, siNotion } from "simple-icons";
import { Globe } from "lucide-react";
import { appMeta } from "@/lib/brand-sources";
import { cn } from "@/lib/utils";

const ICONS = { siGoogledrive, siFigma, siNotion, siDropbox };

/**
 * An app's official icon from simple-icons, in its brand colour. Apps simple-icons doesn't carry
 * (SharePoint/OneDrive, Canva, Frame.io, Slack: removed at the brands' request) get a lettered tile
 * in their brand colour instead of a hand-drawn logo.
 */
export function AppIcon({ app, size = 20, tile = false, className }: { app: string; size?: number; tile?: boolean; className?: string }) {
  const meta = appMeta(app);
  const icon = meta.icon ? ICONS[meta.icon] : null;
  if (meta.key === "web") {
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center", tile && "rounded-[10px] bg-ds-subtle", className)} style={tile ? { width: size * 2, height: size * 2 } : undefined}>
        <Globe style={{ width: size, height: size }} className="text-ds-text-2" strokeWidth={1.75} aria-hidden />
      </span>
    );
  }
  if (!icon) {
    return (
      <span
        aria-hidden
        className={cn("inline-flex shrink-0 items-center justify-center rounded-[6px] font-semibold text-white", className)}
        style={{ width: tile ? size * 2 : size, height: tile ? size * 2 : size, backgroundColor: meta.color, fontSize: Math.max(8, (tile ? size * 2 : size) * (meta.monogram.length > 2 ? 0.28 : 0.42)) }}
      >
        {meta.monogram}
      </span>
    );
  }
  const svg = (
    <svg role="img" aria-label={meta.name} viewBox="0 0 24 24" width={size} height={size} fill={`#${icon.hex}`} className={tile ? undefined : className}>
      <path d={icon.path} />
    </svg>
  );
  return tile ? (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-[10px] bg-ds-subtle-2 ring-1 ring-ds-divider", className)} style={{ width: size * 2, height: size * 2 }}>
      {svg}
    </span>
  ) : (
    svg
  );
}
