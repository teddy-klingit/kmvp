import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { formatDate } from "@/lib/utils";
import type { TimelineStep } from "@/lib/project-state";

function caption(step: TimelineStep) {
  if (!step.date) return undefined;
  if (step.status === "done") return `Done ${formatDate(step.date)}`;
  if (step.status === "current") return `Due ${formatDate(step.date)}`;
  return `Est. ${formatDate(step.date)}`;
}

export function ProjectTimelineStepper({ timeline, className }: { timeline: TimelineStep[]; className?: string }) {
  const steps: StepperStep[] = timeline.map((t) => ({
    label: t.label,
    state: t.status === "done" ? "completed" : t.status === "current" ? "active" : "upcoming",
    caption: caption(t),
  }));
  return <Stepper steps={steps} className={className} />;
}
