import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Status pill used across both apps (e.g. "In production", "On track",
 * "Approved", "Flagged"). `tone` maps to the semantic status colors;
 * pick it by meaning, not by hardcoding a color at the call site. Text
 * inside a pill is always ink — the tone lives entirely in the fill.
 */
const badgeVariants = cva(
  "inline-flex h-[20px] items-center justify-center gap-1 rounded-full px-2.5 text-[10px] font-medium text-ink",
  {
    variants: {
      tone: {
        neutral: "bg-neutral-soft",
        info: "bg-info-soft",
        success: "bg-success-soft",
        warning: "bg-warning-soft",
        danger: "bg-danger-soft",
        accent: "bg-accent-soft",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}

/** Common pipeline/status labels mapped to a sensible tone by default. */
export const STATUS_TONE: Record<string, BadgeProps["tone"]> = {
  Draft: "neutral",
  Paused: "warning",
  Briefing: "neutral",
  "In production": "warning",
  "Awaiting review": "info",
  "On track": "success",
  "At risk": "warning",
  Approved: "success",
  "Changes asked": "danger",
  Flagged: "danger",
  Live: "success",
  Idle: "neutral",
  Completed: "success",
  Upcoming: "neutral",
  "Active now": "info",
  Archived: "neutral",
};

function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} className={className}>
      {status}
    </Badge>
  );
}

export { Badge, badgeVariants, StatusBadge };
