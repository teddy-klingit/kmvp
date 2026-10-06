"use client";

import { useActionState, useState } from "react";
import { approveReviewItemsAction, requestReviewChangesAction, type ReviewState } from "@/lib/actions/review-actions";
import { pillClass } from "@/components/ds/button";
import { cn } from "@/lib/utils";

/** The panel footer: one line of help, Request changes (with a note) and the one orange Approve. */
export function ReviewFooter({
  projectId,
  note,
  canReview,
  openIds,
  approveLabel,
  doneLabel = "Everything here is approved",
}: {
  projectId: string;
  note: string;
  canReview: boolean;
  /** What's still in review here: Approve approves these, Request changes marks them. */
  openIds: string[];
  approveLabel: string;
  doneLabel?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [state, ask, pending] = useActionState<ReviewState, FormData>(requestReviewChangesAction, {});
  if (!canReview || openIds.length === 0) {
    return <span className="text-[14px] text-brand-ink-2">{openIds.length === 0 ? doneLabel : "This work isn't waiting for your review right now."}</span>;
  }
  return (
    <>
      <span className="text-[13px] leading-[1.5] text-brand-mute">{note}</span>
      {asking && (
        <form action={ask} className="flex flex-col gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="assetIds" value={openIds.join(",")} />
          <textarea name="note" required minLength={3} rows={3} autoFocus placeholder="What should change? Pins on the work help Klingit find it." className="w-full resize-none rounded-[10px] border border-brand-outline px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
          {state.error && <span className="text-[12px] text-ds-danger-text">{state.error}</span>}
          <span className="flex gap-2">
            <button type="submit" disabled={pending} className={pillClass("primary", "sm")}>
              {pending ? "Sending…" : "Send to Klingit"}
            </button>
            <button type="button" onClick={() => setAsking(false)} className="text-[13px] text-brand-ink-2 underline underline-offset-2">
              Cancel
            </button>
          </span>
        </form>
      )}
      {state.ok && <span className="text-[13px] text-brand-ink-2">{state.ok}</span>}
      {!asking && (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
          <button type="button" onClick={() => setAsking(true)} className={pillClass("secondary")}>
            Request changes
          </button>
          <form action={approveReviewItemsAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="assetIds" value={openIds.join(",")} />
            <button type="submit" className={cn(pillClass("primary"), "w-full bg-brand-orange text-brand-ink hover:bg-brand-orange hover:brightness-95")}>
              {approveLabel}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/** A small approve button for one item or one concept. */
export function ApproveButton({ projectId, ids, label, variant = "primary" }: { projectId: string; ids: string[]; label: string; variant?: "primary" | "secondary" }) {
  return (
    <form action={approveReviewItemsAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="assetIds" value={ids.join(",")} />
      <button type="submit" className={pillClass(variant)}>
        {label}
      </button>
    </form>
  );
}
