import Link from "next/link";
import { Check, Download, ImageIcon, Play } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { StatusPill } from "@/components/ds/status-pill";
import { NextStepCard } from "@/components/ds/next-step-card";
import { AskButton } from "@/components/ds/ask-button";
import { EmptyState } from "@/components/ds/empty-state";
import { RatingStars } from "@/components/portal/rating-stars";
import { approveEstimateAction, rateProjectAction, requestEstimateChangesAction, signOffProjectAction } from "@/lib/actions/project-actions";
import { resumeProjectAction } from "@/lib/actions/project-lifecycle-actions";
import { cn, jsonArray } from "@/lib/utils";
import { diffEstimate, type LineChange, type SnapshotLine } from "@/lib/estimate-diff";
import { loadReviewAssets } from "@/lib/review-assets";
import { COMPLEXITY_LABEL, lineName } from "@/lib/estimate-display";
import type { ComplexityTier } from "@/generated/prisma";
import { shortDate, FIRST_DRAFT_BUSINESS_DAYS, type ProjectState } from "@/lib/project-state";
import type { PortalViewer } from "@/lib/brief-intake";

type PanelProps = { projectId: string; viewer: PortalViewer; state: ProjectState };

function sentence(label: string) {
  const s = label.replace(/^(Your turn|Klingit): /, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The NextStepCard copy + actions for whichever stage the project is in. */
export async function OverviewNextStep({ projectId, viewer, state }: PanelProps) {
  const { nextAction, stage } = state;
  const turn = state.ballInCourt === "client";
  const ask = <AskButton context={stage === "awaiting_approval" ? { kind: "estimate", label: "On estimate" } : undefined} />;

  if (state.paused) {
    return (
      <NextStepCard
        variant="turn"
        title="Paused — resume to continue"
        description={nextAction.description}
        actions={
          <form action={resumeProjectAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <Button type="submit" variant="primary" size="lg">
              Resume project
            </Button>
          </form>
        }
      />
    );
  }

  if (stage === "awaiting_approval") {
    const estimate = await prisma.estimate.findFirst({
      where: { projectId, status: "SENT", project: { clientId: viewer.clientId } },
      select: { id: true, totalCredits: true },
    });
    return (
      <NextStepCard
        variant="turn"
        title="Approve the estimate"
        description={`Once approved, Klingit staffs your team and delivers a first draft within ${FIRST_DRAFT_BUSINESS_DAYS} business days.`}
        actions={
          <>
            {ask}
            {estimate && (
              <form action={approveEstimateAction}>
                <input type="hidden" name="estimateId" value={estimate.id} />
                <Button type="submit" variant="primary" size="lg">
                  Approve · {estimate.totalCredits} credits
                </Button>
              </form>
            )}
          </>
        }
      />
    );
  }

  if (stage === "review" && turn) {
    return (
      <NextStepCard
        variant="turn"
        title={sentence(nextAction.label)}
        description="Approve each asset, or ask for changes on it, in Work."
        actions={
          <>
            {ask}
            <Button asChild variant="primary" size="lg">
              <Link href={`/projects/${projectId}/work`}>Review in Work</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (stage === "final" && turn) {
    return (
      <NextStepCard
        variant="turn"
        title={sentence(nextAction.label)}
        description="Files move to your archive and you get a full project report."
        actions={
          <>
            {ask}
            <SignOffButton projectId={projectId} />
          </>
        }
      />
    );
  }

  if (stage === "closed") {
    return (
      <NextStepCard
        variant="klingit"
        eyebrow="DELIVERED"
        title={state.archived ? "This project is archived" : "Delivered and signed off"}
        description="Need changes or more of the same? Start a change request."
        actions={
          <Button asChild variant="secondary" size="lg">
            <Link href={`/projects/${projectId}/change-request`}>Request changes</Link>
          </Button>
        }
      />
    );
  }

  const description =
    stage === "briefing" && turn && state.brief.mode !== "intake" && state.brief.next
      ? "The brief agent's question is just below."
      : nextAction.description;
  return <NextStepCard variant={turn ? "turn" : "klingit"} title={sentence(nextAction.label)} description={description} actions={ask} />;
}

/** awaiting_approval — the estimate as sent: version + validity, line items, total, inclusions. */
/** The version the client is comparing against: the last one they approved, else the previous one sent. */
async function estimateBaseline(estimate: { id: string; version: number; approvedVersion: number | null }) {
  if (estimate.version <= 1) return null;
  const baseVersion = estimate.approvedVersion && estimate.approvedVersion < estimate.version ? estimate.approvedVersion : estimate.version - 1;
  const base = await prisma.estimateRevision.findUnique({ where: { estimateId_version: { estimateId: estimate.id, version: baseVersion } } });
  return base ? { version: baseVersion, total: base.totalCredits, lines: jsonArray<SnapshotLine>(base.lineItems) } : null;
}

/** awaiting_approval (or a revision after approval) — the estimate as sent, with changes highlighted on v2+. */
export async function EstimateCard({ projectId, viewer, revision = false }: Omit<PanelProps, "state"> & { revision?: boolean }) {
  const estimate = await prisma.estimate.findFirst({
    where: { projectId, status: "SENT", project: { clientId: viewer.clientId } },
    include: { lineItems: { orderBy: { order: "asc" }, include: { priceListItem: true } } },
  });
  if (!estimate) return null;
  const inclusions = jsonArray<string>(estimate.inclusions);
  const base = await estimateBaseline(estimate);
  const diff = base ? diffEstimate(base.lines, estimate.lineItems.map((l) => ({ ...l, deliverable: lineName(l) }))) : null;
  return (
    <Card aria-label={revision ? "Revised estimate" : "Estimate"} className="overflow-hidden" id="estimate" tone={revision ? "turn" : "default"}>
      <CardHeader
        title={revision ? `Revised estimate v${estimate.version}` : "Estimate"}
        meta={<StatusPill>v{estimate.version}{estimate.expiresAt ? ` · valid until ${shortDate(estimate.expiresAt)}` : ""}</StatusPill>}
        action={<span className="text-[12px] text-ds-text-2">Priced from the Klingit price list</span>}
      />
      {base && (
        <div className="flex flex-col gap-0.5 border-b border-ds-divider bg-ds-watch-tint px-6 py-3 text-[13px] text-ds-watch-text">
          <span className="font-medium">Changed since v{base.version}{estimate.revisionReason ? `: ${estimate.revisionReason}` : ""}</span>
          {diff && diff.removed.length > 0 && <span>Removed: {diff.removed.map((r) => r.deliverable).join(", ")}</span>}
          {estimate.approvedVersion && revision && <span>If you decline, v{estimate.approvedVersion} ({base.total} credits) stays in force and the work carries on.</span>}
        </div>
      )}
      <EstimateTable lines={estimate.lineItems} total={estimate.totalCredits} changes={diff?.changes} prevTotal={base?.total} />
      {inclusions.length > 0 && <Inclusions items={inclusions} />}
      {revision && (
        <div className="flex flex-col-reverse gap-2 border-t border-ds-divider px-6 py-4 sm:flex-row sm:justify-end">
          <form action={requestEstimateChangesAction}>
            <input type="hidden" name="estimateId" value={estimate.id} />
            <Button type="submit" variant="secondary" size="lg" className="w-full sm:w-auto">
              Decline · keep v{estimate.approvedVersion}
            </Button>
          </form>
          <form action={approveEstimateAction}>
            <input type="hidden" name="estimateId" value={estimate.id} />
            <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto">
              Approve v{estimate.version} · {estimate.totalCredits} credits
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}

export type EstimateTableLine = {
  id: string;
  deliverable: string;
  detail: string | null;
  credits: number;
  quantity?: number;
  complexityTier: ComplexityTier | null;
  priceListItem?: { displayName: string | null } | null;
};

/** Deliverable · Details · Complexity · Credits, with the total row — as in Main.dc.html. `changes` highlights a revision. */
export function EstimateTable({
  lines,
  total,
  changes,
  prevTotal,
}: {
  lines: EstimateTableLine[];
  total: number;
  changes?: (LineChange | null)[];
  prevTotal?: number;
}) {
  return (
    <table className="w-full border-collapse text-[14px]">
      <thead>
        <tr className="text-left text-[12px] text-ds-text-2">
          <th scope="col" className="px-6 py-2.5 font-medium">Deliverable</th>
          <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Details</th>
          <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Complexity</th>
          <th scope="col" className="px-6 py-2.5 text-right font-medium">Credits</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((li, i) => {
          const change = changes?.[i];
          return (
          <tr key={li.id} id={`line-${li.id}`} className={cn("border-t border-ds-divider", change && "bg-ds-watch-tint/60")}>
            <td className="px-6 py-3.5 font-medium text-ds-text">
              {lineName(li)}
              {change && (
                <span className="mt-0.5 block text-[12px] font-normal text-ds-watch-text">
                  {change.isNew
                    ? "New in this version"
                    : [
                        change.prevQuantity !== undefined && change.prevQuantity !== li.quantity ? `Quantity ${change.prevQuantity} → ${li.quantity}` : null,
                        change.prevTier && change.prevTier !== li.complexityTier && li.complexityTier
                          ? `${COMPLEXITY_LABEL[change.prevTier]} → ${COMPLEXITY_LABEL[li.complexityTier]}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Changed"}
                </span>
              )}
              {/* Phones: details and complexity move under the name. */}
              <span className="mt-1 flex flex-wrap items-center gap-2 font-normal text-ds-text-2 sm:hidden">
                {li.detail}
                {li.complexityTier && <StatusPill>{COMPLEXITY_LABEL[li.complexityTier]}</StatusPill>}
              </span>
            </td>
            <td className="hidden px-3 py-3.5 text-ds-text-2 sm:table-cell">{li.detail}</td>
            <td className="hidden px-3 py-3.5 sm:table-cell">
              {li.complexityTier && <StatusPill>{COMPLEXITY_LABEL[li.complexityTier]}</StatusPill>}
            </td>
            <td className="px-6 py-3.5 text-right tabular-nums text-ds-text">
              {change?.prevCredits !== undefined && change.prevCredits !== li.credits && (
                <span className="mr-1.5 text-ds-text-3 line-through">{change.prevCredits}</span>
              )}
              {li.credits}
            </td>
          </tr>
          );
        })}
        <tr className="border-t border-ds-border bg-ds-subtle-2">
          <td className="px-6 py-3.5 font-semibold text-ds-text">Total</td>
          <td className="hidden sm:table-cell" />
          <td className="hidden sm:table-cell" />
          <td className="whitespace-nowrap px-6 py-3.5 text-right font-semibold tabular-nums text-ds-text">
            {prevTotal !== undefined && prevTotal !== total && <span className="mr-1.5 font-medium text-ds-text-3 line-through">{prevTotal}</span>}
            {total} credits
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function Inclusions({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-ds-divider px-6 pb-5 pt-4">
      {items.map((item) => (
        <span key={item} className="inline-flex items-start gap-2 sm:items-center text-[14px] text-ds-text-body">
          <Check className="size-4 shrink-0 text-ds-check" strokeWidth={2} />
          {item}
        </span>
      ))}
    </div>
  );
}

/** Two-column row under the estimate: what was asked for + what happens after approval. */
export async function BriefAndNextStepsRow({ projectId, viewer }: Omit<PanelProps, "state">) {
  const brief = await prisma.brief.findFirst({ where: { projectId, project: { clientId: viewer.clientId } } });
  const rows = [
    { label: "Objective", value: brief?.goals },
    { label: "Audience", value: brief?.targetAudience },
    { label: "Success metric", value: brief?.successMetrics },
  ].filter((r): r is { label: string; value: string } => Boolean(r.value));

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <Card aria-label="Brief summary">
        <CardHeader
          title="Brief"
          action={
            <Link href={`/projects/${projectId}/scope`} className="text-[13px] font-medium text-ds-text no-underline hover:underline">
              View full brief
            </Link>
          }
        />
        {rows.length > 0 ? (
          <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[120px_1fr] sm:gap-y-3 px-6 pb-5 pt-4 text-[14px]">
            {rows.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-ds-text-2">{r.label}</dt>
                <dd className="m-0 text-ds-text">{r.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyState title="No brief details yet" />
        )}
      </Card>
      <Card aria-label="What happens next">
        <CardHeader title="After you approve" />
        <ol className="m-0 flex list-none flex-col gap-3.5 px-6 pb-5 pt-4 text-[14px] text-ds-text">
          {[
            "We match the right creatives and introduce your team here.",
            `First draft is ready to review within ${FIRST_DRAFT_BUSINESS_DAYS} business days.`,
            "You comment directly on each piece in Work.",
          ].map((text, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-ds-subtle text-[12px] font-semibold">
                {i + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

const ACTIVITY_LIMIT = 4;

/**
 * The latest project events (system messages), newest first. Only what actually happened, as recorded in the DB:
 * no stage summaries, which describe agents that don't produce work today.
 * The step and first-draft date already sit in the header and the Next step card, so they're not repeated here.
 */
export async function ActivityCard({ projectId, title = "What's happening" }: { projectId: string; title?: string }) {
  const events = await prisma.comment.findMany({
    where: { projectId, kind: "SYSTEM", archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: ACTIVITY_LIMIT,
  });
  return (
    <Card aria-label={title}>
      <CardHeader title={title} />
      {events.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-3 px-6 pb-5 pt-4 text-[14px]">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ds-text-3" />
              <span className="min-w-0 flex-1 text-ds-text">{e.body}</span>
              <span className="shrink-0 text-[13px] text-ds-text-2">{shortDate(e.createdAt)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 px-6 pb-5 pt-4 text-[14px] text-ds-text-2">Updates from your team show up here as the work moves along.</p>
      )}
    </Card>
  );
}

/** review — the assets waiting on the client, as thumbnails that open each one in Work. */
export async function WaitingForReviewCard({ projectId, viewer }: Omit<PanelProps, "state">) {
  const assets = await loadReviewAssets(projectId, viewer.clientId, ["IN_REVIEW"]);
  if (assets.length === 0) return null;
  return (
    <Card aria-label="Waiting for your review">
      <CardHeader
        title="Waiting for your review"
        meta={<StatusPill tone="turn">{assets.length}</StatusPill>}
        action={
          <Link href={`/projects/${projectId}/work?filter=review`} className="text-[13px] font-medium text-ds-text no-underline hover:underline">
            Open in Work
          </Link>
        }
      />
      <ul className="m-0 grid list-none grid-cols-2 gap-4 p-6 sm:grid-cols-4">
        {assets.map((a) => (
          <li key={a.id}>
            <Link href={`/projects/${projectId}/work?asset=${a.id}`} className="group flex flex-col gap-1.5 no-underline">
              <span
                className="flex aspect-[4/3] items-center justify-center rounded-[8px] border border-ds-divider group-hover:border-ds-text-3"
                style={{ backgroundColor: `color-mix(in srgb, ${a.thumbnailColor} 16%, white)` }}
              >
                {a.type === "VIDEO" ? (
                  <Play className="size-5 text-ds-text/35" strokeWidth={1.5} />
                ) : (
                  <ImageIcon className="size-5 text-ds-text/35" strokeWidth={1.5} />
                )}
              </span>
              <span className="truncate text-[13px] font-medium text-ds-text">{a.name}</span>
              <span className="-mt-1 text-[12px] text-ds-text-2">{a.format}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** estimating / staffing / production. */
export async function WhatsHappeningCard({ projectId }: Pick<PanelProps, "projectId" | "state">) {
  return <ActivityCard projectId={projectId} />;
}

/** final + closed — what was delivered: the deliverables from the estimate, then every file with its own download. */
export async function DeliveryPackageCard({ projectId, viewer }: Omit<PanelProps, "state">) {
  const [assets, lineItems] = await Promise.all([
    loadReviewAssets(projectId, viewer.clientId, ["APPROVED", "DELIVERED"]),
    prisma.estimateLineItem.findMany({
      where: { estimate: { projectId } },
      include: { priceListItem: true },
      orderBy: { order: "asc" },
    }),
  ]);
  return (
    <Card aria-label="Delivery package">
      <CardHeader
        title="Delivery package"
        meta={<StatusPill>{assets.length} {assets.length === 1 ? "file" : "files"}</StatusPill>}
        action={
          assets.length > 0 ? (
            <Button asChild variant="secondary" size="md">
              <a href={`/api/projects/${projectId}/download`} download>
                <Download strokeWidth={1.75} />
                Download all (.zip)
              </a>
            </Button>
          ) : undefined
        }
      />
      {lineItems.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2.5 border-b border-ds-divider px-6 py-4">
          {lineItems.map((li) => (
            <li key={li.id} className="flex items-start gap-3 text-[14px]">
              <Check className="mt-0.5 size-4 shrink-0 text-ds-check" strokeWidth={2} />
              <span>
                <span className="font-medium text-ds-text">{lineName(li)}</span>
                {li.detail && <span className="text-ds-text-2"> · {li.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {assets.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 p-6 min-[480px]:grid-cols-2 sm:grid-cols-3">
          {assets.map((a) => (
            <div key={a.id} className="flex flex-col gap-2">
              <div
                className="flex aspect-[4/3] items-center justify-center rounded-[8px] border border-ds-divider"
                style={{ backgroundColor: `color-mix(in srgb, ${a.thumbnailColor} 16%, white)` }}
              >
                {a.type === "VIDEO" ? (
                  <Play className="size-6 text-ds-text/35" strokeWidth={1.5} />
                ) : (
                  <ImageIcon className="size-6 text-ds-text/35" strokeWidth={1.5} />
                )}
              </div>
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px] font-semibold text-ds-text">{a.name}</span>
                  <span className="text-[12px] text-ds-text-2">{a.format}</span>
                </div>
                <Button asChild variant="ghost" size="icon" aria-label={`Download ${a.name}`}>
                  <a href={`/api/assets/${a.id}/download`} download>
                    <Download strokeWidth={1.75} />
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Files arrive here with the final delivery" />
      )}
    </Card>
  );
}

function SignOffButton({ projectId }: { projectId: string }) {
  return (
    <form action={signOffProjectAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" variant="primary" size="lg">
        Sign off
      </Button>
    </form>
  );
}

/** final — sign-off on the Work tab (Overview carries it in the Next step card). Only rendered when it's the client's turn. */
export function SignOffCard({ projectId }: { projectId: string }) {
  return (
    <Card aria-label="Sign off">
      <div className="flex flex-col items-start gap-4 px-6 py-5 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="m-0 text-[15px] font-semibold text-ds-text">Sign off and close the project</h2>
          <p className="text-[14px] text-ds-text-2">Files move to your archive and you get a full project report.</p>
        </div>
        <SignOffButton projectId={projectId} />
      </div>
    </Card>
  );
}

export function RatingCard({ projectId }: { projectId: string }) {
  return (
    <Card aria-label="Rate this project">
      <CardHeader title="How did we do?" />
      <form action={rateProjectAction} className="flex flex-wrap items-center gap-4 px-6 pb-5 pt-4">
        <input type="hidden" name="projectId" value={projectId} />
        <RatingStars name="rating" />
        <label htmlFor="rating-feedback" className="sr-only">
          Comment for the team
        </label>
        <input
          id="rating-feedback"
          name="feedback"
          placeholder="Leave a comment for the team (optional)"
          className="h-10 min-w-48 flex-1 rounded-[8px] border border-ds-control-border bg-white px-3 text-[14px] outline-none placeholder:text-ds-text-3 focus:border-ds-text-3"
        />
        <Button type="submit" variant="secondary" size="lg">
          Rate this project
        </Button>
      </form>
    </Card>
  );
}
