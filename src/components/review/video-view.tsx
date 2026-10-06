"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { ReviewItem, Thread } from "@/lib/review";
import { postTimestampCommentAction } from "@/lib/actions/project-actions";
import { ReviewFooter } from "@/components/review/review-footer";
import { ReviewShell, type ShellHeader } from "@/components/review/shell";
import { CommentPanel, timecode } from "@/components/review/comment-panel";
import { cn } from "@/lib/utils";

const SPEEDS = [0.5, 1, 2];
const STRIP = ["#F6D7EF", "#F4D9F0", "#F7DCE4", "#FCE4DA", "#FDE8DD", "#FBD9C6", "#E4EFC0", "#E8F1C9", "#EEF3DC", "#2B2B2B"];

/**
 * Video review (ReviewVideo.dc.html): the player with a safe-zone overlay, a timeline with a thumbnail strip and
 * comment markers, speed 0.5 / 1 / 2×. Clicking the video pauses it and pins a comment to that moment; clicking a
 * comment seeks the player. A demo video without a file plays as a timed placeholder.
 */
export function VideoView({ shell, projectId, items, threads, canReview, focusId, base }: { shell: ShellHeader; projectId: string; items: ReviewItem[]; threads: Thread[]; canReview: boolean; focusId: string | null; base: string }) {
  const item = items.find((i) => i.id === focusId) ?? items[0];
  const duration = item.durationSeconds ?? 15;
  const video = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [safe, setSafe] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const real = item.hasFile && item.isVideo;
  const [, action, saving] = useActionState(async (prev: Record<string, never>, fd: FormData) => {
    const r = await postTimestampCommentAction(prev, fd);
    setComposing(false);
    return r;
  }, {});

  // The placeholder clock for a video without a file.
  useEffect(() => {
    if (real || !playing) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      setT((x) => {
        const next = x + ((now - last) / 1000) * speed;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
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
  const toggle = () => {
    if (real && video.current) {
      if (video.current.paused) void video.current.play();
      else video.current.pause();
    }
    setPlaying((p) => !p);
  };
  const mine = threads.filter((th) => th.assetId === item.id);
  const open = items.filter((i) => i.status === "IN_REVIEW");

  const main = (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5 min-[900px]:px-8">
        <span className="flex-1 text-[15px] text-brand-ink-2">{playing ? "Playing" : `Paused at ${timecode(t)}`} · click the video to pin a comment</span>
        <button type="button" onClick={() => setSafe((s) => !s)} aria-pressed={safe} className="rounded-full bg-white px-3 py-1.5 text-[14px] shadow-sm">
          Safe zones {safe ? "on" : "off"}
        </button>
        <span className="rounded-full bg-white px-3 py-1.5 text-[14px] shadow-sm">
          {item.size} · {Math.round(duration)} s
        </span>
      </div>
      <div className="relative flex flex-1 items-center justify-center p-6">
        <div className={cn("relative overflow-hidden rounded-[16px] shadow-md", real ? "bg-black" : "bg-white")} style={{ height: "min(62vh, 640px)", aspectRatio: String(item.ratio) }}>
          {real ? (
            <video ref={video} src={item.fileUrl!} className="size-full object-cover" playsInline onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- the access-checked placeholder poster
            item.fileUrl && <img src={item.fileUrl} alt={item.name} className="size-full object-cover" />
          )}
          {safe && (
            <>
              <span aria-hidden className="absolute inset-x-0 top-0 h-[14%] bg-[repeating-linear-gradient(135deg,rgba(255,93,2,0.12)_0_6px,transparent_6px_12px)]" />
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-[20%] bg-[repeating-linear-gradient(135deg,rgba(255,93,2,0.12)_0_6px,transparent_6px_12px)]" />
              <span className="absolute bottom-[21%] right-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px]">Platform UI zone</span>
            </>
          )}
          {mine
            .filter((th) => th.timestamp != null && Math.abs(th.timestamp - t) < 1.2)
            .map((th) => (
              <span key={th.id} className={cn("absolute left-1/2 top-1/3 flex size-8 -translate-x-1/2 items-center justify-center rounded-[10px_10px_10px_2px] border-2 border-white text-[13px] font-semibold text-white", th.messages[0]?.fromClient ? "bg-brand-orange" : "bg-brand-ink")}>
                {th.number}
              </span>
            ))}
          <button
            type="button"
            aria-label="Pause and comment on this moment"
            onClick={() => {
              if (playing) toggle();
              if (canReview) setComposing(true);
            }}
            className="absolute inset-0"
          />
        </div>
        {composing && (
          <form action={action} className="absolute bottom-6 left-1/2 z-10 flex w-[min(440px,90%)] -translate-x-1/2 flex-col gap-2 rounded-[14px] border border-brand-line bg-white p-3 shadow-lg">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="assetId" value={item.id} />
            <input type="hidden" name="timestampSeconds" value={t.toFixed(1)} />
            <span className="self-start rounded-full bg-brand-ink px-2 py-0.5 font-brand-mono text-[12px] text-white">{timecode(t)}</span>
            <textarea name="body" required rows={2} autoFocus placeholder="What should change at this moment?" className="w-full resize-none rounded-[10px] border border-brand-outline px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
            <span className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded-full bg-brand-ink px-4 py-1.5 text-[13px] text-white">
                {saving ? "Saving…" : "Comment"}
              </button>
              <button type="button" onClick={() => setComposing(false)} className="text-[13px] text-brand-ink-2 underline underline-offset-2">
                Cancel
              </button>
            </span>
          </form>
        )}
      </div>
      <div className="flex flex-col gap-4 border-t border-brand-line bg-white px-5 py-5 min-[900px]:px-8">
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="flex size-12 items-center justify-center rounded-full bg-brand-ink text-white">
            {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}
          </button>
          <span className="font-brand-mono text-[15px] tabular-nums">
            {timecode(t)} / {timecode(duration)}
          </span>
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
        <div className="relative pt-7">
          {mine
            .filter((th) => th.timestamp != null)
            .map((th) => (
              <button key={th.id} type="button" onClick={() => { seek(th.timestamp!); setActive(th.id); }} aria-label={`Comment ${th.number} at ${timecode(th.timestamp!)}`} className={cn("absolute top-0 flex size-6 -translate-x-1/2 items-center justify-center rounded-[8px_8px_8px_2px] text-[11px] font-semibold text-white", th.messages[0]?.fromClient ? "bg-brand-orange" : "bg-brand-ink")} style={{ left: `${(th.timestamp! / duration) * 100}%` }}>
                {th.number}
              </button>
            ))}
          <div className="flex h-14 gap-1 overflow-hidden rounded-[8px]">
            {STRIP.map((c, i) => (
              <button key={i} type="button" aria-label={`Seek to ${timecode((i / STRIP.length) * duration)}`} onClick={() => seek((i / STRIP.length) * duration)} className="flex-1" style={{ backgroundColor: c }} />
            ))}
          </div>
          <input type="range" min={0} max={duration} step={0.1} value={t} onChange={(e) => seek(Number(e.target.value))} aria-label="Playhead" className="mt-3 w-full accent-[#1E1E1E]" />
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
      modes={items.length > 1 ? items.map((i) => ({ label: i.name, href: `${base}?${new URLSearchParams({ kind: "video", asset: i.id })}`, active: i.id === item.id })) : undefined}
      main={main}
      panel={<CommentPanel threads={mine} activeId={active} onSelect={(th) => { setActive(th.id); if (th.timestamp != null) seek(th.timestamp); }} empty="No comments yet. Pause the video where something should change." />}
      footer={<ReviewFooter projectId={projectId} canReview={canReview} openIds={open.map((i) => i.id)} note="Comments keep their timecode, so editors jump straight to the frame." approveLabel={open.length > 1 ? `Approve ${open.length} videos` : "Approve video"} />}
    />
  );
}
