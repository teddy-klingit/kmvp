import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiTile({
  icon: Icon,
  label,
  value,
  delta,
  sublabel,
  tone,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Positive/negative percent change shown as a colored pill, e.g. 4.2 or -1.1 */
  delta?: number | null;
  /** Small line under the number — e.g. a target, or what the delta is versus */
  sublabel?: string | null;
  /** Colors the big number against a target/benchmark — "good" (beating target, green) or
   * "bad" (missing it, red/amber). Omit for metrics with no clear target to judge against. */
  tone?: "good" | "bad" | "neutral" | null;
  className?: string;
}) {
  const hasDelta = delta !== undefined && delta !== null;
  const isUp = hasDelta && delta >= 0;

  return (
    <Card className={cn("flex flex-col gap-2 p-4", className)}>
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-md",
            tone === "good" ? "bg-success-soft text-success-foreground" : tone === "bad" ? "bg-danger-soft text-ink" : "bg-neutral-soft text-foreground"
          )}
        >
          <Icon className="size-3.5" />
        </span>
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        {tone === "good" && <CheckCircle2 className="size-4 shrink-0 text-success-foreground" />}
        {tone === "bad" && <AlertTriangle className="size-4 shrink-0 text-ink" />}
        <p className={cn("font-display text-2xl font-light tracking-tight", tone === "good" && "text-success-foreground", tone === "bad" && "text-ink")}>{value}</p>
        {hasDelta && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
              isUp ? "bg-success-soft text-success-foreground" : "bg-danger-soft text-danger-foreground"
            )}
          >
            {isUp ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {isUp ? "+" : ""}
            {delta}%
          </span>
        )}
      </div>
      {sublabel && <p className="text-[11px] text-muted-foreground">{sublabel}</p>}
    </Card>
  );
}
