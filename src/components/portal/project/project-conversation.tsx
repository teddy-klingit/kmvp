"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { PersonAvatar } from "@/components/ui/avatar";
import { CommentComposer } from "@/components/portal/comment-composer";
import { postCommentAction } from "@/lib/actions/project-actions";
import { markChannelReadAction, postInternalMessageAction } from "@/lib/actions/conversation-actions";
import { cn, formatDate } from "@/lib/utils";
import type { ChatMessage, ProjectConversation as Conversation } from "@/lib/project-conversation";

type Channel = "klingit" | "internal";

const CHANNEL_KEY: Record<Channel, "KLINGIT" | "INTERNAL"> = { klingit: "KLINGIT", internal: "INTERNAL" };

export function ProjectConversation({
  projectId,
  conversation,
  className,
}: {
  projectId: string;
  conversation: Conversation;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const [channel, setChannel] = useState<Channel>(searchParams.get("channel") === "internal" ? "internal" : "klingit");
  const [seen, setSeen] = useState<Record<Channel, boolean>>({ klingit: false, internal: false });
  const listRef = useRef<HTMLDivElement>(null);

  const messages = conversation[channel];
  const unread = (c: Channel) => (seen[c] ? 0 : conversation.unread[c]);

  useEffect(() => {
    if (conversation.unread[channel] > 0) void markChannelReadAction(projectId, CHANNEL_KEY[channel]);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [channel, projectId, conversation.unread, messages.length]);

  function open(c: Channel) {
    setChannel(c);
    setSeen((s) => ({ ...s, [c]: true }));
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div role="tablist" className="flex gap-1 rounded-full border border-border bg-paper p-0.5">
        {(["klingit", "internal"] as const).map((c) => (
          <button
            key={c}
            role="tab"
            type="button"
            aria-selected={channel === c}
            onClick={() => open(c)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              channel === c ? "bg-ink text-paper" : "text-muted-foreground hover:text-ink"
            )}
          >
            {c === "internal" && <Lock className="size-3" />}
            {c === "klingit" ? "With Klingit" : "Internal"}
            {unread(c) > 0 && channel !== c && (
              <span aria-label={`${unread(c)} unread`} className="flex min-w-4 items-center justify-center rounded-full bg-orange px-1 text-[10px] leading-4 text-paper">
                {unread(c)}
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="px-1 text-[11px] text-muted-foreground">
        {channel === "klingit"
          ? "Your account team at Klingit sees this thread."
          : "Only people at your company can see this — never Klingit."}
      </p>

      <div ref={listRef} className="flex min-h-40 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-paper p-3">
        {messages.length === 0 ? (
          <p className="m-auto text-center text-xs text-muted-foreground">
            {channel === "klingit" ? "No messages yet — ask your team anything." : "No internal notes yet."}
          </p>
        ) : (
          messages.map((m) => <Message key={m.id} message={m} />)
        )}
      </div>

      <CommentComposer action={channel === "klingit" ? postCommentAction : postInternalMessageAction} projectId={projectId} />
    </div>
  );
}

function Message({ message: m }: { message: ChatMessage }) {
  return (
    <div className={cn("flex items-start gap-2", m.mine && "flex-row-reverse")}>
      <PersonAvatar name={m.authorName} size="sm" />
      <div className={cn("flex max-w-[80%] flex-col gap-0.5", m.mine ? "items-end" : "items-start")}>
        <span className="text-[11px] text-muted-foreground">
          {!m.mine && <span className="font-semibold text-ink">{m.authorName} · </span>}
          {formatDate(m.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm",
            m.mine ? "rounded-tr-sm bg-ink text-paper" : m.fromKlingit ? "rounded-tl-sm bg-purple text-ink" : "rounded-tl-sm bg-muted text-ink"
          )}
        >
          {m.context && <p className={cn("mb-0.5 text-[11px]", m.mine ? "text-paper/70" : "text-muted-foreground")}>{m.context}</p>}
          {m.body}
        </div>
      </div>
    </div>
  );
}
