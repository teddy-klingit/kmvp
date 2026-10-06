"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import type { ReviewItem, Thread } from "@/lib/review";
import { PinStage } from "@/components/review/pin-stage";
import { ApproveButton, ReviewFooter } from "@/components/review/review-footer";
import { ReviewShell, type ShellHeader } from "@/components/review/shell";
import { CommentPanel } from "@/components/review/comment-panel";
import { cn } from "@/lib/utils";

const approved = (s: string) => s === "APPROVED" || s === "DELIVERED";

/**
 * Presentation review (ReviewSlides.dc.html), also used for carousels and storyboards: a slide strip with status
 * (approved, "Changed", comment count), the slide with its pins, "What changed in this version" at the top of the
 * panel, "Approve this slide" with the deck's progress; the panel footer approves all slides.
 */
export function SlidesView({
  shell,
  projectId,
  items,
  threads,
  canReview,
  mode,
  focusId,
  base,
  changes,
  noun,
}: {
  shell: ShellHeader;
  projectId: string;
  items: ReviewItem[];
  threads: Thread[];
  canReview: boolean;
  mode: "slides" | "grid";
  focusId: string | null;
  base: string;
  changes: string[];
  /** "slide" or "frame". */
  noun: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const slides = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const current = slides.find((s) => s.id === focusId) ?? slides[0];
  const idx = slides.indexOf(current);
  const href = (q: Record<string, string>) => `${base}?${new URLSearchParams({ kind: "slides", ...q })}`;
  const done = slides.filter((s) => approved(s.status)).length;
  const open = slides.filter((s) => s.status === "IN_REVIEW");
  const count = (id: string) => threads.filter((t) => t.assetId === id && !t.resolved).length;
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  const main =
    mode === "grid" ? (
      <div className="grid grid-cols-1 gap-5 p-5 min-[700px]:grid-cols-2 min-[1200px]:grid-cols-3 min-[900px]:p-8">
        {slides.map((s, i) => (
          <Link key={s.id} href={href({ asset: s.id })} scroll={false} className="flex flex-col gap-2 no-underline">
            <span className="relative block overflow-hidden rounded-[10px] bg-white shadow-sm" style={{ aspectRatio: String(s.ratio) }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the access-checked file the client was sent */}
              {s.fileUrl && <img src={s.fileUrl} alt={s.name} loading="lazy" className="size-full object-cover" />}
            </span>
            <SlideLabel s={s} comments={count(s.id)} label={`${Noun} ${i + 1}`} />
          </Link>
        ))}
      </div>
    ) : (
      <div className="flex min-h-full">
        <nav aria-label={`${Noun}s`} className="hidden w-[230px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-brand-line bg-[#F7F3EA] p-4 min-[800px]:flex">
          {slides.map((s, i) => (
            <Link key={s.id} href={href({ asset: s.id })} scroll={false} aria-current={s.id === current.id ? "true" : undefined} className={cn("flex gap-2 rounded-[12px] p-2 no-underline", s.id === current.id ? "border-2 border-brand-ink bg-white" : "border-2 border-transparent hover:bg-white/60")}>
              <span className="w-4 pt-1 text-[12px] text-brand-mute">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="block overflow-hidden rounded-[6px] border border-brand-line bg-white" style={{ aspectRatio: String(s.ratio) }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the access-checked file the client was sent */}
                  {s.fileUrl && <img src={s.fileUrl} alt="" loading="lazy" className="size-full object-cover" />}
                </span>
                <SlideLabel s={s} comments={count(s.id)} label={`${Noun} ${i + 1}`} />
              </span>
            </Link>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-5 p-5 min-[900px]:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex-1 text-[15px] text-brand-ink-2">
              {Noun} {idx + 1} of {slides.length}
            </span>
            {current.changed && <span className="rounded-full bg-brand-lime-pale px-3 py-1 text-[13px]">Changed in version {current.version}</span>}
          </div>
          <div className="flex flex-1 items-start justify-center pb-24">
            <PinStage projectId={projectId} assetId={current.id} src={current.fileUrl} ratio={current.ratio} alt={current.name} threads={threads} activeId={active} onSelect={(t) => setActive(t.id)} canComment={canReview} maxHeight={560} maxWidth={860} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-[15px]">
              {done} of {slides.length} {noun}s approved
            </span>
            <span className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-brand-line">
              <span className="block h-full bg-brand-ink" style={{ width: `${(done / slides.length) * 100}%` }} />
            </span>
            {canReview && current.status === "IN_REVIEW" ? (
              <ApproveButton projectId={projectId} ids={[current.id]} label={`Approve this ${noun}`} />
            ) : (
              <span className="text-[14px] text-brand-ink-2">{approved(current.status) ? `This ${noun} is approved` : current.status === "CHANGES_REQUESTED" ? "Changes asked" : ""}</span>
            )}
          </div>
        </div>
      </div>
    );

  return (
    <ReviewShell
      {...shell}
      main={main}
      panel={
        <CommentPanel
          title={mode === "grid" ? "Comments" : `${Noun} ${idx + 1}`}
          threads={mode === "grid" ? threads : threads.filter((t) => t.assetId === current.id)}
          activeId={active}
          onSelect={(t) => setActive(t.id)}
          intro={
            changes.length > 0 ? (
              <div className="mx-3 mt-3 flex flex-col gap-2 rounded-[14px] bg-[#F7F3EA] px-4 py-3">
                <span className="text-[13px] text-brand-ink-2">What changed in this version</span>
                {changes.map((c) => (
                  <span key={c} className="flex gap-2 text-[15px]">
                    <Check className="mt-1 size-3.5 shrink-0 text-[#8D9E47]" strokeWidth={3} />
                    {c}
                  </span>
                ))}
              </div>
            ) : undefined
          }
          empty={mode === "grid" ? `No comments on these ${noun}s yet. Open one to pin a comment.` : `No comments on this ${noun} yet. Click it to pin one.`}
        />
      }
      footer={<ReviewFooter projectId={projectId} canReview={canReview} openIds={open.map((s) => s.id)} note={`You can approve ${noun} by ${noun}, or all of them at once.`} approveLabel={`Approve all ${open.length} ${noun}${open.length === 1 ? "" : "s"}`} />}
    />
  );
}

function SlideLabel({ s, comments, label }: { s: ReviewItem; comments: number; label: string }) {
  // Slides of one concept all share its name: they're told apart by their number.
  const own = s.name.replace(/,? (slide|frame) \d+$/i, "");
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[14px] text-brand-ink">{own && own !== s.concept ? own : label}</span>
        {approved(s.status) ? (
          <span aria-label="Approved" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#8D9E47]">
            <Check className="size-3 text-white" strokeWidth={3} />
          </span>
        ) : s.changed ? (
          <span className="shrink-0 rounded-full bg-brand-lime-pale px-2 py-0.5 text-[11px]">Changed</span>
        ) : null}
      </span>
      {comments > 0 && <span className="text-[12px] text-brand-mute">{comments} comment{comments === 1 ? "" : "s"}</span>}
    </span>
  );
}
