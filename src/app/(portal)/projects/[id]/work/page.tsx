import { notFound } from "next/navigation";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AssetReviewGrid } from "@/components/portal/asset-review-viewer";
import { DeliveryPackage, SignOffPanel } from "@/components/portal/project/stage-panels";
import { approveAllAssetsAction } from "@/lib/actions/project-actions";
import { loadProjectState } from "@/lib/project-state-loader";
import { loadReviewAssets } from "@/lib/review-assets";

/** Work = the old Assets + Delivery + Final tabs. Becomes the delivery package once the work is final. */
export default async function ProjectWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  const loaded = await loadProjectState(id, viewer.clientId, viewer.id);
  if (!loaded) notFound();
  const { state } = loaded;

  if ((state.stage === "final" && state.ballInCourt === "client") || state.stage === "closed") {
    return (
      <div className="flex flex-col gap-6">
        <DeliveryPackage projectId={id} viewer={viewer} />
        <SignOffPanel projectId={id} state={state} />
      </div>
    );
  }

  const assets = await loadReviewAssets(id, viewer.clientId);
  if (assets.length === 0) {
    return (
      <Card className="flex flex-col gap-1 p-6">
        <p className="text-sm font-medium">Nothing produced yet</p>
        <p className="text-sm text-muted-foreground">Assets show up here as Klingit delivers them. Right now: {state.nextAction.label}.</p>
      </Card>
    );
  }

  const canReview = state.assetsAwaitingReview > 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <SectionLabel>All assets</SectionLabel>
          <p className="mt-1 text-xs text-muted-foreground">
            {canReview ? "Open an asset to comment on it or request changes." : "Open an asset to see its comments."}
          </p>
        </div>
        {canReview && (
          <form action={approveAllAssetsAction}>
            <input type="hidden" name="projectId" value={id} />
            <Button type="submit" size="sm">
              Approve all
            </Button>
          </form>
        )}
      </div>
      <AssetReviewGrid assets={assets} projectId={id} canReview={canReview} />
    </div>
  );
}
