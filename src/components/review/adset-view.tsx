"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { InContext } from "@/components/review/in-context";
import type { ReviewItem, Thread } from "@/lib/review";
import { PinStage } from "@/components/review/pin-stage";
import { ApproveButton, ReviewFooter } from "@/components/review/review-footer";
import { ReviewShell, type ShellHeader } from "@/components/review/shell";
import { CommentPanel } from "@/components/review/comment-panel";

/**
 * Ad set review (ReviewAdSet.dc.html). Grid: rows = concepts, columns = sizes, the master size labelled; approving
 * a concept approves all its sizes. In context: each ad in a phone feed or story frame with the platform UI on top.
 * Clicking an ad opens it at full size with its pins.
 */
export function AdSetView({
  shell,
  projectId,
  items,
  threads,
  canReview,
  mode,
  focusId,
  base,
  brand,
  domain,
}: {
  projectId: string;
  items: ReviewItem[];
  threads: Thread[];
  canReview: boolean;
  mode: "grid" | "context";
  focusId: string | null;
  base: string;
  brand: string;
  domain: string;
  shell: ShellHeader;
}) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  // In context: shade what Stories' and Reels' own UI covers (the dead areas).
  const [zones, setZones] = useState(false);
  const columns = [...new Map(items.map((i) => [i.size, i.ratio])).entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s);
  const concepts = [...new Set(items.map((i) => i.concept))];
  const focus = focusId ? items.find((i) => i.id === focusId) : null;
  const href = (q: Record<string, string | null>) => {
    const p = new URLSearchParams({ kind: "adset", ...(mode === "context" ? { mode: "context" } : {}) });
    for (const [k, v] of Object.entries(q)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `${base}?${p}`;
  };

  const open = items.filter((i) => i.status === "IN_REVIEW");
  const openConcepts = new Set(open.map((i) => i.concept)).size;
  const panelThreads = focus ? threads.filter((t) => t.assetId === focus.id) : threads.filter((t) => !t.assetId || items.some((i) => i.id === t.assetId));
  const wrap = (main: React.ReactNode) => (
    <ReviewShell
      {...shell}
      main={main}
      panel={
        <CommentPanel
          threads={panelThreads}
          activeId={active}
          onSelect={(t) => {
            setActive(t.id);
            if (t.assetId && t.assetId !== focusId) router.push(href({ asset: t.assetId }), { scroll: false });
          }}
          empty={focus ? "No comments on this ad yet. Click it to pin one." : "No comments yet. Open an ad to pin one."}
        />
      }
      footer={
        <ReviewFooter
          projectId={projectId}
          canReview={canReview}
          openIds={open.map((i) => i.id)}
          note="Approving a concept approves all its sizes."
          approveLabel={`Approve ${openConcepts} concept${openConcepts === 1 ? "" : "s"}`}
        />
      }
    />
  );

  if (focus) {
    const idx = items.indexOf(focus);
    const prev = items[(idx - 1 + items.length) % items.length];
    const next = items[(idx + 1) % items.length];
    return wrap(
      <div className="flex min-h-full flex-col gap-5 p-5 min-[900px]:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={href({ asset: null })} scroll={false} className="inline-flex items-center gap-1 text-[14px] text-brand-ink-2 no-underline hover:text-brand-ink">
            <ChevronLeft className="size-4" /> The whole set
          </Link>
          <span className="flex-1 text-center text-[15px]">
            {focus.concept} · {focus.size} <span className="text-brand-mute">· {idx + 1} of {items.length}</span>
          </span>
          {canReview && focus.status === "IN_REVIEW" ? <ApproveButton projectId={projectId} ids={[focus.id]} label="Approve this ad" /> : <StatusLine status={focus.status} />}
        </div>
        <div className="relative flex flex-1 items-start justify-center gap-4 pb-28">
          <Link href={href({ asset: prev.id })} scroll={false} aria-label="Previous ad" className="mt-[30vh] flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-sm hover:bg-brand-chip">
            <ChevronLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <PinStage projectId={projectId} assetId={focus.id} src={focus.fileUrl} ratio={focus.ratio} alt={`${focus.concept} ${focus.size}`} threads={threads} activeId={active} onSelect={(t) => setActive(t.id)} canComment={canReview} maxHeight={620} />
          </div>
          <Link href={href({ asset: next.id })} scroll={false} aria-label="Next ad" className="mt-[30vh] flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-sm hover:bg-brand-chip">
            <ChevronRight className="size-5" />
          </Link>
        </div>
        <p className="m-0 text-[14px] text-brand-ink-2">{canReview ? "Click to pin a comment, or drag to mark an area." : "Comments stay with each ad."}</p>
      </div>
    );
  }

  return wrap(
    <div className="flex flex-col gap-4 p-5 min-[900px]:p-8">
      <p className="m-0 text-right text-[14px] text-brand-ink-2">
        {concepts.length} concept{concepts.length === 1 ? "" : "s"} × {columns.length} size{columns.length === 1 ? "" : "s"} = {items.length} ads · approve a concept and its sizes follow
      </p>
      {mode === "grid" ? (
        <div className="overflow-x-auto rounded-2xl bg-white">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="text-[13px] text-brand-mute">
                <th className="w-[200px] px-6 py-4 text-left font-normal">Concept</th>
                {columns.map((c) => (
                  <th key={c} className="px-2 py-4 font-normal">
                    {c}
                  </th>
                ))}
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody>
              {concepts.map((concept) => {
                const row = items.filter((i) => i.concept === concept);
                const open = row.filter((i) => i.status === "IN_REVIEW");
                const comments = threads.filter((t) => row.some((i) => i.id === t.assetId) && !t.resolved).length;
                return (
                  <tr key={concept} className="border-t border-brand-line">
                    <td className="px-6 py-5 align-middle">
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[17px]">{concept}</span>
                        <span className="text-[14px] text-brand-mute">{comments ? `${comments} open comment${comments === 1 ? "" : "s"}` : "Sizes follow the master"}</span>
                      </span>
                    </td>
                    {columns.map((col, ci) => {
                      const cell = row.find((i) => i.size === col);
                      if (!cell) return <td key={col} />;
                      const w = Math.min(172, Math.round(108 * cell.ratio));
                      const pins = threads.filter((t) => t.assetId === cell.id && !t.resolved).length;
                      return (
                        <td key={col} className="px-2 py-5 text-center align-middle">
                          <Link href={href({ asset: cell.id })} scroll={false} className="relative inline-flex flex-col items-center gap-1.5 no-underline">
                            <span className="relative block overflow-hidden rounded-[8px] bg-brand-chip shadow-sm transition-transform hover:scale-[1.03]" style={{ width: w, height: Math.round(w / cell.ratio) }}>
                              {/* eslint-disable-next-line @next/next/no-img-element -- the access-checked file the client was sent */}
                              {cell.fileUrl && <img src={cell.fileUrl} alt={`${concept} ${col}`} loading="lazy" className="size-full object-cover" />}
                              {pins > 0 && <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-brand-orange text-[11px] font-semibold text-white">{pins}</span>}
                            </span>
                            <span className="text-[13px] text-brand-mute">{ci === 0 ? "Master" : ""}</span>
                          </Link>
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-6 py-5 text-right align-middle">
                      {open.length === 0 ? (
                        <StatusLine status={row.every((i) => i.status === "APPROVED" || i.status === "DELIVERED") ? "APPROVED" : row[0].status} count={row.length} />
                      ) : canReview ? (
                        <ApproveButton projectId={projectId} ids={open.map((i) => i.id)} label="Approve concept" />
                      ) : (
                        <StatusLine status="IN_REVIEW" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <label className="flex items-center gap-2 self-start text-[14px]">
            <input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} className="size-4 accent-brand-ink" />
            Show safe zones <span className="text-brand-ink-2">(what Stories&apos; and Reels&apos; UI covers)</span>
          </label>
          {concepts.map((concept) => (
            <section key={concept} aria-label={concept} className="flex flex-col gap-3">
              <h2 className="m-0 text-[17px] font-normal">{concept}</h2>
              <div className="flex flex-wrap items-end gap-6">
                {items
                  .filter((i) => i.concept === concept)
                  .sort((a, b) => a.ratio - b.ratio)
                  .map((i) => (
                    <button key={i.id} type="button" onClick={() => router.push(href({ asset: i.id }), { scroll: false })} className="flex flex-col items-center gap-2 text-left">
                      <InContext src={i.fileUrl} alt={`${i.concept} ${i.size}`} ratio={i.ratio} brand={brand} domain={domain} caption={i.concept} format={i.size} safeZones={zones} />
                      <span className="text-[13px] text-brand-mute">{i.size}</span>
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="m-0 text-[14px] text-brand-ink-2">Click any ad to open it with pins{mode === "grid" ? " · switch to In context to see it in the feed" : ""}</p>
    </div>
  );
}

function StatusLine({ status, count }: { status: string; count?: number }) {
  if (status === "APPROVED" || status === "DELIVERED")
    return (
      <span className="inline-flex items-center gap-2 text-[15px]">
        <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-[#8D9E47]">
          <Check className="size-3.5 text-white" strokeWidth={3} />
        </span>
        {count ? `All ${count} sizes` : "Approved"}
      </span>
    );
  if (status === "CHANGES_REQUESTED") return <span className="text-[15px] text-brand-ink-2">Changes asked</span>;
  return <span className="text-[15px] text-brand-ink-2">In review</span>;
}
