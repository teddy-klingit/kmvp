"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { ArrowUp, Lock, MessageCircle, PanelRightClose, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Avatar, AvatarStack } from "@/components/ds/avatar";
import { SegmentedControl } from "@/components/ds/segmented-control";
import { useConversation } from "@/components/ds/conversation-context";
import { cn } from "@/lib/utils";
import { onLabel } from "@/lib/context-label";
import type { ChatMessage } from "@/lib/project-conversation";

export type PanelChannel = {
  key: string;
  label: string;
  locked?: boolean;
  unread: number;
  hint: string;
  placeholder: string;
  messages?: ChatMessage[];
  /** Replaces the message list (e.g. the PM activity timeline). */
  body?: React.ReactNode;
  post?: (formData: FormData) => void | Promise<void>;
  readKey?: string;
  /** Shown as chips in the empty state; clicking one fills the composer. */
  suggestions?: string[];
};

type Mode = "sheet" | "overlay" | "docked";

const DOCK_MIN = 1280;
const OPEN_BY_DEFAULT_MIN = 1440;
const SHEET_MAX = 768;

function useViewportWidth() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      return () => window.removeEventListener("resize", onChange);
    },
    () => window.innerWidth,
    () => null
  );
}

function readPref(key: string): "open" | "folded" | null {
  try {
    const v = window.localStorage.getItem(key);
    return v === "open" || v === "folded" ? v : null;
  } catch {
    return null;
  }
}

const PREF_EVENT = "klingit:conversation-pref";
// Fallback when storage is blocked, so the choice still holds for this page view.
const memoryPrefs = new Map<string, "open" | "folded">();

function writePref(key: string, value: "open" | "folded") {
  memoryPrefs.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage — the panel still works, it just won't remember.
  }
  window.dispatchEvent(new Event(PREF_EVENT));
}

