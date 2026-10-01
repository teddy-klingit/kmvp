import { Badge, type BadgeProps } from "@/components/ui/badge";
import { stageStatusText, type ProjectState } from "@/lib/project-state";

const STAGE_TONE: Record<ProjectState["stage"], BadgeProps["tone"]> = {
  briefing: "neutral",
  estimating: "neutral",
  awaiting_approval: "accent",
  staffing: "info",
  production: "warning",
  review: "accent",
  final: "accent",
  closed: "success",
};

export function StageBadge({ state, className }: { state: ProjectState; className?: string }) {
  const tone = state.archived ? "neutral" : state.paused ? "warning" : STAGE_TONE[state.stage];
  return (
    <Badge tone={tone} className={className}>
      {stageStatusText(state)}
    </Badge>
  );
}
