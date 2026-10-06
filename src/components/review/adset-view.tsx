"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bookmark, Check, ChevronLeft, ChevronRight, Heart, MessageCircle, MoreHorizontal, Send } from "lucide-react";
import type { ReviewItem, Thread } from "@/lib/review";
import { PinStage } from "@/components/review/pin-stage";
import { ApproveButton, ReviewFooter } from "@/components/review/review-footer";
import { ReviewShell, type ShellHeader } from "@/components/review/shell";
import { CommentPanel } from "@/components/review/comment-panel";
import { cn } from "@/lib/utils";

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
          {concepts.map((concept) => (
            <section key={concept} aria-label={concept} className="flex flex-col gap-3">
              <h2 className="m-0 text-[17px] font-normal">{concept}</h2>
              <div className="flex flex-wrap items-end gap-6">
                {items
                  .filter((i) => i.concept === concept)
                  .sort((a, b) => a.ratio - b.ratio)
                  .map((i) => (
                    <button key={i.id} type="button" onClick={() => router.push(href({ asset: i.id }), { scroll: false })} className="flex flex-col items-center gap-2 text-left">
                      <InContext item={i} brand={brand} domain={domain} />
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

/** An ad in its placement: a story frame for 9:16, a feed post for 4:5 and 1:1, a link post for 1.91:1. */
function InContext({ item, brand, domain }: { item: ReviewItem; brand: string; domain: string }) {
  const handle = brand.toLowerCase().replace(/\s+/g, "");
  const img = item.fileUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- the access-checked file the client was sent
    <img src={item.fileUrl} alt={`${item.concept} ${item.size}`} className="size-full object-cover" />
  ) : null;
  const avatar = <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-peach-pale text-[11px] font-semibold">{brand.charAt(0)}</span>;
  if (item.ratio < 0.7) {
    return (
      <span className="relative block h-[420px] w-[236px] overflow-hidden rounded-[28px] border-[6px] border-brand-ink bg-black shadow-lg">
        <span className="absolute inset-0">{img}</span>
        <span className="absolute inset-x-2 top-2 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("h-0.5 flex-1 rounded-full", i === 0 ? "bg-white" : "bg-white/40")} />
          ))}
        </span>
        <span className="absolute left-3 top-5 flex items-center gap-2 text-[12px] font-semibold text-white drop-shadow">
          {avatar}
          {handle} <span className="font-normal opacity-80">Sponsored</span>
        </span>
        <span className="absolute inset-x-3 bottom-12 flex items-center justify-center rounded-full bg-white/90 py-1.5 text-[12px] font-semibold text-brand-ink">Shop now ›</span>
        <span className="absolute inset-x-3 bottom-3 flex h-7 items-center rounded-full border border-white/60 px-3 text-[11px] text-white/80">Send message</span>
      </span>
    );
  }
  if (item.ratio > 1.5) {
    return (
      <span className="block w-[340px] overflow-hidden rounded-[12px] border border-brand-line bg-white shadow-sm">
        <span className="flex items-center gap-2 px-3 py-2 text-[12px]">
          {avatar}
          <span className="flex flex-col">
            <span className="font-semibold">{brand}</span>
            <span className="text-brand-mute">Sponsored</span>
          </span>
        </span>
        <span className="block aspect-[1.91/1]">{img}</span>
        <span className="flex items-center gap-2 bg-[#F4F4F2] px-3 py-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] uppercase text-brand-mute">{domain}</span>
            <span className="truncate text-[13px] font-semibold">{item.concept}</span>
          </span>
          <span className="rounded-[6px] bg-brand-chip px-3 py-1.5 text-[12px] font-semibold">Shop now</span>
        </span>
      </span>
    );
  }
  return (
    <span className="block w-[270px] overflow-hidden rounded-[12px] border border-brand-line bg-white shadow-sm">
      <span className="flex items-center gap-2 px-3 py-2 text-[12px]">
        {avatar}
        <span className="flex flex-1 flex-col">
          <span className="font-semibold">{handle}</span>
          <span className="text-brand-mute">Sponsored</span>
        </span>
        <MoreHorizontal className="size-4" />
      </span>
      <span className="block" style={{ aspectRatio: String(item.ratio) }}>
        {img}
      </span>
      <span className="flex items-center justify-between bg-brand-chip px-3 py-2 text-[12px] font-semibold">
        Shop now <ChevronRight className="size-4" />
      </span>
      <span className="flex items-center gap-3 px-3 py-2">
        <Heart className="size-4" /> <MessageCircle className="size-4" /> <Send className="size-4" />
        <span className="flex-1" />
        <Bookmark className="size-4" />
      </span>
      <span className="block px-3 pb-3 text-[12px]">
        <span className="font-semibold">{handle}</span> {item.concept}
      </span>
    </span>
  );
}
