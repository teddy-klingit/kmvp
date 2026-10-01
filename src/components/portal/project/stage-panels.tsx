import Link from "next/link";
import { Check } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersonAvatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { RatingStars } from "@/components/portal/rating-stars";
import { CommentComposer } from "@/components/portal/comment-composer";
import { AssetReviewGrid } from "@/components/portal/asset-review-viewer";
import { ProjectTimelineStepper } from "@/components/portal/project-timeline-stepper";
import {
  approveAllAssetsAction,
  approveEstimateAction,
  postCommentAction,
  rateProjectAction,
  signOffProjectAction,
} from "@/lib/actions/project-actions";
import { loadReviewAssets } from "@/lib/review-assets";
import { formatDate, jsonArray } from "@/lib/utils";
import { FIRST_DRAFT_BUSINESS_DAYS, formatDay, type ProjectState } from "@/lib/project-state";
import type { PortalViewer } from "@/lib/brief-intake";

type PanelProps = { projectId: string; viewer: PortalViewer; state: ProjectState };

/** estimating — nothing for the client to do; show what Klingit is scoping. */
export async function EstimatingPanel({ projectId, viewer }: PanelProps) {
  const brief = await prisma.brief.findFirst({ where: { projectId, project: { clientId: viewer.clientId } } });
  const summary = brief?.aiSummary ?? brief?.goals ?? brief?.rawIntake;
  if (!summary) return null;
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>What Klingit is scoping</SectionLabel>
      <Card className="p-5 text-sm">{summary}</Card>
    </div>
  );
}

