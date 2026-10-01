import Link from "next/link";
import { Check } from "lucide-react";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { cn } from "@/lib/utils";

export type StepStatus = "done" | "current" | "upcoming";

/** The cockpit's step pills: who did this step, or whether it needs the PM. */
export const STEP_PILL = {
  agent: { label: "Done by agent", tone: "info" },
  priced: { label: "Priced by agent", tone: "info" },
  auto: { label: "Runs automatically on approval", tone: "neutral" },
  pm: { label: "Changed by PM", tone: "neutral" },
  needs: { label: "Needs you", tone: "turn" },
  manual: { label: "Manual", tone: "neutral" },
  done: { label: "Done", tone: "success" },
} satisfies Record<string, { label: string; tone: PillTone }>;

export type StepPillKey = keyof typeof STEP_PILL;

function Dot({ status }: { status: StepStatus }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        status === "done" && "bg-ds-text",
        status === "current" && "border-2 border-ds-text",
        status === "upcoming" && "border-2 border-ds-control-border"
      )}
      aria-hidden
    >
      {status === "done" && <Check className="size-4 text-white" strokeWidth={2.5} />}
      {status === "current" && <span className="size-2 rounded-full bg-ds-text" />}
    </span>
  );
}

/**
 * One cockpit step (Brief, Estimate, Staffing, Production…): status dot, title, who-did-it pill,
 * a one-line summary, "Why" (the agent's reasoning) and "Edit". `editing` gives the card the
 * focus treatment from PMCockpit.dc.html (ink border, lifted shadow).
 */
export function StepCard({
  id,
  title,
  status,
  pills = [],
  summary,
  why,
  editHref,
  editing = false,
  actions,
  children,
}: {
  id: string;
  title: string;
  status: StepStatus;
  pills?: { label: string; tone: PillTone }[];
  summary?: React.ReactNode;
  why?: React.ReactNode;
  editHref?: string;
  editing?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className={cn(
        "scroll-mt-6 overflow-hidden rounded-[12px] border bg-ds-card",
        editing ? "border-ds-text shadow-[0_4px_16px_rgba(16,24,40,0.08)]" : "border-ds-border shadow-ds"
      )}
    >
      <div className={cn("flex flex-wrap items-center gap-4 px-6 py-[18px]", children && "border-b border-ds-divider")}>
        <Dot status={status} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[15px] font-semibold text-ds-text">{title}</h2>
            {pills.map((p) => (
              <StatusPill key={p.label} tone={p.tone}>
                {p.label}
              </StatusPill>
            ))}
          </div>
          {summary && <span className="text-[14px] text-ds-text-2">{summary}</span>}
        </div>
        <div className="flex items-center gap-2">
          {why && (
            <details className="group relative">
              <summary className="flex h-8 cursor-pointer list-none items-center rounded-[8px] px-3 text-[13px] font-medium text-ds-text hover:bg-ds-subtle [&::-webkit-details-marker]:hidden">
                Why
              </summary>
              <div className="absolute right-0 top-9 z-20 w-[360px] max-w-[80vw] rounded-[10px] border border-ds-border bg-white p-4 text-[13px] text-ds-text-body shadow-lg">
                {why}
              </div>
            </details>
          )}
          {actions}
          {editHref && !editing && (
            <Button asChild variant="secondary" size="sm">
              <Link href={editHref} scroll={false}>
                Edit
              </Link>
            </Button>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

/** The "Why" popover body: the agent run's decision, when, and whether a PM overrode it. */
export function AgentWhy({
  run,
}: {
  run: { decision: string | null; createdAt: Date; output: unknown; overridden: boolean; overrideReason: string | null; agent: { name: string }; overriddenByUser?: { name: string } | null } | null;
}) {
  if (!run) return <p className="m-0">No agent ran this step. A PM did it by hand.</p>;
  const output = run.output as Record<string, unknown> | null;
  const notes = typeof output?.notes === "string" ? output.notes : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 font-medium text-ds-text">{run.agent.name}</p>
      <p className="m-0">{run.decision ?? "No decision recorded."}</p>
      {notes && <p className="m-0 text-ds-text-2">“{notes}”</p>}
      <p className="m-0 text-[12px] text-ds-text-3">
        {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(run.createdAt)}
      </p>
      {run.overridden && (
        <p className="m-0 rounded-[8px] bg-ds-subtle px-2.5 py-1.5 text-[12px]">
          Overridden by {run.overriddenByUser?.name ?? "a PM"}
          {run.overrideReason ? `: ${run.overrideReason}` : ""}
        </p>
      )}
    </div>
  );
}
