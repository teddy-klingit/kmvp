import Link from "next/link";
import { ArrowRight, Clock3, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDay, type ProjectState } from "@/lib/project-state";
import { cn } from "@/lib/utils";
import { resumeProjectAction } from "@/lib/actions/project-lifecycle-actions";

/** Top-of-Overview card built only from getProjectState().nextAction. */
export function NextStepCard({ state, projectId, showCta = true }: { state: ProjectState; projectId: string; showCta?: boolean }) {
  const { nextAction, ballInCourt } = state;
  const yourTurn = ballInCourt === "client";
  const agentQuestion = yourTurn && state.stage === "briefing" && state.brief.mode !== "intake" ? state.brief.next : null;
  // On Overview the question is answered inline right below, so don't repeat it here.
  const showQuestion = agentQuestion && showCta;

  return (
    <Card className={cn("flex flex-col gap-3 p-5", yourTurn ? "bg-fade-purple-green" : "border border-border bg-paper")}>
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-paper text-ink">
          {yourTurn ? <Sparkles className="size-4" /> : <Clock3 className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Next step</p>
          <p className="text-sm font-semibold text-ink">{nextAction.label}</p>
          {showQuestion ? (
            <div className="mt-2 rounded-lg border border-border bg-paper p-3">
              <p className="text-xs font-medium text-muted-foreground">Brief agent asks</p>
              <p className="text-sm text-ink">{agentQuestion!.question}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {agentQuestion ? "The brief agent's question is just below — answer it there." : nextAction.description}
            </p>
          )}
          {nextAction.dueAt && yourTurn && (
            <p className="mt-1 text-xs font-medium text-ink">
              {state.urgency === "overdue" ? "Overdue since" : "Due"} {formatDay(nextAction.dueAt)}
            </p>
          )}
        </div>
        {state.paused ? (
          <form action={resumeProjectAction} className="shrink-0">
            <input type="hidden" name="projectId" value={projectId} />
            <Button type="submit" size="sm">
              Resume
            </Button>
          </form>
        ) : showCta && nextAction.cta && (
          <Button asChild size="sm" className="shrink-0 gap-1.5">
            <Link href={nextAction.href}>
              {nextAction.cta}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}
