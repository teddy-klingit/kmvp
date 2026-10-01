import { cn } from "@/lib/utils";

export type PillTone = "neutral" | "turn" | "success" | "changes" | "watch" | "danger" | "info";

const TONE: Record<PillTone, string> = {
  neutral: "bg-ds-subtle text-ds-text-body",
  turn: "bg-ds-turn-tint text-ds-turn-text",
  success: "bg-ds-success-tint text-ds-success-text",
  changes: "bg-ds-changes-tint text-ds-changes-text",
  watch: "bg-ds-watch-tint text-ds-watch-text",
  danger: "bg-ds-danger-tint text-ds-danger-text",
  info: "bg-ds-info-tint text-ds-info-text",
};

const DOT: Record<PillTone, string> = {
  neutral: "bg-ds-text-3",
  turn: "bg-ds-turn",
  success: "bg-ds-check",
  changes: "bg-ds-changes-text",
  watch: "bg-ds-watch-text",
  danger: "bg-ds-danger-text",
  info: "bg-ds-info-text",
};

/** The one pill style: radius 999, 12px/500. `dot` is the header variant ("Awaiting your approval"). */
export function StatusPill({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: PillTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-[12px] font-medium leading-[18px]",
        dot ? "px-2.5 py-[3px]" : "px-2 py-0.5",
        TONE[tone],
        className
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOT[tone])} />}
      {children}
    </span>
  );
}
