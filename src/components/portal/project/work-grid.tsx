"use client";

import { useState, useTransition } from "react";
import { ImageIcon, MessageCircle, Play } from "lucide-react";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { useConversation } from "@/components/ds/conversation-context";
import { AssetViewerDialog, type ReviewAsset } from "@/components/portal/asset-review-viewer";
import { approveAssetAction, requestAssetChangesAction } from "@/lib/actions/project-actions";

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  IN_REVIEW: { label: "Needs your review", tone: "turn" },
  CHANGES_REQUESTED: { label: "Changes asked", tone: "changes" },
  APPROVED: { label: "Approved", tone: "success" },
  DELIVERED: { label: "Delivered", tone: "success" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};
const IN_QA = { label: "With Klingit", tone: "neutral" as PillTone };

/** Uniform 3-column asset cards: 4:3 thumbnail with the status pill, title + format below, actions in the footer. */
export function WorkGrid({
  assets,
  projectId,
  canReview,
  openAssetId,
}: {
  assets: ReviewAsset[];
  projectId: string;
  canReview: boolean;
  openAssetId?: string;
}) {
  const indexOf = (id?: string) => {
    const i = id ? assets.findIndex((a) => a.id === id) : -1;
    return i >= 0 ? i : null;
  };
  const [openIndex, setOpenIndex] = useState<number | null>(() => indexOf(openAssetId));
  // A context chip in the conversation links to ?asset=…; open that asset when the link changes.
  const [linkedAsset, setLinkedAsset] = useState(openAssetId);
  if (openAssetId !== linkedAsset) {
    setLinkedAsset(openAssetId);
    if (indexOf(openAssetId) !== null) setOpenIndex(indexOf(openAssetId));
  }
  const [, startTransition] = useTransition();
  const { open } = useConversation();

  const submit = (action: (fd: FormData) => Promise<void>, assetId: string) => {
    const fd = new FormData();
    fd.set("assetId", assetId);
    startTransition(() => action(fd));
  };

  return (
    <>
      {/* Column count follows the content column, not the viewport: the docked panel takes 380px of it. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-5 @[520px]:grid-cols-2 @[880px]:grid-cols-3">
          {assets.map((a, i) => {
            // Before delivery to the client, IN_REVIEW means Klingit's internal QA — not the client's turn.
            const status = a.status === "IN_REVIEW" && !canReview ? IN_QA : (STATUS[a.status] ?? STATUS.IN_REVIEW);
            const actionable = canReview && a.status === "IN_REVIEW";
            return (
              <article key={a.id} className="flex flex-col overflow-hidden rounded-[12px] border border-ds-border bg-ds-card shadow-ds">
                <button
                  type="button"
                  onClick={() => setOpenIndex(i)}
                  aria-label={`Open ${a.name}`}
                  className="relative flex aspect-[4/3] items-center justify-center border-b border-ds-divider"
                  style={{ backgroundColor: `color-mix(in srgb, ${a.thumbnailColor} 16%, white)` }}
                >
                  <StatusPill tone={status.tone} className="absolute left-3 top-3">
                    {status.label}
                  </StatusPill>
                  {a.type === "VIDEO" ? (
                    <Play className="size-7 text-ds-text/35" strokeWidth={1.5} />
                  ) : (
                    <ImageIcon className="size-7 text-ds-text/35" strokeWidth={1.5} />
                  )}
                </button>
                <div className="flex flex-col gap-0.5 px-4 pb-1 pt-3.5">
                  <span className="text-[14px] font-semibold text-ds-text">{a.name}</span>
                  <span className="text-[12px] text-ds-text-2">{a.format}</span>
                </div>
                <div className="flex items-center gap-2 px-4 pb-4 pt-2.5">
                  <span className="inline-flex flex-1 items-center gap-1 text-[12px] text-ds-text-2">
                    <MessageCircle className="size-3.5" strokeWidth={1.75} />
                    {a.comments.length}
                  </span>
                  {actionable ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          submit(requestAssetChangesAction, a.id);
                          open({ channel: "klingit", context: { kind: "asset", ref: a.id, label: `On ${a.name}` } });
                        }}
                      >
                        Request changes
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => submit(approveAssetAction, a.id)}>
                        Approve
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setOpenIndex(i)}>
                      Open
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <AssetViewerDialog assets={assets} projectId={projectId} openIndex={openIndex} onOpenIndexChange={setOpenIndex} />
    </>
  );
}
