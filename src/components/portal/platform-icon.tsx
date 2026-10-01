import { FaLinkedin } from "react-icons/fa6";
import { SiInstagram, SiTiktok, SiMeta, SiGoogle } from "react-icons/si";
import { Globe, type LucideIcon } from "lucide-react";
import type { IconType } from "react-icons";

type PlatformMeta = { Icon: IconType | LucideIcon; color: string; bg: string };

const PLATFORM_META: Record<string, PlatformMeta> = {
  LinkedIn: { Icon: FaLinkedin, color: "#0A66C2", bg: "#0A66C21a" },
  Instagram: { Icon: SiInstagram, color: "#E1306C", bg: "#E1306C1a" },
  TikTok: { Icon: SiTiktok, color: "#000000", bg: "#00000014" },
  Meta: { Icon: SiMeta, color: "#0866FF", bg: "#0866FF1a" },
  Google: { Icon: SiGoogle, color: "#EA4335", bg: "#EA43351a" },
  Website: { Icon: Globe, color: "var(--muted-foreground)", bg: "var(--muted)" },
};

function metaFor(platform: string): PlatformMeta {
  return PLATFORM_META[platform] ?? { Icon: Globe, color: "var(--muted-foreground)", bg: "var(--muted)" };
}

/** Bare brand glyph, colored — for inline use next to a platform name. */
export function PlatformIcon({ platform, className = "size-4" }: { platform: string; className?: string }) {
  const { Icon, color } = metaFor(platform);
  return <Icon className={className} style={{ color }} />;
}

/** Icon in a soft brand-tinted circle — for section headers and cards where
 * the platform needs to be recognizable at a glance, not just labeled. */
export function PlatformBadge({ platform, className = "size-8" }: { platform: string; className?: string }) {
  const { Icon, color, bg } = metaFor(platform);
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${className}`} style={{ background: bg, color }}>
      <Icon className="size-1/2" />
    </span>
  );
}
