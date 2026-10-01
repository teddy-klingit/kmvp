import { notFound } from "next/navigation";
import { getPortalViewer } from "@/lib/current-viewer";
import { NextStepCard } from "@/components/portal/next-step-card";
import { BriefConversation } from "@/components/portal/project/brief-conversation";
import {
  ClosedPanel,
  DeliveryPackage,
  EstimateApprovalPanel,
  EstimatingPanel,
  ProgressPanel,
  ReviewPanel,
  SignOffPanel,
} from "@/components/portal/project/stage-panels";
import { loadProjectState } from "@/lib/project-state-loader";
import type { ProjectState } from "@/lib/project-state";
import type { PortalViewer } from "@/lib/brief-intake";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  const loaded = await loadProjectState(id, viewer.clientId, viewer.id);
  if (!loaded) notFound();
  const { project, state } = loaded;

  return (
    <div className="flex flex-col gap-6">
      {/* The action itself lives right below, so the card only needs a button when paused. */}
      <NextStepCard state={state} projectId={id} showCta={false} />
      <StageContent projectId={id} viewer={viewer} state={state} deliveredAt={project.deliveredAt} />
    </div>
  );
}

/** Only the current stage's content renders. */
async function StageContent(props: { projectId: string; viewer: PortalViewer; state: ProjectState; deliveredAt: Date | null }) {
  const { state } = props;
  if (state.paused) return <ProgressPanel {...props} />;
  switch (state.stage) {
    case "briefing":
      return <BriefConversation {...props} />;
    case "estimating":
      return <EstimatingPanel {...props} />;
    case "awaiting_approval":
      return <EstimateApprovalPanel {...props} />;
    case "staffing":
    case "production":
      return <ProgressPanel {...props} />;
    case "review":
      return <ReviewPanel {...props} />;
    case "final":
      return state.ballInCourt === "client" ? (
        <div className="flex flex-col gap-6">
          <DeliveryPackage {...props} />
          <SignOffPanel {...props} />
        </div>
      ) : (
        <ReviewPanel {...props} />
      );
    case "closed":
      return (
        <div className="flex flex-col gap-6">
          <ClosedPanel {...props} />
          <DeliveryPackage {...props} />
        </div>
      );
  }
}
