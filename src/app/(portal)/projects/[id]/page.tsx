import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { BriefConversation } from "@/components/portal/project/brief-conversation";
import {
  BriefAndNextStepsRow,
  DeliveryPackageCard,
  EstimateCard,
  OverviewNextStep,
  RatingCard,
  WhatsHappeningCard,
  WaitingForReviewCard,
  ActivityCard,
} from "@/components/portal/project/stage-panels";
import { loadProjectState } from "@/lib/project-state-loader";
import type { ProjectState } from "@/lib/project-state";
import type { PortalViewer } from "@/lib/brief-intake";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  const loaded = await loadProjectState(id, viewer.clientId, viewer.id);
  if (!loaded) notFound();
  const { state } = loaded;

  // A revised estimate after the client already approved one: their turn, while the work carries on.
  const revision =
    state.stage !== "awaiting_approval" &&
    (await prisma.estimate.findFirst({ where: { projectId: id, status: "SENT", approvedVersion: { not: null }, project: { clientId: viewer.clientId } }, select: { id: true } }));

  return (
    <div className="flex flex-col gap-5">
      <OverviewNextStep projectId={id} viewer={viewer} state={state} />
      {revision && <EstimateCard projectId={id} viewer={viewer} revision />}
      <StageContent projectId={id} viewer={viewer} state={state} />
    </div>
  );
}

/** Only the current stage's content renders under the Next step card. */
async function StageContent(props: { projectId: string; viewer: PortalViewer; state: ProjectState }) {
  const { state } = props;
  if (state.paused) return <WhatsHappeningCard {...props} />;
  switch (state.stage) {
    case "briefing":
      return <BriefConversation {...props} />;
    case "awaiting_approval":
      return (
        <>
          <EstimateCard {...props} />
          <BriefAndNextStepsRow {...props} />
        </>
      );
    case "estimating":
    case "staffing":
    case "production":
      return <WhatsHappeningCard {...props} />;
    case "review":
      return (
        <>
          <WaitingForReviewCard {...props} />
          <ActivityCard projectId={props.projectId} title="Latest activity" />
        </>
      );
    case "final":
      return state.ballInCourt === "client" ? (
        <>
          <DeliveryPackageCard {...props} />
          <RatingCard projectId={props.projectId} />
        </>
      ) : (
        <WhatsHappeningCard {...props} />
      );
    case "closed":
      return <DeliveryPackageCard {...props} />;
  }
}
