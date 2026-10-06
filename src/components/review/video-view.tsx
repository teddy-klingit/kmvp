"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { ReviewItem, Thread } from "@/lib/review";
import { postTimestampCommentAction } from "@/lib/actions/project-actions";
import { ReviewFooter } from "@/components/review/review-footer";
import { ReviewShell, type ShellHeader } from "@/components/review/shell";
import { CommentPanel, timecode } from "@/components/review/comment-panel";
import { cn } from "@/lib/utils";

const SPEEDS = [0.5, 1, 2];

/** Is this thread "on screen" at t: inside its range, or close to its moment. */
const onScreen = (th: Thread, t: number) => th.timestamp != null && (th.timestampEnd != null ? t >= th.timestamp - 0.05 && t <= th.timestampEnd : Math.abs(th.timestamp - t) < 1.2);
const badge = (th: Thread) => (th.messages[0]?.fromClient ? "bg-brand-orange" : "bg-brand-ink");

/**
 * Video review (ReviewVideo.dc.html): the player with sound and a safe-zone overlay, a timeline with the thumbnail
 * strip, comment markers and ranges, frame steps and speed 0.5 / 1 / 2×. Clicking the video pauses it and pins a
 * comment to that spot and moment (optionally a range); clicking a marker or a comment seeks to it. Switching
 * 9:16 ↔ 1:1 keeps the playhead. A demo video without a file plays as a timed placeholder.
 */
