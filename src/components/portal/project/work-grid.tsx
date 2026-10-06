"use client";

import { useTransition } from "react";
import { ImageIcon, MessageCircle, Play } from "lucide-react";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { useConversation } from "@/components/ds/conversation-context";
import type { ReviewAsset } from "@/components/portal/asset-review-viewer";
import { useRouter } from "next/navigation";
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
}: {
  assets: ReviewAsset[];
  projectId: string;
  canReview: boolean;
}) {
  // Opening an asset goes to the full-screen review (one review per format), at that asset.
  const router = useRouter();
  const openAsset = (id: string) => router.push(`/review/${projectId}?asset=${id}`);
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
          {assets.map((a) => {
            // Before delivery to the client, IN_REVIEW means Klingit's internal QA — not the client's turn.
            const status = a.status === "IN_REVIEW" && !canReview ? IN_QA : (STATUS[a.status] ?? STATUS.IN_REVIEW);
            const actionable = canReview && a.status === "IN_REVIEW";
            return (
              <article key={a.id} className="flex flex-col overflow-hidden rounded-[12px] border border-ds-border bg-ds-card shadow-ds">
                <button
                  type="button"
                  onClick={() => openAsset(a.id)}
                  aria-label={`Open ${a.name}`}
                  className="relative flex aspect-[4/3] items-center justify-center border-b border-ds-divider"
                  style={{ backgroundColor: `color-mix(in srgb, ${a.thumbnailColor} 16%, white)` }}
                >
                  {a.fileUrl && a.type === "IMAGE" && (
                    // eslint-disable-next-line @next/next/no-img-element -- the access-checked file the client was sent
                    <img src={a.fileUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-contain p-3" />
                  )}
                  {a.copy && (
                    <span className="absolute inset-0 flex flex-col justify-center gap-1.5 px-5 pt-8 text-left">
                      {a.copy.lines.map((l) => (
                        <span key={l.lang} className="line-clamp-2 text-[13px] leading-[1.4] text-ds-text">
                          <span className="mr-1.5 font-semibold uppercase text-ds-text-2">{l.lang}</span>
                          {l.text}
                        </span>
                      ))}
                      {a.copy.suggestion && <span className="text-[12px] text-ds-text-2">Suggestion: {a.copy.suggestion}</span>}
                    </span>
                  )}
                  <StatusPill tone={status.tone} className="absolute left-3 top-3 z-10">
                    {status.label}
                  </StatusPill>
                  {a.fileUrl || a.copy ? null : a.type === "VIDEO" ? (
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
                    <Button size="sm" variant="ghost" onClick={() => openAsset(a.id)}>
                      Open
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
