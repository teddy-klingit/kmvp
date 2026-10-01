import Link from "next/link";
import { Check, ImageIcon, Play } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { StatusPill } from "@/components/ds/status-pill";
import { NextStepCard } from "@/components/ds/next-step-card";
import { AskButton } from "@/components/ds/ask-button";
import { EmptyState } from "@/components/ds/empty-state";
import { RatingStars } from "@/components/portal/rating-stars";
import { approveEstimateAction, rateProjectAction, signOffProjectAction } from "@/lib/actions/project-actions";
import { resumeProjectAction } from "@/lib/actions/project-lifecycle-actions";
import { jsonArray } from "@/lib/utils";
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
export async function EstimateCard({ projectId, viewer }: Omit<PanelProps, "state">) {
  const estimate = await prisma.estimate.findFirst({
    where: { projectId, status: "SENT", project: { clientId: viewer.clientId } },
    include: { lineItems: { orderBy: { order: "asc" } } },
  });
  if (!estimate) return null;
  const inclusions = jsonArray<string>(estimate.inclusions);
  return (
    <Card aria-label="Estimate" className="overflow-hidden" id="estimate">
      <CardHeader
        title="Estimate"
        meta={<StatusPill>v1{estimate.expiresAt ? ` · valid until ${shortDate(estimate.expiresAt)}` : ""}</StatusPill>}
        action={<span className="text-[12px] text-ds-text-2">Priced from the Klingit price list</span>}
      />
      <EstimateTable lines={estimate.lineItems} total={estimate.totalCredits} />
      {inclusions.length > 0 && <Inclusions items={inclusions} />}
    </Card>
  );
}

export function EstimateTable({ lines, total }: { lines: { id: string; deliverable: string; detail: string | null; credits: number }[]; total: number }) {
  return (
    <div>
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="text-left text-[12px] text-ds-text-2">
            <th scope="col" className="px-6 py-2.5 font-medium">Deliverable</th>
            <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Details</th>
            <th scope="col" className="px-6 py-2.5 text-right font-medium">Credits</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((li) => (
            <tr key={li.id} id={`line-${li.id}`} className="border-t border-ds-divider">
              <td className="px-6 py-3.5 font-medium text-ds-text">
                {li.deliverable}
                {li.detail && <span className="mt-0.5 block font-normal text-ds-text-2 sm:hidden">{li.detail}</span>}
              </td>
              <td className="hidden px-3 py-3.5 text-ds-text-2 sm:table-cell">{li.detail}</td>
              <td className="px-6 py-3.5 text-right tabular-nums text-ds-text">{li.credits}</td>
            </tr>
          ))}
          <tr className="border-t border-ds-border bg-ds-subtle-2">
            <td className="px-6 py-3.5 font-semibold text-ds-text">Total</td>
            <td className="hidden sm:table-cell" />
            <td className="whitespace-nowrap px-6 py-3.5 text-right font-semibold tabular-nums text-ds-text">{total} credits</td>
          </tr>
        </tbody>
      </table>
    </div>
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
 * estimating / staffing / production — the latest project events, newest first.
 * The step and first-draft date already sit in the header and the Next step card, so they're not repeated here.
 */
export async function WhatsHappeningCard({ projectId }: Pick<PanelProps, "projectId" | "state">) {
  const [events, stages] = await Promise.all([
    prisma.comment.findMany({ where: { projectId, kind: "SYSTEM", archivedAt: null }, orderBy: { createdAt: "desc" }, take: ACTIVITY_LIMIT }),
    prisma.pipelineStage.findMany({
      where: { projectId, summary: { not: null }, OR: [{ status: "ACTIVE" }, { status: "COMPLETED" }] },
      orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
      take: ACTIVITY_LIMIT,
    }),
  ]);
  // System events are the record; older projects only have stage summaries.
  const activity = events.length
    ? events.map((e) => ({ id: e.id, text: e.body, at: e.createdAt }))
    : stages.map((s) => ({ id: s.id, text: s.summary!, at: s.completedAt ?? s.startedAt }));
  return (
    <Card aria-label="What's happening">
      <CardHeader title="What's happening" />
      {activity.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-3 px-6 pb-5 pt-4 text-[14px]">
          {activity.map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ds-text-3" />
              <span className="min-w-0 flex-1 text-ds-text">{a.text}</span>
              {a.at && <span className="shrink-0 text-[13px] text-ds-text-2">{shortDate(a.at)}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 px-6 pb-5 pt-4 text-[14px] text-ds-text-2">Updates from your team show up here as the work moves along.</p>
      )}
    </Card>
  );
}

/** final + closed — what was delivered. */
export async function DeliveryPackageCard({ projectId, viewer }: Omit<PanelProps, "state">) {
  const [assets, lineItems] = await Promise.all([
    prisma.asset.findMany({
      where: { projectId, clientId: viewer.clientId, status: { in: ["APPROVED", "DELIVERED"] } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.estimateLineItem.findMany({ where: { estimate: { projectId } }, orderBy: { order: "asc" } }),
  ]);
  return (
    <Card aria-label="Delivery package">
      <CardHeader title="Delivery package" meta={<StatusPill>{assets.length} {assets.length === 1 ? "file" : "files"}</StatusPill>} />
      {lineItems.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2.5 border-b border-ds-divider px-6 py-4">
          {lineItems.map((li) => (
            <li key={li.id} className="flex items-start gap-3 text-[14px]">
              <Check className="mt-0.5 size-4 shrink-0 text-ds-check" strokeWidth={2} />
              <span>
                <span className="font-medium text-ds-text">{li.deliverable}</span>
                {li.detail && <span className="text-ds-text-2"> · {li.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {assets.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-3">
          {assets.map((a) => (
            <div key={a.id} className="flex flex-col gap-1.5">
              <div
                className="relative flex aspect-[4/3] items-center justify-center rounded-[8px] border border-ds-divider"
                style={{ backgroundColor: `color-mix(in srgb, ${a.thumbnailColor} 16%, white)` }}
              >
                <StatusPill tone="success" className="absolute left-2 top-2">
                  {a.status === "DELIVERED" ? "Delivered" : "Approved"}
                </StatusPill>
                {a.type === "VIDEO" ? (
                  <Play className="size-6 text-ds-text/35" strokeWidth={1.5} />
                ) : (
                  <ImageIcon className="size-6 text-ds-text/35" strokeWidth={1.5} />
                )}
              </div>
              <span className="text-[14px] font-semibold text-ds-text">{a.name}</span>
              <span className="text-[12px] text-ds-text-2">{a.format}</span>
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
      <input type="hidden" name="rating" value={5} />
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
