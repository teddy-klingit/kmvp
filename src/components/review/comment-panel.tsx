"use client";

import { useState } from "react";
import type { Thread } from "@/lib/review";
import { replyThreadAction, resolveThreadAction } from "@/lib/actions/review-actions";
import { Avatar } from "@/components/ds/avatar";
import { cn } from "@/lib/utils";

const time = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(d) : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
};
export const timecode = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/**
 * The review's comment panel: Open · N and Resolved, one thread per pin (or timecode, or the whole set), each
 * message with its author, organisation, time and where it was written ("in Klingit"). Orange numbers are the
 * client's, ink ones Klingit's. Threads can be replied to, resolved and reopened.
 */
export function CommentPanel({
  title = "Comments",
  threads,
  activeId,
  onSelect,
  intro,
  empty = "No comments yet. Click the work to pin one.",
}: {
  title?: string;
  threads: Thread[];
  activeId?: string | null;
  onSelect?: (t: Thread) => void;
  intro?: React.ReactNode;
  empty?: string;
}) {
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const open = threads.filter((t) => !t.resolved);
  const resolved = threads.filter((t) => t.resolved);
  const shown = tab === "open" ? open : resolved;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-brand-line px-6 py-4">
        <h2 className="m-0 flex-1 text-[20px] font-normal">{title}</h2>
        <div role="tablist" aria-label="Comment status" className="flex gap-1 rounded-full bg-[var(--seg-track)] p-1">
          {(["open", "resolved"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("inline-flex h-9 items-center rounded-full px-4 text-[14px]", tab === t ? "bg-brand-ink text-white" : "text-brand-ink hover:bg-black/5")}>
              {t === "open" ? `Open · ${open.length}` : "Resolved"}
            </button>
          ))}
        </div>
      </div>
      {intro}
      <div className="flex flex-col gap-1 px-3 py-3">
        {shown.length === 0 && <p className="m-0 px-3 py-4 text-[14px] text-brand-ink-2">{tab === "open" ? empty : "Nothing resolved yet."}</p>}
        {shown.map((t) => (
          <ThreadCard key={t.id} thread={t} active={t.id === activeId} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function ThreadCard({ thread: t, active, onSelect }: { thread: Thread; active: boolean; onSelect?: (t: Thread) => void }) {
  const [replying, setReplying] = useState(false);
  const fromClient = t.messages[0]?.fromClient;
  return (
    <article className={cn("flex flex-col gap-3 rounded-[14px] px-3 py-3", active && "border border-brand-peach-line bg-brand-peach-pale/50")}>
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={() => onSelect?.(t)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-[8px_8px_8px_2px] text-[12px] font-semibold text-white", t.number == null ? "bg-brand-chip text-brand-ink-2" : fromClient ? "bg-brand-orange" : "bg-brand-ink")}>
            {t.number ?? "·"}
          </span>
          {t.timestamp != null && (
            <span className="whitespace-nowrap rounded-full bg-brand-ink px-2 py-0.5 font-brand-mono text-[12px] text-white">
              {timecode(t.timestamp)}
              {t.timestampEnd != null && `–${timecode(t.timestampEnd)}`}
            </span>
          )}
          <span className="truncate text-[14px] text-brand-ink-2">{t.label}</span>
        </button>
        <form action={resolveThreadAction}>
          <input type="hidden" name="threadId" value={t.id} />
          <input type="hidden" name="resolved" value={t.resolved ? "false" : "true"} />
          <button type="submit" className="text-[13px] text-brand-ink underline underline-offset-2 hover:no-underline">
            {t.resolved ? "Reopen" : "Resolve"}
          </button>
        </form>
      </div>
      {t.messages.map((m, i) => (
        <div key={m.id} className={cn("flex gap-3", i > 0 && "pl-8")}>
          <Avatar name={m.author} size={32} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-x-2 text-[13px]">
              <span className="font-semibold">{m.author}</span>
              <span className="text-brand-mute">
                {m.org} · {time(m.at)}
              </span>
              <span className="ml-auto rounded-full bg-brand-lime-pale px-2 py-0.5 text-[12px]">in Klingit</span>
            </span>
            <p className="m-0 text-[15px] leading-[1.5]">{m.body}</p>
          </div>
        </div>
      ))}
      {replying ? (
        <form action={async (fd) => { await replyThreadAction(fd); setReplying(false); }} className="flex flex-col gap-2 pl-11">
          <input type="hidden" name="threadId" value={t.id} />
          <textarea name="body" required rows={2} autoFocus placeholder="Reply…" className="w-full resize-none rounded-[10px] border border-brand-outline px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
          <span className="flex gap-2">
            <button type="submit" className="rounded-full bg-brand-ink px-4 py-1.5 text-[13px] text-white">Reply</button>
            <button type="button" onClick={() => setReplying(false)} className="text-[13px] text-brand-ink-2 underline underline-offset-2">Cancel</button>
          </span>
        </form>
      ) : (
        !t.resolved && (
          <button type="button" onClick={() => setReplying(true)} className="self-start pl-11 text-[13px] text-brand-ink-2 hover:text-brand-ink">
            Reply
          </button>
        )
      )}
    </article>
  );
}
