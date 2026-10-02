import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimelineMilestone = { key: string; label: string; status: "done" | "current" | "upcoming"; caption?: string };

/**
 * One continuous track. Done = filled dark circle with a check; upcoming = grey ring. Current = an orange
 * ring with a halo and an orange "Now · …" caption when it's the client's turn (orange always means "your
 * action"), an ink ring when Klingit is on it.
 * `client` = 5 milestones (24px dots); `internal` = the PM's 8 stages (20px).
 */
export function ProjectTimeline({
  steps,
  variant = "client",
  label = "Project timeline",
  yourTurn = true,
}: {
  steps: TimelineMilestone[];
  variant?: "client" | "internal";
  label?: string;
  /** Whether the current step waits on the viewer (orange) or on Klingit (ink). */
  yourTurn?: boolean;
}) {
  const dot = variant === "client" ? "size-6" : "size-5";
  return (
    <div className={yourTurn ? "[--tl:var(--ds-turn)] [--tl-halo:var(--ds-turn-tint)] [--tl-text:var(--ds-turn-text)]" : "[--tl:var(--brand-ink)] [--tl-halo:var(--brand-line)] [--tl-text:var(--brand-ink)]"}>
      <VerticalTimeline steps={steps} label={label} dot={dot} />
      <div className="hidden overflow-x-auto sm:block">
        <ol
          aria-label={label}
          className={cn("m-0 grid list-none p-0", variant === "client" ? "min-w-[560px]" : "min-w-[720px]")}
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        >
          {steps.map((s, i) => {
            const last = i === steps.length - 1;
            return (
              <li key={s.key} className="flex flex-col gap-2.5" {...(s.status === "current" ? { "aria-current": "step" as const } : {})}>
                <div className="flex items-center">
                  <Dot status={s.status} dot={dot} />
                  {!last && <span className={cn("mx-2 h-0.5 flex-1", s.status === "done" ? "bg-ds-text" : "bg-ds-border")} />}
                </div>
                <div className={cn("flex min-w-0 flex-col gap-0.5", !last && "pr-3")}>
                  <span
                    className={cn(
                      "whitespace-nowrap text-[13px]",
                      s.status === "current" ? "font-semibold text-ds-text" : s.status === "done" ? "font-medium text-ds-text" : "font-medium text-ds-text-2"
                    )}
                  >
                    {s.label}
                  </span>
                  {s.caption && (
                    <span
                      title={s.caption}
                      className={cn(
                        "truncate whitespace-nowrap text-[12px] tabular-nums",
                        s.status === "current" ? "font-medium text-[var(--tl-text)]" : s.status === "done" ? "text-ds-text-2" : "text-ds-text-3"
                      )}
                    >
                      {s.caption}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function Dot({ status, dot }: { status: TimelineMilestone["status"]; dot: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        dot,
        status === "done" && "bg-ds-text",
        status === "current" && "border-2 border-[var(--tl)] bg-white shadow-[0_0_0_4px_var(--tl-halo)]",
        status === "upcoming" && "border-2 border-ds-control-border bg-white"
      )}
    >
      {status === "done" && <Check className="size-3.5 text-white" strokeWidth={2.5} />}
      {status === "current" && <span className="size-2 rounded-full bg-[var(--tl)]" />}
    </span>
  );
}

/** Phones: the same track, top to bottom, so no step scrolls out of view. */
function VerticalTimeline({ steps, label, dot }: { steps: TimelineMilestone[]; label: string; dot: string }) {
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-col p-0 sm:hidden">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.key} className="flex gap-3" {...(s.status === "current" ? { "aria-current": "step" as const } : {})}>
            <div className="flex flex-col items-center">
              <Dot status={s.status} dot={dot} />
              {!last && <span className={cn("my-1 w-0.5 flex-1", s.status === "done" ? "bg-ds-text" : "bg-ds-border")} />}
            </div>
            <div className={cn("flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 pt-0.5", !last && "pb-4")}>
              <span className={cn("text-[14px]", s.status === "current" ? "font-semibold text-ds-text" : s.status === "done" ? "font-medium text-ds-text" : "font-medium text-ds-text-2")}>
                {s.label}
              </span>
              {s.caption && (
                <span
                  className={cn(
                    "text-[12px] tabular-nums",
                    s.status === "current" ? "font-medium text-[var(--tl-text)]" : s.status === "done" ? "text-ds-text-2" : "text-ds-text-3"
                  )}
                >
                  {s.caption}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
