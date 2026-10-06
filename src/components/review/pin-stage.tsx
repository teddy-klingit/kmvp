"use client";

import { useActionState, useRef, useState } from "react";
import type { Thread } from "@/lib/review";
import { postPinCommentAction } from "@/lib/actions/project-actions";
import { cn } from "@/lib/utils";

type Pending = { x: number; y: number; w: number | null; h: number | null };

/**
 * The work at full size with its pins: click to pin a comment, drag to mark an area. Orange pins are the
 * client's, ink pins Klingit's; the active thread's pin is ringed.
 */
export function PinStage({
  projectId,
  assetId,
  src,
  ratio,
  alt,
  threads,
  activeId,
  onSelect,
  canComment,
  maxHeight = 640,
  maxWidth = 900,
  children,
}: {
  projectId: string;
  assetId: string;
  src: string | null;
  ratio: number;
  alt: string;
  threads: Thread[];
  activeId?: string | null;
  onSelect?: (t: Thread) => void;
  canComment: boolean;
  maxHeight?: number;
  maxWidth?: number;
  /** Overlays drawn over the work (e.g. safe zones). */
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [, action, saving] = useActionState(async (prev: Record<string, never>, fd: FormData) => {
    const r = await postPinCommentAction(prev, fd);
    setPending(null);
    return r;
  }, {});
  const pins = threads.filter((t) => t.pin && t.assetId === assetId);
  const pos = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)), y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)) };
  };
  const width = Math.min(maxWidth, maxHeight * ratio);

  return (
    <div className="relative mx-auto" style={{ width, maxWidth: "100%" }}>
      <div
        ref={ref}
        className={cn("relative w-full select-none overflow-hidden rounded-[12px] bg-white shadow-sm", canComment && "cursor-crosshair")}
        style={{ aspectRatio: String(ratio) }}
        onMouseDown={(e) => canComment && !pending && setDrag(pos(e))}
        onMouseUp={(e) => {
          if (!drag) return;
          const p = pos(e);
          const w = Math.abs(p.x - drag.x);
          const h = Math.abs(p.y - drag.y);
          setPending(w > 3 && h > 3 ? { x: Math.min(p.x, drag.x), y: Math.min(p.y, drag.y), w, h } : { x: p.x, y: p.y, w: null, h: null });
          setDrag(null);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the access-checked file the client was sent */}
        {src && <img src={src} alt={alt} draggable={false} className="pointer-events-none absolute inset-0 size-full object-cover" />}
        {children}
        {pins.map((t) =>
          t.pin!.w != null && t.pin!.h != null ? (
            <button
              key={t.id}
              type="button"
              aria-label={`Comment ${t.number}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(t);
              }}
              className={cn("absolute rounded-[4px] border-2", t.messages[0]?.fromClient ? "border-brand-orange bg-brand-orange/10" : "border-brand-ink bg-brand-ink/10", t.id === activeId && "ring-2 ring-white")}
              style={{ left: `${t.pin!.x}%`, top: `${t.pin!.y}%`, width: `${t.pin!.w}%`, height: `${t.pin!.h}%` }}
            >
              <PinBadge thread={t} className="absolute -right-3 -top-3" active={t.id === activeId} />
            </button>
          ) : (
            <button
              key={t.id}
              type="button"
              aria-label={`Comment ${t.number}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(t);
              }}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: `${t.pin!.x}%`, top: `${t.pin!.y}%` }}
            >
              <PinBadge thread={t} active={t.id === activeId} />
            </button>
          )
        )}
        {pending && (
          <span
            aria-hidden
            className={cn("absolute border-2 border-dashed border-brand-orange", pending.w == null && "size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-orange")}
            style={{ left: `${pending.x}%`, top: `${pending.y}%`, ...(pending.w != null ? { width: `${pending.w}%`, height: `${pending.h}%` } : {}) }}
          />
        )}
      </div>
      {pending && (
        <form action={action} className="absolute inset-x-0 -bottom-2 z-20 mx-auto flex w-[min(440px,95%)] translate-y-full flex-col gap-2 rounded-[14px] border border-brand-line bg-white p-3 shadow-lg">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="xPercent" value={pending.x} />
          <input type="hidden" name="yPercent" value={pending.y} />
          {pending.w != null && <input type="hidden" name="widthPercent" value={pending.w} />}
          {pending.h != null && <input type="hidden" name="heightPercent" value={pending.h} />}
          <textarea name="body" required rows={2} autoFocus placeholder={pending.w != null ? "What should change in this area?" : "What should change here?"} className="w-full resize-none rounded-[10px] border border-brand-outline px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
          <span className="flex items-center gap-2">
            <button type="submit" disabled={saving} className="rounded-full bg-brand-ink px-4 py-1.5 text-[13px] text-white">
              {saving ? "Saving…" : "Comment"}
            </button>
            <button type="button" onClick={() => setPending(null)} className="text-[13px] text-brand-ink-2 underline underline-offset-2">
              Cancel
            </button>
          </span>
        </form>
      )}
    </div>
  );
}

export function PinBadge({ thread, className, active }: { thread: Thread; className?: string; active?: boolean }) {
  return (
    <span className={cn("flex size-7 items-center justify-center rounded-[10px_10px_10px_2px] border-2 border-white text-[12px] font-semibold text-white shadow-md", thread.messages[0]?.fromClient ? "bg-brand-orange" : "bg-brand-ink", active && "scale-110", className)}>
      {thread.number}
    </span>
  );
}