/** The remembered open/folded choice; null on the server and until the user picks one. */
function usePref(key: string) {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(PREF_EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(PREF_EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => readPref(key) ?? memoryPrefs.get(key) ?? null,
    () => null
  );
}

/**
 * Right-hand conversation panel. ≥1440px: docked + open by default.
 * 1280–1439: docked, folded to a 56px rail by default. 768–1279: rail that
 * opens as an overlay. <768: floating Chat button + bottom sheet. The
 * docked open/folded choice is remembered per user (localStorage).
 */
export function ConversationPanel({
  title = "Conversation",
  projectId,
  storageKey,
  participants,
  channels,
  footerNote,
  markRead,
}: {
  title?: string;
  projectId: string;
  storageKey: string;
  participants: string[];
  channels: PanelChannel[];
  footerNote?: React.ReactNode;
  markRead?: (projectId: string, readKey: string) => Promise<void>;
}) {
  const width = useViewportWidth();
  const { openSignal } = useConversation();
  const pref = usePref(storageKey);
  const [manualOpen, setManualOpen] = useState(false);
  // "Ask a question" anywhere on the page bumps openSignal; the panel stays open until the next fold/close.
  const [handledSignal, setHandledSignal] = useState(openSignal);
  const askPending = openSignal !== handledSignal;

  const mode: Mode | null = width === null ? null : width < SHEET_MAX ? "sheet" : width < DOCK_MIN ? "overlay" : "docked";
  const dockedOpen = askPending || (pref ? pref === "open" : (width ?? 0) >= OPEN_BY_DEFAULT_MIN);
  const transientOpen = askPending || manualOpen;
  const setTransientOpen = (open: boolean) => {
    setManualOpen(open);
    if (!open) setHandledSignal(openSignal);
  };

  const totalUnread = channels.reduce((n, c) => n + c.unread, 0);
  const setDocked = (open: boolean) => {
    setHandledSignal(openSignal);
    writePref(storageKey, open ? "open" : "folded");
  };

  const inner = (onFold: () => void, foldIcon: "fold" | "close") => (
    <PanelInner
      title={title}
      projectId={projectId}
      participants={participants}
      channels={channels}
      footerNote={footerNote}
      markRead={markRead}
      onFold={onFold}
      foldIcon={foldIcon}
    />
  );

  // Before hydration: let CSS pick the default so the first paint matches the final layout.
  if (mode === null) {
    return (
      <>
        <aside aria-label={title} className="sticky top-0 hidden h-screen w-[380px] shrink-0 flex-col border-l border-ds-border bg-white min-[1440px]:flex">
          {inner(() => undefined, "fold")}
        </aside>
        <Rail unread={totalUnread} onOpen={() => undefined} className="hidden md:flex min-[1440px]:hidden" />
      </>
    );
  }

  if (mode === "sheet") {
    return (
      <DialogPrimitive.Root open={transientOpen} onOpenChange={setTransientOpen}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            className="fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 rounded-full bg-ds-text px-5 text-[14px] font-medium text-white shadow-lg"
          >
            <MessageCircle className="size-4" />
            Chat
            {totalUnread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ds-turn px-1.5 text-[11px] font-semibold">
                {totalUnread}
              </span>
            )}
          </button>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
          <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col overflow-hidden rounded-t-[16px] bg-white outline-none">
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
            {inner(() => setTransientOpen(false), "close")}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  if (mode === "overlay") {
    return (
      <>
        <Rail unread={totalUnread} onOpen={() => setTransientOpen(true)} />
        {transientOpen && (
          <>
            <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setTransientOpen(false)} />
            <aside aria-label={title} className="fixed inset-y-0 right-0 z-40 flex w-[380px] flex-col border-l border-ds-border bg-white shadow-xl">
              {inner(() => setTransientOpen(false), "fold")}
            </aside>
          </>
        )}
      </>
    );
  }

  return dockedOpen ? (
    <aside aria-label={title} className="sticky top-0 flex h-screen w-[380px] shrink-0 flex-col border-l border-ds-border bg-white">
      {inner(() => setDocked(false), "fold")}
    </aside>
  ) : (
    <Rail unread={totalUnread} onOpen={() => setDocked(true)} />
  );
}

function Rail({ unread, onOpen, className }: { unread: number; onOpen: () => void; className?: string }) {
  return (
    <aside
      aria-label="Conversation (folded)"
      className={cn("sticky top-0 flex h-screen w-14 shrink-0 flex-col items-center border-l border-ds-border bg-white pt-5", className)}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={unread ? `Open conversation, ${unread} unread` : "Open conversation"}
        className="relative flex size-10 items-center justify-center rounded-[10px] border border-ds-border bg-white text-ds-text hover:bg-ds-subtle"
      >
        <MessageCircle className="size-[18px]" strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute -right-[5px] -top-[5px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ds-turn px-[5px] text-[11px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
    </aside>
  );
}

function PanelInner({
  title,
  projectId,
  participants,
  channels,
  footerNote,
  markRead,
  onFold,
  foldIcon,
}: {
  title: string;
  projectId: string;
  participants: string[];
  channels: PanelChannel[];
  footerNote?: React.ReactNode;
  markRead?: (projectId: string, readKey: string) => Promise<void>;
  onFold: () => void;
  foldIcon: "fold" | "close";
}) {
  const { channel: requested, setChannel, context, setContext, openSignal } = useConversation();
  const active = channels.find((c) => c.key === requested) ?? channels[0];
  // Channels viewed this session: their unread badge clears without waiting for the server round trip.
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  if (!seen[active.key]) setSeen((s) => ({ ...s, [active.key]: true }));
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (active.unread > 0 && active.readKey && markRead) void markRead(projectId, active.readKey);
  }, [active.key, active.unread, active.readKey, markRead, projectId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [active.key, active.messages?.length]);

  useEffect(() => {
    if (openSignal > 0) textareaRef.current?.focus();
  }, [openSignal]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3.5 border-b border-ds-divider px-5 pb-4 pt-5">
        <div className="flex items-center gap-2">
          <h2 className="m-0 flex-1 text-[18px] font-normal text-ds-text">{title}</h2>
          <AvatarStack names={participants} size={26} max={3} />
          <button
            type="button"
            onClick={onFold}
            aria-label={foldIcon === "close" ? "Close conversation" : "Fold conversation panel"}
            className="flex size-8 items-center justify-center rounded-[8px] text-ds-text-2 hover:bg-ds-subtle"
          >
            {foldIcon === "close" ? <X className="size-[18px]" /> : <PanelRightClose className="size-[18px]" strokeWidth={1.75} />}
          </button>
        </div>
        {channels.length > 1 && (
          <SegmentedControl
            label="Channel"
            value={active.key}
            onChange={(k) => setChannel(k)}
            options={channels.map((c) => ({
              value: c.key,
              label: c.label,
              icon: c.locked ? <Lock className="size-[13px]" strokeWidth={2} /> : undefined,
              badge: c.key !== active.key && !seen[c.key] ? c.unread : 0,
            }))}
          />
        )}
        <span className="text-[12px] text-ds-text-2">{active.hint}</span>
      </div>

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-5">
        {active.body ??
          (active.messages && active.messages.length > 0 ? (
            <MessageList messages={active.messages} />
          ) : (
            <EmptyThread
              suggestions={active.post ? active.suggestions : undefined}
              onPick={(text) => {
                const el = textareaRef.current;
                if (!el) return;
                el.value = text;
                el.focus();
                el.setSelectionRange(text.length, text.length);
              }}
            />
          ))}
      </div>

      {(active.post || footerNote) && (
        <div className="border-t border-ds-divider px-4 pb-4 pt-3">
          {footerNote && <div className="mb-2 flex items-center gap-1.5 text-[12px] text-ds-text-2">{footerNote}</div>}
          {active.post && (
            <Composer
              key={active.key}
              projectId={projectId}
              action={active.post}
              placeholder={active.placeholder}
              textareaRef={textareaRef}
              context={active.key === channels[0].key ? context : null}
              clearContext={() => setContext(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function EmptyThread({ suggestions, onPick }: { suggestions?: string[]; onPick: (text: string) => void }) {
  return (
    <div className="m-auto flex max-w-[280px] flex-col items-center gap-3 text-center">
      <span className="flex size-10 items-center justify-center rounded-[10px] bg-ds-subtle text-ds-text-2">
        <MessageCircle className="size-5" strokeWidth={1.75} />
      </span>
      <p className="m-0 text-[14px] font-medium text-ds-text">No messages yet</p>
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => onPick(text)}
              className="h-11 rounded-full border border-ds-control-border bg-white px-3 text-[13px] font-medium text-ds-text hover:border-ds-text-3 sm:h-8"
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatStamp(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function MessageList({ messages }: { messages: ChatMessage[] }) {
  const GROUP_MS = 10 * 60 * 1000;
  return (
    <>
      {messages.map((m, i) => {
        if (m.kind === "SYSTEM") {
          return (
            <div key={m.id} className="inline-flex max-w-[90%] items-center justify-center gap-1.5 self-center rounded-[12px] bg-ds-bg px-2.5 py-1 text-center text-[12px] text-ds-text-2">
              {m.body} · {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(m.createdAt))}
            </div>
          );
        }
        const prev = messages[i - 1];
        const grouped =
          prev &&
          prev.kind === "MESSAGE" &&
          prev.authorKey === m.authorKey &&
          new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_MS;
        return (
          <div key={m.id} className={cn("flex gap-2.5", m.mine && m.tone !== "note" && "flex-row-reverse", grouped && "-mt-3")}>
            {grouped ? <span className="w-7 shrink-0" /> : <Avatar name={m.authorName} size={28} />}
            <div className={cn("flex min-w-0 flex-col gap-1", m.mine && m.tone !== "note" && "items-end")}>
              {!grouped && (
                <div className="text-[12px]">
                  {m.mine && m.tone !== "note" ? (
                    <span className="text-ds-text-2">You · {formatStamp(m.createdAt)}</span>
                  ) : (
                    <>
                      <span className="font-semibold text-ds-text">{m.authorName}</span>
                      <span className="text-ds-text-2">
                        {m.authorRole ? ` · ${m.authorRole}` : ""} · {formatStamp(m.createdAt)}
                      </span>
                    </>
                  )}
                </div>
              )}
              <div
                className={cn(
                  "whitespace-pre-line px-3 py-2.5 text-[14px]",
                  m.tone === "note"
                    ? "rounded-[4px_12px_12px_12px] border border-ds-note-border bg-ds-note text-ds-text"
                    : m.mine
                      ? "rounded-[12px_4px_12px_12px] bg-ds-text text-white"
                      : "rounded-[4px_12px_12px_12px] bg-ds-bg text-ds-text"
                )}
              >
                {m.context && (
                  <Link
                    href={m.context.href}
                    className={cn(
                      "mb-1.5 inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-[12px] no-underline",
                      m.mine ? "bg-white/15 text-white hover:bg-white/25" : "bg-ds-nav-active text-ds-text hover:bg-ds-border"
                    )}
                  >
                    {onLabel(m.context.label)}
                  </Link>
                )}
                <div>{m.body}</div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label="Send"
      disabled={pending}
      className="flex size-8 items-center justify-center rounded-[8px] bg-ds-text text-white disabled:opacity-50"
    >
      <ArrowUp className="size-4" strokeWidth={2} />
    </button>
  );
}

function Composer({
  projectId,
  action,
  placeholder,
  textareaRef,
  context,
  clearContext,
}: {
  projectId: string;
  action: (formData: FormData) => void | Promise<void>;
  placeholder: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  context: { kind: string; ref?: string; label: string } | null;
  clearContext: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={async (fd) => {
        formRef.current?.reset();
        clearContext();
        await action(fd);
      }}
    >
      <label htmlFor={`composer-${projectId}`} className="sr-only">
        Message
      </label>
      <div className="flex flex-col gap-2 rounded-[10px] border border-ds-control-border px-3 py-2.5 focus-within:border-ds-text-3">
        {context && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-[6px] bg-ds-nav-active px-2 py-0.5 text-[12px] text-ds-text">
            {onLabel(context.label)}
            <button type="button" aria-label="Remove context" onClick={clearContext} className="text-ds-text-2 hover:text-ds-text">
              <X className="size-3" />
            </button>
            <input type="hidden" name="contextKind" value={context.kind} />
            <input type="hidden" name="contextRef" value={context.ref ?? ""} />
            <input type="hidden" name="contextLabel" value={onLabel(context.label)} />
          </span>
        )}
        <input type="hidden" name="projectId" value={projectId} />
        <textarea
          ref={textareaRef}
          id={`composer-${projectId}`}
          name="body"
          rows={2}
          required
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          className="resize-none border-0 bg-transparent p-0 text-[14px] text-ds-text outline-none placeholder:text-ds-text-3"
        />
        <div className="flex items-center justify-end">
          <SendButton />
        </div>
      </div>
    </form>
  );
}