export function VideoView({ shell, projectId, items, threads, canReview, focusId, base }: { shell: ShellHeader; projectId: string; items: ReviewItem[]; threads: Thread[]; canReview: boolean; focusId: string | null; base: string }) {
  const item = items.find((i) => i.id === focusId) ?? items[0];
  const duration = item.durationSeconds ?? 15;
  const fps = item.video?.fps ?? null;
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [safe, setSafe] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [range, setRange] = useState(false);
  const real = item.hasFile && item.isVideo;
  const tall = item.ratio < 0.8;
  const [, action, saving] = useActionState(async (prev: Record<string, never>, fd: FormData) => {
    const r = await postTimestampCommentAction(prev, fd);
    setDraft(null);
    setRange(false);
    return r;
  }, {});

  // The playhead: read from the video every frame while it plays (timeupdate is only ~4 a second), or a clock for
  // the placeholder.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      if (real) {
        if (video.current) setT(video.current.currentTime);
      } else {
        setT((x) => {
          const next = x + ((now - last) / 1000) * speed;
          if (next >= duration) {
            setPlaying(false);
            return duration;
          }
          return next;
        });
      }
      last = now;
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [real, playing, speed, duration]);

  const seek = (s: number) => {
    const x = Math.max(0, Math.min(duration, s));
    setT(x);
    if (video.current) video.current.currentTime = x;
  };
  const pause = () => {
    video.current?.pause();
    setPlaying(false);
  };
  const toggle = () => {
    if (playing) return pause();
    setDraft(null);
    if (real && video.current) {
      if (t >= duration - 0.05) seek(0);
      void video.current.play();
    } else if (t >= duration) setT(0);
    setPlaying(true);
  };
  const step = (frames: number) => {
    pause();
    seek(t + frames / (fps ?? 30));
  };
  const select = (th: Thread) => {
    pause();
    setActive(th.id);
    if (th.timestamp != null) seek(th.timestamp);
  };
  const mine = threads.filter((th) => th.assetId === item.id);
  const markers = mine.filter((th) => th.timestamp != null);
  const visible = markers.filter((th) => !th.resolved && onScreen(th, t));
  const open = items.filter((i) => i.status === "IN_REVIEW");
  const pct = (s: number) => `${(Math.min(s, duration) / duration) * 100}%`;
  const uniqueNames = new Set(items.map((i) => i.name)).size === items.length;

  const main = (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5 min-[900px]:px-8">
        <span className="flex-1 text-[15px] text-brand-ink-2">{playing ? "Playing" : `Paused at ${timecode(t)}`} · click the video to pin a comment</span>
        {tall && (
          <button type="button" onClick={() => setSafe((s) => !s)} aria-pressed={safe} className="rounded-full bg-white px-3 py-1.5 text-[14px] shadow-sm">
            Safe zones {safe ? "on" : "off"}
          </button>
        )}
        <span className="rounded-full bg-white px-3 py-1.5 text-[14px] shadow-sm">
          {item.size} · {Math.round(duration)} s{fps ? ` · ${fps} fps` : ""}
          {item.video?.hasAudio ? " · sound" : ""}
        </span>
      </div>
      <div className="relative flex flex-1 items-center justify-center p-5">
        <div ref={frame} className={cn("relative overflow-hidden rounded-[16px] shadow-md", real ? "bg-black" : "bg-white")} style={{ height: "clamp(280px, calc(100vh - 440px), 640px)", aspectRatio: String(item.ratio), maxWidth: "100%" }}>
          {real ? (
            <video
              key={item.id}
              ref={video}
              src={item.fileUrl!}
              poster={item.video?.poster ?? undefined}
              preload="metadata"
              playsInline
              muted={muted}
              className="size-full object-cover"
              onLoadedMetadata={(e) => {
                // Same moment after switching 9:16 ↔ 1:1.
                e.currentTarget.currentTime = Math.min(t, e.currentTarget.duration || t);
                e.currentTarget.playbackRate = speed;
              }}
              onPause={(e) => {
                setPlaying(false);
                setT(e.currentTarget.currentTime);
              }}
              onPlay={() => setPlaying(true)}
              onEnded={() => setPlaying(false)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- the access-checked placeholder poster
            item.fileUrl && <img src={item.fileUrl} alt={item.name} className="size-full object-cover" />
          )}
          {safe && tall && (
            <>
              <span aria-hidden className="absolute inset-x-0 top-0 h-[14%] bg-[repeating-linear-gradient(135deg,rgba(255,93,2,0.12)_0_6px,transparent_6px_12px)]" />
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-[20%] bg-[repeating-linear-gradient(135deg,rgba(255,93,2,0.12)_0_6px,transparent_6px_12px)]" />
              <span className="absolute bottom-[21%] right-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px]">Platform UI zone</span>
            </>
          )}
          <button
            type="button"
            aria-label="Pause and comment on this spot and moment"
            onClick={(e) => {
              pause();
              if (!canReview) return;
              const r = e.currentTarget.getBoundingClientRect();
              setDraft({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
            className="absolute inset-0 cursor-crosshair"
          />
          {/* Comments on screen now: at their pin, or (a moment or range without one) in the top corner. */}
          <span className="pointer-events-none absolute left-3 top-3 flex gap-1.5">
            {visible
              .filter((th) => !th.pin)
              .map((th) => (
                <span key={th.id} className={cn("flex size-7 items-center justify-center rounded-[10px_10px_10px_2px] border-2 border-white text-[12px] font-semibold text-white", badge(th))}>
                  {th.number}
                </span>
              ))}
          </span>
          {visible
            .filter((th) => th.pin)
            .map((th) => (
              <button
                key={th.id}
                type="button"
                onClick={() => select(th)}
                aria-label={`Comment ${th.number}`}
                className={cn("absolute flex size-8 -translate-x-1/2 -translate-y-full items-center justify-center rounded-[10px_10px_10px_2px] border-2 border-white text-[13px] font-semibold text-white shadow", badge(th), active === th.id && "ring-2 ring-brand-ink ring-offset-1")}
                style={{ left: `${th.pin!.x}%`, top: `${th.pin!.y}%` }}
              >
                {th.number}
              </button>
            ))}
          {draft && <span aria-hidden className="pointer-events-none absolute size-8 -translate-x-1/2 -translate-y-full rounded-[10px_10px_10px_2px] border-2 border-white bg-brand-orange shadow" style={{ left: `${draft.x}%`, top: `${draft.y}%` }} />}
        </div>
        {draft && (
          <form action={action} className="absolute bottom-6 left-1/2 z-10 flex w-[min(440px,90%)] -translate-x-1/2 flex-col gap-2 rounded-[14px] border border-brand-line bg-white p-3 shadow-lg">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="assetId" value={item.id} />
            <input type="hidden" name="timestampSeconds" value={t.toFixed(2)} />
            <input type="hidden" name="xPercent" value={draft.x.toFixed(1)} />
            <input type="hidden" name="yPercent" value={draft.y.toFixed(1)} />
            <span className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="rounded-full bg-brand-ink px-2 py-0.5 font-brand-mono text-[12px] text-white">{timecode(t)}</span>
              <label className="inline-flex items-center gap-1.5 text-brand-ink-2">
                <input type="checkbox" checked={range} onChange={(e) => setRange(e.target.checked)} className="accent-[#1E1E1E]" />
                Range, until
              </label>
              {range && (
                <input name="timestampEndSeconds" type="number" min={Math.ceil((t + 0.1) * 10) / 10} max={duration} step={0.1} defaultValue={Math.min(duration, t + 2).toFixed(1)} aria-label="Range ends at (seconds)" className="w-20 rounded-[8px] border border-brand-outline px-2 py-0.5 font-brand-mono text-[12px]" />
              )}
              {range && <span className="text-brand-mute">s</span>}
            </span>
            <textarea name="body" required rows={2} autoFocus placeholder="What should change here?" className="w-full resize-none rounded-[10px] border border-brand-outline px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
            <span className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded-full bg-brand-ink px-4 py-1.5 text-[13px] text-white">
                {saving ? "Saving…" : "Comment"}
              </button>
              <button type="button" onClick={() => setDraft(null)} className="text-[13px] text-brand-ink-2 underline underline-offset-2">
                Cancel
              </button>
            </span>
          </form>
        )}
      </div>
      <div className="flex flex-col gap-4 border-t border-brand-line bg-white px-5 py-5 min-[900px]:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="flex size-12 items-center justify-center rounded-full bg-brand-ink text-white">
            {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}
          </button>
          <span className="font-brand-mono text-[15px] tabular-nums">
            {timecode(t)} / {timecode(duration)}
          </span>
          <span className="flex gap-1">
            <button type="button" onClick={() => step(-1)} aria-label="Back one frame" className="flex size-9 items-center justify-center rounded-full hover:bg-black/5">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Forward one frame" className="flex size-9 items-center justify-center rounded-full hover:bg-black/5">
              <ChevronRight className="size-4" />
            </button>
          </span>
          {real && (
            <button type="button" onClick={() => setMuted((m) => !m)} aria-pressed={!muted} aria-label={muted ? "Turn sound on" : "Mute"} className="flex size-9 items-center justify-center rounded-full hover:bg-black/5">
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
          )}
          <span className="flex-1" />
          <div role="group" aria-label="Speed" className="flex gap-1 rounded-full bg-[var(--seg-track)] p-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                onClick={() => {
                  setSpeed(s);
                  if (video.current) video.current.playbackRate = s;
                }}
                className={cn("h-9 rounded-full px-3 text-[14px]", speed === s ? "bg-brand-ink text-white" : "hover:bg-black/5")}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
        <div className="relative pt-8">
          {markers.map((th) => (
            <button
              key={th.id}
              type="button"
              onClick={() => select(th)}
              aria-label={`Comment ${th.number} at ${timecode(th.timestamp!)}${th.timestampEnd != null ? ` to ${timecode(th.timestampEnd)}` : ""}`}
              className={cn("absolute top-0 z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-[8px_8px_8px_2px] text-[11px] font-semibold text-white", badge(th), th.resolved && "opacity-40", active === th.id && "ring-2 ring-brand-ink ring-offset-1")}
              style={{ left: pct(th.timestamp!) }}
            >
              {th.number}
            </button>
          ))}
          <div
            role="presentation"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              pause();
              seek(((e.clientX - r.left) / r.width) * duration);
            }}
            className="relative h-14 cursor-pointer overflow-hidden rounded-[8px]"
          >
            {item.video?.strip ? (
              <FilmStrip src={item.video.strip} ratio={item.ratio} />
            ) : (
              <span aria-hidden className="block size-full bg-[#E9E3D6]" />
            )}
            {markers
              .filter((th) => th.timestampEnd != null)
              .map((th) => (
                <span key={th.id} aria-hidden className={cn("absolute inset-y-0 border-x-2", th.messages[0]?.fromClient ? "border-brand-orange bg-brand-orange/25" : "border-brand-ink bg-brand-ink/20", th.resolved && "opacity-40")} style={{ left: pct(th.timestamp!), width: `calc(${pct(th.timestampEnd! - th.timestamp!)})` }} />
              ))}
            <span aria-hidden className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" style={{ left: pct(t) }} />
          </div>
          <input type="range" min={0} max={duration} step={fps ? 1 / fps : 0.1} value={t} onChange={(e) => { pause(); seek(Number(e.target.value)); }} aria-label="Playhead" className="mt-3 w-full accent-[#1E1E1E]" />
          <div className="flex justify-between font-brand-mono text-[12px] text-brand-mute">
            {[0, 1 / 3, 2 / 3, 1].map((f) => (
              <span key={f}>{timecode(f * duration).replace(/\.\d$/, "")}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <ReviewShell
      {...shell}
      modes={items.length > 1 ? items.map((i) => ({ label: uniqueNames ? i.name : i.size, href: `${base}?${new URLSearchParams({ kind: "video", asset: i.id })}`, active: i.id === item.id })) : undefined}
      main={main}
      panel={<CommentPanel threads={mine} activeId={active} onSelect={select} empty="No comments yet. Pause the video where something should change." />}
      footer={<ReviewFooter projectId={projectId} canReview={canReview} openIds={open.map((i) => i.id)} note="Comments keep their timecode, so editors jump straight to the frame." approveLabel={open.length > 1 ? `Approve ${open.length} videos` : "Approve video"} />}
    />
  );
}

/**
 * The thumbnail strip at the film's own shape: as many frame-shaped tiles as fit the timeline, each showing the
 * frame nearest its point in time (the strip holds evenly spaced frames side by side), so nothing is stretched.
 */
function FilmStrip({ src, ratio }: { src: string; ratio: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [frames, setFrames] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setFrames(Math.max(1, Math.round(img.naturalWidth / (img.naturalHeight * ratio))));
    img.src = src;
  }, [src, ratio]);
  const h = 56;
  const tileW = h * ratio;
  const tiles = width && frames ? Math.ceil(width / tileW) : 0;
  return (
    <div ref={box} aria-hidden className="flex size-full overflow-hidden bg-[#E9E3D6]">
      {Array.from({ length: tiles }, (_, i) => {
        const frame = Math.min(frames - 1, Math.floor((((i + 0.5) * tileW) / width) * frames));
        return <span key={i} className="h-full shrink-0 border-r border-black/10" style={{ width: tileW, backgroundImage: `url(${src})`, backgroundSize: `${frames * tileW}px ${h}px`, backgroundPosition: `-${frame * tileW}px 0`, backgroundRepeat: "no-repeat" }} />;
      })}
    </div>
  );
}
