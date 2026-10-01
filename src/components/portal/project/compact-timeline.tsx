import { Check } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { TimelineStep } from "@/lib/project-state";

/** Header-sized stage strip from getProjectState().timeline — dates where known, current stage highlighted. */
export function CompactTimeline({ timeline }: { timeline: TimelineStep[] }) {
  return (
    <ol className="flex min-w-max items-start">
      {timeline.map((step, i) => (
        <li key={step.stage} className="flex items-start" {...(step.status === "current" ? { "data-current": "" } : {})}>
          <div className="flex w-[92px] flex-col items-center gap-1 text-center">
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded-full border",
                step.status === "done" && "border-ink/15 bg-success text-ink",
                step.status === "current" && "border-2 border-ink bg-paper",
                step.status === "upcoming" && "border-border bg-paper"
              )}
            >
              {step.status === "done" && <Check className="size-2.5" />}
              {step.status === "current" && <span className="size-1.5 rounded-full bg-ink" />}
            </span>
            <span
              className={cn(
                "text-[11px] leading-tight",
                step.status === "current" ? "font-semibold text-ink" : step.status === "done" ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            {step.date && (
              <span className="text-[10px] leading-tight text-muted-foreground">
                {step.status === "done" ? "" : step.status === "current" ? "Due " : "Est. "}
                {formatDate(step.date)}
              </span>
            )}
          </div>
          {i < timeline.length - 1 && (
            <span className={cn("mt-2 h-px w-4 shrink-0", step.status === "done" ? "bg-success" : "bg-border")} />
          )}
        </li>
      ))}
    </ol>
  );
}
