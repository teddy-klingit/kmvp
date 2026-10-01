import { FaSlack } from "react-icons/fa6";
import { Mail, Users2 } from "lucide-react";
import type { IconType } from "react-icons";
import type { LucideIcon } from "lucide-react";

const CHANNEL_META: Record<string, { Icon: IconType | LucideIcon; color: string; bg: string; label: string }> = {
  SLACK: { Icon: FaSlack, color: "#4A154B", bg: "#4A154B1a", label: "Slack" },
  TEAMS: { Icon: Users2, color: "#5059C9", bg: "#5059C91a", label: "Teams" },
  EMAIL: { Icon: Mail, color: "var(--muted-foreground)", bg: "var(--muted)", label: "Email" },
};

export function ChannelIcon({ type, className = "size-4" }: { type: string; className?: string }) {
  const meta = CHANNEL_META[type] ?? CHANNEL_META.EMAIL;
  const { Icon, color } = meta;
  return <Icon className={className} style={{ color }} />;
}

export function ChannelBadge({ type, className = "size-8" }: { type: string; className?: string }) {
  const meta = CHANNEL_META[type] ?? CHANNEL_META.EMAIL;
  const { Icon, color, bg } = meta;
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${className}`} style={{ background: bg, color }}>
      <Icon className="size-1/2" />
    </span>
  );
}

export function channelTypeLabel(type: string): string {
  return CHANNEL_META[type]?.label ?? type;
}
