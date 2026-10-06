import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageIcon } from "lucide-react";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { EmptyState } from "@/components/ds/empty-state";
import { DeliveryPackageCard, SignOffCard } from "@/components/portal/project/stage-panels";
import { WorkGrid } from "@/components/portal/project/work-grid";
import { approveAllAssetsAction } from "@/lib/actions/project-actions";
import { loadProjectState } from "@/lib/project-state-loader";
import { loadReviewAssets } from "@/lib/review-assets";
import { clientCheckSummary } from "@/lib/qc/quality-check";
import { QualityChip } from "@/components/review/quality-chip";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All", match: () => true },
  { key: "review", label: "Needs your review", match: (s: string) => s === "IN_REVIEW" },
  { key: "changes", label: "Changes asked", match: (s: string) => s === "CHANGES_REQUESTED" },
  { key: "approved", label: "Approved", match: (s: string) => s === "APPROVED" || s === "DELIVERED" },
] as const;

/** Work = every asset with its review status and comments. Becomes the delivery package once the work is final. */
export default async function ProjectWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; asset?: string }>;
}) {
  const { id } = await params;
  const { filter = "all", asset } = await searchParams;
  const viewer = await getPortalViewer();
  const loaded = await loadProjectState(id, viewer.clientId, viewer.id);
  if (!loaded) notFound();
  const { state } = loaded;

  if ((state.stage === "final" && state.ballInCourt === "client") || state.stage === "closed") {
    return (
      <div className="flex flex-col gap-5">
        <DeliveryPackageCard projectId={id} viewer={viewer} />
        {state.stage === "final" && <SignOffCard projectId={id} />}
      </div>
    );
  }

  const [assets, checks] = await Promise.all([loadReviewAssets(id, viewer.clientId), clientCheckSummary(id)]);
  if (assets.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ImageIcon}
          title="Nothing to review yet"
          description={`Your assets appear here as Klingit delivers them. Right now: ${state.nextAction.label}.`}
        />
      </Card>
    );
  }

  const canReview = state.assetsAwaitingReview > 0;
  // Empty filters are noise; "All" always shows. "Needs your review" only exists once the work is delivered to the client.
  const filters = FILTERS.filter(
    (f) => f.key === "all" || (assets.some((a) => f.match(a.status)) && (canReview || f.key !== "review"))
  );
  const active = filters.find((f) => f.key === filter) ?? filters[0];
  const shown = assets.filter((a) => active.match(a.status));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => {
          const count = assets.filter((a) => f.match(a.status)).length;
          const on = f.key === active.key;
          return (
            <Link
              key={f.key}
              href={f.key === "all" ? `/projects/${id}/work` : `/projects/${id}/work?filter=${f.key}`}
              aria-current={on ? "true" : undefined}
              className={cn(
                "inline-flex h-11 items-center rounded-full sm:h-8 border px-3 text-[13px] font-medium no-underline",
                on ? "border-ds-text bg-ds-text text-white" : "border-ds-control-border bg-white text-ds-text hover:border-ds-text-3"
              )}
            >
              {f.label} · {count}
            </Link>
          );
        })}
        <span className="flex-1" />
        <QualityChip total={checks.total} items={checks.items} />
        {canReview && state.assetsAwaitingReview >= 2 && (
          <form action={approveAllAssetsAction}>
            <input type="hidden" name="projectId" value={id} />
            <Button type="submit" variant="secondary" size="md">
              Approve {state.assetsAwaitingReview} in review
            </Button>
          </form>
        )}
      </div>
      {shown.length > 0 ? (
        <WorkGrid assets={shown} projectId={id} canReview={canReview} openAssetId={asset} />
      ) : (
        <Card>
          <EmptyState title={`Nothing under “${active.label}”`} />
        </Card>
      )}
    </div>
  );
}
