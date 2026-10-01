"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, X, MessageSquarePlus, Play, Pause } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  postPinCommentAction,
  postTimestampCommentAction,
  requestAssetChangesAction,
} from "@/lib/actions/project-actions";
import { formatDate, cn } from "@/lib/utils";

const ASSET_STATUS_LABEL: Record<string, string> = {
  APPROVED: "Approved",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes asked",
  DELIVERED: "Delivered",
  ARCHIVED: "Archived",
};

export type PinComment = {
  id: string;
  body: string;
  xPercent: number | null;
  yPercent: number | null;
  widthPercent: number | null;
  heightPercent: number | null;
  timestampSeconds: number | null;
  createdAt: string;
  authorName: string;
};

export type ReviewAsset = {
  id: string;
  name: string;
  format: string;
  thumbnailColor: string;
  status: string;
  type: string;
  durationSeconds: number | null;
  comments: PinComment[];
};

/** `canReview` comes from getProjectState: review actions only render while the client has assets to review. */
export function AssetReviewGrid({
  assets,
  projectId,
  canReview,
}: {
  assets: ReviewAsset[];
  projectId: string;
  canReview: boolean;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {assets.map((asset, i) => {
          const commentCount = asset.comments.length;
          const isVideo = asset.type === "VIDEO";
          return (
            <div key={asset.id} className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                className="flex flex-col gap-2 text-left"
              >
                <div
                  className="relative flex aspect-square items-end rounded-xl p-2 transition-colors hover:border-ink/30 border border-transparent"
                  style={{ backgroundColor: asset.thumbnailColor }}
                >
                  {isVideo && (
                    <span className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white">
                      <Play className="size-4 fill-white" />
                    </span>
                  )}
                  <span className="rounded-full bg-black/40 px-2 py-0.5 text-xs font-medium text-white">
                    {asset.format}
                  </span>
                  <span className="absolute right-2 top-2 flex items-center gap-1.5">
                    {commentCount > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-xs font-medium text-white">
                        <MessageSquarePlus className="size-3" />
                        {commentCount}
                      </span>
                    )}
                    <StatusBadge status={ASSET_STATUS_LABEL[asset.status]} />
                  </span>
                </div>
              </button>
              {canReview && asset.status === "IN_REVIEW" && (
                <form action={requestAssetChangesAction}>
                  <input type="hidden" name="assetId" value={asset.id} />
                  <Button type="submit" size="sm" variant="outline" className="w-full">
                    Request changes
                  </Button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <AssetViewerDialog assets={assets} projectId={projectId} openIndex={openIndex} onOpenIndexChange={setOpenIndex} />
    </>
  );
}

/** The full-size viewer (pin / region / timestamp comments), opened on one asset of a list. */
export function AssetViewerDialog({
  assets,
  projectId,
  openIndex,
  onOpenIndexChange,
}: {
  assets: ReviewAsset[];
  projectId: string;
  openIndex: number | null;
  onOpenIndexChange: (index: number | null) => void;
}) {
  const step = (delta: number) =>
    onOpenIndexChange(openIndex !== null ? (openIndex + delta + assets.length) % assets.length : openIndex);
  const current = openIndex !== null ? assets[openIndex] : null;
  return (
    <Dialog open={current !== null} onOpenChange={(v) => !v && onOpenIndexChange(null)}>
      <DialogContent className="max-w-4xl p-0">
        {current &&
          openIndex !== null &&
          (current.type === "VIDEO" ? (
            <VideoViewer
              asset={current}
              projectId={projectId}
              index={openIndex}
              total={assets.length}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onClose={() => onOpenIndexChange(null)}
            />
          ) : (
            <AssetViewer
              asset={current}
              projectId={projectId}
              index={openIndex}
              total={assets.length}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onClose={() => onOpenIndexChange(null)}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}

type ViewerProps = {
  asset: ReviewAsset;
  projectId: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
};

type DrawnPin = { x: number; y: number; width?: number; height?: number };

const DRAG_THRESHOLD_PCT = 1.5;

function AssetViewer({ asset, projectId, index, total, onPrev, onNext, onClose }: ViewerProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [pendingPin, setPendingPin] = useState<DrawnPin | null>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pins = asset.comments.filter((c) => c.xPercent !== null && c.yPercent !== null);
  const generalComments = asset.comments.filter((c) => c.xPercent === null);

  function pctFromEvent(e: { clientX: number; clientY: number }) {
    const rect = previewRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!previewRef.current) return;
    setActivePinId(null);
    setPendingPin(null);
    setDragStart(pctFromEvent(e));
    setDragCurrent(pctFromEvent(e));
  }

  useEffect(() => {
    if (!dragStart) return;
    function handleMove(e: MouseEvent) {
      if (!previewRef.current) return;
      const rect = previewRef.current.getBoundingClientRect();
      setDragCurrent({
        x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
        y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
      });
    }
    function handleUp(e: MouseEvent) {
      if (!previewRef.current || !dragStart) return;
      const rect = previewRef.current.getBoundingClientRect();
      const end = {
        x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
        y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
      };
      const width = Math.abs(end.x - dragStart.x);
      const height = Math.abs(end.y - dragStart.y);
      if (width < DRAG_THRESHOLD_PCT && height < DRAG_THRESHOLD_PCT) {
        setPendingPin({ x: dragStart.x, y: dragStart.y });
      } else {
        setPendingPin({
          x: Math.min(dragStart.x, end.x),
          y: Math.min(dragStart.y, end.y),
          width,
          height,
        });
      }
      setDragStart(null);
      setDragCurrent(null);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragStart]);

  function submitPin(formData: FormData) {
    startTransition(async () => {
      await postPinCommentAction({}, formData);
      setPendingPin(null);
    });
  }

  const liveDrag =
    dragStart && dragCurrent
      ? {
          x: Math.min(dragStart.x, dragCurrent.x),
          y: Math.min(dragStart.y, dragCurrent.y),
          width: Math.abs(dragCurrent.x - dragStart.x),
          height: Math.abs(dragCurrent.y - dragStart.y),
        }
      : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem]">
      <div className="relative flex flex-col bg-muted/30">
        <ViewerHeader asset={asset} onClose={onClose} hint="Click to comment, or click and drag to mark an area" />

        <div className="relative flex flex-1 items-center justify-center p-8">
          <div
            ref={previewRef}
            onMouseDown={handleMouseDown}
            className="relative aspect-square w-full max-w-md cursor-crosshair select-none overflow-hidden rounded-xl"
            style={{ backgroundColor: asset.thumbnailColor }}
          >
            <span className="absolute bottom-3 left-3 rounded-full bg-black/40 px-2 py-0.5 text-xs font-medium text-white">
              {asset.format}
            </span>

            {pins.map((pin, i) => {
              const isRegion = pin.widthPercent !== null && pin.heightPercent !== null;
              return (
                <div key={pin.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingPin(null);
                      setActivePinId(activePinId === pin.id ? null : pin.id);
                    }}
                    className={cn(
                      "absolute",
                      isRegion
                        ? "rounded-sm border-2 border-dashed hover:border-solid"
                        : "flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-md transition-transform hover:scale-110"
                    )}
                    style={
                      isRegion
                        ? {
                            left: `${pin.xPercent}%`,
                            top: `${pin.yPercent}%`,
                            width: `${pin.widthPercent}%`,
                            height: `${pin.heightPercent}%`,
                            borderColor: activePinId === pin.id ? "var(--accent)" : "var(--primary)",
                          }
                        : { left: `${pin.xPercent}%`, top: `${pin.yPercent}%` }
                    }
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-md",
                        isRegion && "absolute -left-2.5 -top-2.5",
                        activePinId === pin.id ? "bg-accent" : "bg-primary"
                      )}
                    >
                      {i + 1}
                    </span>
                  </button>
                  {activePinId === pin.id && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute z-10 w-56 -translate-x-1/2 rounded-lg border border-border bg-card p-3 text-left shadow-lg"
                      style={{
                        left: `${(pin.xPercent ?? 0) + (isRegion ? (pin.widthPercent ?? 0) / 2 : 0)}%`,
                        top: `calc(${(pin.yPercent ?? 0) + (isRegion ? (pin.heightPercent ?? 0) : 0)}% + 12px)`,
                      }}
                    >
                      <p className="text-xs font-semibold">{pin.authorName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{pin.body}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatDate(new Date(pin.createdAt), { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}

            {liveDrag && (
              <div
                className="pointer-events-none absolute rounded-sm border-2 border-dashed border-primary bg-primary/10"
                style={{
                  left: `${liveDrag.x}%`,
                  top: `${liveDrag.y}%`,
                  width: `${liveDrag.width}%`,
                  height: `${liveDrag.height}%`,
                }}
              />
            )}

            {pendingPin && (
              <PendingPinComposer
                pin={pendingPin}
                nextNumber={pins.length + 1}
                pending={pending}
                onCancel={() => setPendingPin(null)}
                action={submitPin}
                hidden={{ projectId, assetId: asset.id }}
              />
            )}
          </div>

          <ViewerNav total={total} index={index} onPrev={onPrev} onNext={onNext} />
        </div>
      </div>

      <CommentSidebar pins={pins} generalComments={generalComments} activePinId={activePinId} setActivePinId={setActivePinId} totalCount={asset.comments.length} />
    </div>
  );
}

function PendingPinComposer({
  pin,
  nextNumber,
  pending,
  onCancel,
  action,
  hidden,
}: {
  pin: DrawnPin;
  nextNumber: number;
  pending: boolean;
  onCancel: () => void;
  action: (formData: FormData) => void;
  hidden: Record<string, string>;
}) {
  const isRegion = pin.width !== undefined && pin.height !== undefined;
  return (
    <>
      {isRegion ? (
        <div
          className="absolute rounded-sm border-2 border-dashed border-accent bg-accent/10"
          style={{ left: `${pin.x}%`, top: `${pin.y}%`, width: `${pin.width}%`, height: `${pin.height}%` }}
        >
          <span className="absolute -left-2.5 -top-2.5 flex size-6 items-center justify-center rounded-full border-2 border-white bg-accent text-[11px] font-bold text-ink shadow-md">
            {nextNumber}
          </span>
        </div>
      ) : (
        <span
          className="absolute z-10 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-accent text-[11px] font-bold text-ink shadow-md"
          style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
        >
          {nextNumber}
        </span>
      )}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute z-10 w-56 -translate-x-1/2 rounded-lg border border-border bg-card p-3 shadow-lg"
        style={{
          left: `${pin.x + (isRegion ? (pin.width ?? 0) / 2 : 0)}%`,
          top: `calc(${pin.y + (isRegion ? pin.height ?? 0 : 0)}% + 12px)`,
        }}
      >
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="projectId" value={hidden.projectId} />
          <input type="hidden" name="assetId" value={hidden.assetId} />
          <input type="hidden" name="xPercent" value={pin.x} />
          <input type="hidden" name="yPercent" value={pin.y} />
          {isRegion && (
            <>
              <input type="hidden" name="widthPercent" value={pin.width} />
              <input type="hidden" name="heightPercent" value={pin.height} />
            </>
          )}
          <textarea
            name="body"
            autoFocus
            required
            disabled={pending}
            placeholder={isRegion ? "Leave a comment on this area…" : "Leave a comment here…"}
            className="min-h-16 w-full resize-none rounded-md border border-border bg-background p-2 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="secondary" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Posting…" : "Comment"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

function ViewerHeader({ asset, onClose, hint }: { asset: ReviewAsset; onClose: () => void; hint: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div>
        <p className="text-sm font-semibold">{asset.name}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
        <X className="size-4" />
      </button>
    </div>
  );
}

function ViewerNav({ total, index, onPrev, onNext }: { total: number; index: number; onPrev: () => void; onNext: () => void }) {
  if (total <= 1) return null;
  return (
    <>
      <button onClick={onPrev} className="absolute left-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 shadow hover:bg-card">
        <ChevronLeft className="size-4" />
      </button>
      <button onClick={onNext} className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 shadow hover:bg-card">
        <ChevronRight className="size-4" />
      </button>
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white">
        {index + 1} / {total}
      </span>
    </>
  );
}

function CommentSidebar({
  pins,
  generalComments,
  activePinId,
  setActivePinId,
  totalCount,
}: {
  pins: PinComment[];
  generalComments: PinComment[];
  activePinId: string | null;
  setActivePinId: (id: string | null) => void;
  totalCount: number;
}) {
  return (
    <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto border-t border-border p-4 lg:max-h-none lg:border-l lg:border-t-0">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">Comments</p>
        <Badge tone="neutral">{totalCount}</Badge>
      </div>
      {totalCount === 0 && <p className="text-xs text-muted-foreground">No comments yet — click the asset to leave one.</p>}
      {pins.map((pin, i) => (
        <button
          key={pin.id}
          onClick={() => setActivePinId(activePinId === pin.id ? null : pin.id)}
          className={cn(
            "flex items-start gap-2 rounded-lg p-2 text-left transition-colors hover:bg-muted",
            activePinId === pin.id && "bg-muted"
          )}
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold">{pin.authorName}</p>
            <p className="text-xs text-muted-foreground">{pin.body}</p>
          </div>
        </button>
      ))}
      {generalComments.map((c) => (
        <div key={c.id} className="flex items-start gap-2 p-2">
          <PersonAvatar name={c.authorName} size="sm" />
          <div className="min-w-0">
            <p className="text-xs font-semibold">{c.authorName}</p>
            <p className="text-xs text-muted-foreground">{c.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function VideoViewer({ asset, projectId, index, total, onPrev, onNext, onClose }: ViewerProps) {
  const duration = asset.durationSeconds ?? 30;
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrubberRef = useRef<HTMLDivElement>(null);

  const timeComments = [...asset.comments]
    .filter((c) => c.timestampSeconds !== null)
    .sort((a, b) => (a.timestampSeconds ?? 0) - (b.timestampSeconds ?? 0));

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCurrentTime((t) => {
        if (t >= duration) {
          setPlaying(false);
          return duration;
        }
        return t + 0.25;
      });
    }, 250);
    return () => clearInterval(id);
  }, [playing, duration]);

  function seekFromEvent(e: React.MouseEvent<HTMLDivElement>) {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setCurrentTime(pct * duration);
    setActiveCommentId(null);
  }

  function submitComment(formData: FormData) {
    startTransition(async () => {
      await postTimestampCommentAction({}, formData);
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem]">
      <div className="relative flex flex-col bg-muted/30">
        <ViewerHeader asset={asset} onClose={onClose} hint="Scrub to a moment and leave feedback there" />

        <div className="relative flex flex-1 items-center justify-center p-8">
          <div className="relative flex aspect-[9/16] max-h-96 w-auto flex-col overflow-hidden rounded-xl" style={{ backgroundColor: asset.thumbnailColor }}>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="flex flex-1 items-center justify-center"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-black/40 text-white">
                {playing ? <Pause className="size-6 fill-white" /> : <Play className="size-6 fill-white" />}
              </span>
            </button>
            <span className="absolute bottom-3 left-3 rounded-full bg-black/40 px-2 py-0.5 text-xs font-medium text-white">
              {asset.format}
            </span>
          </div>
          <ViewerNav total={total} index={index} onPrev={onPrev} onNext={onNext} />
        </div>

        <div className="flex flex-col gap-2 border-t border-border p-4">
          <div
            ref={scrubberRef}
            onClick={seekFromEvent}
            className="relative h-2 w-full cursor-pointer rounded-full bg-eggshell"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
            <div
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            />
            {timeComments.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentTime(c.timestampSeconds ?? 0);
                  setActiveCommentId(activeCommentId === c.id ? null : c.id);
                }}
                className={cn(
                  "absolute top-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[8px] font-bold text-white shadow",
                  activeCommentId === c.id ? "bg-accent" : "bg-warning"
                )}
                style={{ left: `${((c.timestampSeconds ?? 0) / duration) * 100}%` }}
                title={c.body}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <span>{timeComments.length} moment{timeComments.length === 1 ? "" : "s"} flagged</span>
          </div>

          <form action={submitComment} className="flex gap-2 pt-1">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="assetId" value={asset.id} />
            <input type="hidden" name="timestampSeconds" value={currentTime} />
            <span className="flex shrink-0 items-center rounded-md bg-muted px-2 text-xs font-medium text-muted-foreground">
              {formatTime(currentTime)}
            </span>
            <input
              name="body"
              required
              disabled={pending}
              placeholder="Leave feedback at this moment…"
              className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Posting…" : "Comment"}
            </Button>
          </form>
        </div>
      </div>

      <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto border-t border-border p-4 lg:max-h-none lg:border-l lg:border-t-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Comments</p>
          <Badge tone="neutral">{timeComments.length}</Badge>
        </div>
        {timeComments.length === 0 && (
          <p className="text-xs text-muted-foreground">No comments yet — scrub to a moment and leave one.</p>
        )}
        {timeComments.map((c, i) => (
          <button
            key={c.id}
            onClick={() => {
              setCurrentTime(c.timestampSeconds ?? 0);
              setActiveCommentId(activeCommentId === c.id ? null : c.id);
            }}
            className={cn(
              "flex items-start gap-2 rounded-lg p-2 text-left transition-colors hover:bg-muted",
              activeCommentId === c.id && "bg-muted"
            )}
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-ink">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold">
                {c.authorName} <span className="font-normal text-muted-foreground">· {formatTime(c.timestampSeconds ?? 0)}</span>
              </p>
              <p className="text-xs text-muted-foreground">{c.body}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