/** awaiting_approval — the estimate summary with Approve / Ask a question. */
export async function EstimateApprovalPanel({ projectId, viewer, state }: PanelProps) {
  const estimate = await prisma.estimate.findFirst({
    where: { projectId, status: "SENT", project: { clientId: viewer.clientId } },
    include: { lineItems: { orderBy: { order: "asc" } }, sentByStaff: { include: { user: true } } },
  });
  if (!estimate) return null;
  const inclusions = jsonArray<string>(estimate.inclusions);

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Estimate for approval</SectionLabel>
      <Card className="overflow-hidden p-0">
        {estimate.notes && (
          <div className="flex items-start gap-3 border-b border-border px-5 py-4">
            <PersonAvatar name={estimate.sentByStaff?.user.name ?? "Klingit"} size="sm" />
            <p className="text-sm text-muted-foreground">{estimate.notes}</p>
          </div>
        )}
        <table className="w-full text-sm">
          <tbody>
            {estimate.lineItems.map((li) => (
              <tr key={li.id} className="border-b border-border">
                <td className="px-5 py-3 font-medium">{li.deliverable}</td>
                <td className="px-5 py-3 text-muted-foreground">{li.detail}</td>
                <td className="px-5 py-3 text-right">{li.credits}c</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-5 py-3">Total</td>
              <td />
              <td className="px-5 py-3 text-right">{estimate.totalCredits}c</td>
            </tr>
          </tbody>
        </table>
        {inclusions.length > 0 && (
          <ul className="flex flex-col gap-1.5 border-t border-border px-5 py-4 text-sm">
            {inclusions.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-3.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-paper p-4">
        <form action={approveEstimateAction} className="flex flex-wrap items-center justify-between gap-3">
          <input type="hidden" name="estimateId" value={estimate.id} />
          <p className="text-sm text-muted-foreground">
            {estimate.expiresAt ? `Valid until ${formatDay(estimate.expiresAt)}. ` : ""}
            Approving lets Klingit staff your team — first draft within {FIRST_DRAFT_BUSINESS_DAYS} business days of that.
          </p>
          <Button type="submit">Approve estimate ({state.keyFacts.credits} credits)</Button>
        </form>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Ask a question</p>
          <CommentComposer action={postCommentAction} projectId={projectId} placeholder="Ask your account lead about this estimate…" />
        </div>
      </div>
    </div>
  );
}

/** staffing / production — progress, staffed team, first-draft ETA. */
export function ProgressPanel({ state }: PanelProps) {
  const { keyFacts } = state;
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Progress</SectionLabel>
      <Card className="flex flex-col gap-5 p-5">
        <ProjectTimelineStepper timeline={state.timeline} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">First draft</p>
            <p className="text-sm font-medium">
              {keyFacts.firstDraftEta
                ? formatDay(keyFacts.firstDraftEta)
                : `Within ${FIRST_DRAFT_BUSINESS_DAYS} business days of your team being confirmed`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Your Klingit team</p>
            {keyFacts.staffedTeam.length ? (
              <div className="mt-1 flex flex-wrap gap-3">
                {keyFacts.staffedTeam.map((m) => (
                  <span key={m.name} className="flex items-center gap-2 text-sm">
                    <PersonAvatar name={m.name} size="sm" />
                    <span>
                      {m.name} <span className="text-muted-foreground">· {m.role}</span>
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm font-medium">Being staffed</p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

/** review — assets awaiting review, commented on in place. */
export async function ReviewPanel({ projectId, viewer, state }: PanelProps) {
  const assets = await loadReviewAssets(projectId, viewer.clientId, ["IN_REVIEW", "CHANGES_REQUESTED", "APPROVED"]);
  const canReview = state.assetsAwaitingReview > 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <SectionLabel>Awaiting your review</SectionLabel>
          <p className="mt-1 text-xs text-muted-foreground">Open an asset to comment directly on it, or request changes.</p>
        </div>
        {canReview && (
          <form action={approveAllAssetsAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <Button type="submit" size="sm">
              Approve all
            </Button>
          </form>
        )}
      </div>
      <AssetReviewGrid assets={assets} projectId={projectId} canReview={canReview} />
    </div>
  );
}

/** final — rating + sign-off. Only rendered when stage is final and it's the client's turn. */
export function SignOffPanel({ projectId, state }: Pick<PanelProps, "projectId" | "state">) {
  if (state.stage !== "final" || state.ballInCourt !== "client") return null;
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>How did we do?</SectionLabel>
      <Card className="p-5">
        <form action={rateProjectAction} className="flex flex-wrap items-center gap-4">
          <input type="hidden" name="projectId" value={projectId} />
          <RatingStars name="rating" />
          <Input name="feedback" placeholder="Leave a comment for the team (optional)…" className="min-w-48 flex-1" />
          <Button type="submit" variant="secondary" className="shrink-0">
            Rate this project
          </Button>
        </form>
      </Card>
      <Card className="flex flex-wrap items-center justify-between gap-4 border border-border bg-paper p-5">
        <div>
          <p className="text-sm font-semibold">Sign off and close project</p>
          <p className="text-sm text-muted-foreground">Assets move to your archive and you get a full project report.</p>
        </div>
        <form action={signOffProjectAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="rating" value={5} />
          <Button type="submit" className="bg-success text-ink hover:bg-success">
            Sign off
          </Button>
        </form>
      </Card>
    </div>
  );
}

/** final — the delivery package (Overview and Work both show it). */
export async function DeliveryPackage({ projectId, viewer }: Pick<PanelProps, "projectId" | "viewer">) {
  const [assets, lineItems] = await Promise.all([
    prisma.asset.findMany({ where: { projectId, clientId: viewer.clientId, status: { in: ["APPROVED", "DELIVERED"] } }, orderBy: { createdAt: "asc" } }),
    prisma.estimateLineItem.findMany({ where: { estimate: { projectId } }, orderBy: { order: "asc" } }),
  ]);
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Delivery package</SectionLabel>
      {lineItems.length > 0 && (
        <Card className="flex flex-col gap-2.5 p-5">
          {lineItems.map((li) => (
            <div key={li.id} className="flex items-start gap-3 text-sm">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-success" />
              <div>
                <p className="font-medium">{li.deliverable}</p>
                <p className="text-xs text-muted-foreground">{li.detail}</p>
              </div>
            </div>
          ))}
        </Card>
      )}
      {assets.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {assets.map((a) => (
            <div key={a.id} className="flex flex-col gap-1.5">
              <div className="relative flex aspect-square items-start rounded-xl p-2" style={{ backgroundColor: a.thumbnailColor }}>
                <StatusBadge status={a.status === "DELIVERED" ? "Delivered" : "Approved"} />
              </div>
              <p className="truncate text-xs text-muted-foreground">{a.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** closed — what was delivered, plus a way to ask for more. */
export function ClosedPanel({ projectId, state, deliveredAt }: Pick<PanelProps, "projectId" | "state"> & { deliveredAt: Date | null }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <p className="text-sm font-semibold">{state.archived ? "Archived" : "Delivered and signed off"}</p>
        <p className="text-sm text-muted-foreground">
          {deliveredAt ? `Closed ${formatDate(deliveredAt)}. ` : ""}Need changes or more of the same? Start a change request.
        </p>
      </div>
      <Button asChild variant="secondary" size="sm">
        <Link href={`/projects/${projectId}/change-request`}>Request changes</Link>
      </Button>
    </Card>
  );
}
