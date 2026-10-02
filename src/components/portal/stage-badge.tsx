import { Badge, type BadgeProps } from "@/components/ui/badge";
import { stageStatusText, type ProjectState } from "@/lib/project-state";

const STAGE_TONE: Record<ProjectState["clientStage"], BadgeProps["tone"]> = {
  draft: "neutral",
  queued: "neutral",
  active: "info",
  in_review: "accent",
  delivered: "success",
  archived: "neutral",
};

export function StageBadge({ state, className }: { state: ProjectState; className?: string }) {
  const tone = state.archived ? "neutral" : state.paused ? "warning" : STAGE_TONE[state.clientStage];
  return (
    <Badge tone={tone} className={className}>
      {stageStatusText(state)}
    </Badge>
  );
}
