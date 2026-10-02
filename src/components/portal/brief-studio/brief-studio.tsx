"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConversationPanel } from "@/components/portal/brief-studio/conversation";
import { BriefCanvas } from "@/components/portal/brief-studio/brief-canvas";
import {
  answerQuestionAction,
  askAboutAction,
  attachReferenceAction,
  editSectionAction,
  inviteTeammateAction,
  saveDraftAction,
  sendBriefAction,
  sendStudioMessageAction,
  setBasicsAction,
  startBriefAction,
  type StudioResult,
} from "@/lib/actions/brief-studio-actions";
import type { StudioView } from "@/lib/brief-studio/studio";

/**
 * Brief studio (BriefStudioBalanced.dc.html): the conversation on the left (5/12), the live brief on the right
 * (7/12), each scrolling in its own card. Under 1000px one panel shows at a time, switched by a sticky toggle.
 * Every change saves on the server and comes back as the new view.
 */
export function BriefStudio({ initial, viewerName, start, drafts = [] }: { initial: StudioView | null; viewerName: string; start?: string; drafts?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [thinking, setThinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [panel, setPanel] = useState<"chat" | "brief">("chat");
  const [attachOpen, setAttachOpen] = useState(false);
  const started = useRef(false);

  const run = (fn: () => Promise<StudioResult | void>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r?.view) setView(r.view);
      if (r?.error) setError(r.error);
    });

  // The first message creates the draft (it autosaves from here on) and opens it at its own URL.
  const begin = (text: string) => {
    setThinking(text);
    startTransition(async () => {
      const r = await startBriefAction(text);
      if (r.projectId) router.replace(`/brief/${r.projectId}`);
      else {
        setThinking(null);
        setError(r.error ?? "Something went wrong.");
      }
    });
  };

  useEffect(() => {
    // Typed on the dashboard or another page: that text is the first message. The ref keeps a dev double-mount from starting twice.
    if (!initial && start && !started.current) {
      started.current = true;
      begin(start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const id = view?.projectId ?? "";
  const handlers = {
    answer: (questionId: string, answer: Parameters<typeof answerQuestionAction>[2]) => run(() => answerQuestionAction(id, questionId, answer)),
    send: (text: string) => (view ? run(() => sendStudioMessageAction(id, text)) : begin(text)),
    basics: (b: Parameters<typeof setBasicsAction>[1]) => run(() => setBasicsAction(id, b)),
    attach: (fd: FormData) => run(() => attachReferenceAction(fd)),
  };
  const canvas = {
    edit: (key: Parameters<typeof editSectionAction>[1], patch: Parameters<typeof editSectionAction>[2]) => run(() => editSectionAction(id, key, patch)),
    ask: (key: Parameters<typeof askAboutAction>[1]) => {
      setPanel("chat");
      run(() => askAboutAction(id, key));
    },
    basics: handlers.basics,
    attach: () => setAttachOpen(true),
    saveDraft: () =>
      run(async () => {
        const r = await saveDraftAction(id);
        setNote("Draft saved · it's under Projects when you come back");
        return r;
      }),
    send: () =>
      run(async () => {
        const r = await sendBriefAction(id);
        return r && "error" in r ? { error: r.error } : undefined;
      }),
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4 font-brand text-brand-ink min-[1000px]:h-full min-[1000px]:px-7 min-[1000px]:pt-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
        <Link href="/dashboard" className="text-[13px] text-brand-ink-2 no-underline hover:text-brand-ink">
          ‹ Home
        </Link>
        <span className="font-brand-mono text-[11px] text-brand-ink-2">NEW BRIEF</span>
        <span className="flex-1" />
        {view && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-brand-ink-2" role="status">
            <span className={cn("size-2 shrink-0 rounded-full", pending ? "border border-brand-outline" : "bg-brand-lime-strong")} />
            {pending ? "Saving…" : note ?? "Saved · you can leave and come back"}
          </span>
        )}
        {view && view.editable && <Invite view={view} onInvite={(mate) => run(() => inviteTeammateAction(id, mate))} disabled={pending} />}
      </header>

      {error && (
        <p role="alert" className="m-0 rounded-[10px] bg-brand-peach-pale px-4 py-2.5 text-[14px]">
          {error}
        </p>
      )}

      {/* Phones and small tablets: one panel at a time, switched from a bar that sticks under the top bar. */}
      {view && (
        <div className="sticky top-0 z-20 -mx-4 -my-2 flex justify-center bg-brand-page/95 px-4 py-2 backdrop-blur min-[1000px]:hidden">
          <button type="button" onClick={() => setPanel((p) => (p === "chat" ? "brief" : "chat"))} className="inline-flex h-11 w-full max-w-[420px] items-center justify-center gap-2 rounded-full bg-brand-ink px-5 font-brand-mono text-[12px] text-white">
            {panel === "chat" ? `View brief · ${view.quality.score}` : "Back to the conversation"}
          </button>
        </div>
      )}

      <div className="grid gap-5 min-[1000px]:min-h-0 min-[1000px]:flex-1 min-[1000px]:grid-cols-[minmax(380px,5fr)_minmax(0,7fr)]">
        <div className={cn("flex min-h-0 min-w-0 flex-col max-[999px]:h-[calc(100dvh-140px)]", panel === "brief" && "max-[999px]:hidden")}>
          <ConversationPanel
            view={view}
            viewerName={viewerName}
            pending={pending}
            thinking={thinking}
            handlers={handlers}
            intro={(!view || view.messages.length === 0) && !thinking ? <Intro drafts={view ? [] : drafts} /> : null}
          />
        </div>
        <div className={cn("flex min-h-0 min-w-0 flex-col", panel === "chat" && "max-[999px]:hidden")}>
          {view ? (
            <BriefCanvas view={view} pending={pending} h={canvas} />
          ) : (
            <section aria-label="Live brief" className="flex flex-col gap-3 rounded-2xl bg-white px-7 py-6">
              <span className="text-[12px] text-brand-mute">Your brief</span>
              <span className="text-[24px] font-light">{thinking ? "Starting your brief…" : "Untitled brief"}</span>
              <p className="m-0 text-[15px] text-brand-mute">It fills in here as you talk: what Klingit already knows from your Brand OS and past projects first, then your answers.</p>
            </section>
          )}
        </div>
      </div>

      {view && <AttachDialog open={attachOpen} onOpenChange={setAttachOpen} projectId={id} onAttach={handlers.attach} />}
    </div>
  );
}

function Intro({ drafts }: { drafts: { id: string; name: string }[] }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[14px] leading-[1.5]">
        Tell me what you need made, in your own words. I&apos;ll start the brief from your Brand OS and past projects, then ask only what&apos;s missing.
      </p>
      {drafts.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[12px] bg-brand-chip px-4 py-3">
          <span className="text-[13px] text-brand-ink-2">Or continue your draft</span>
          {drafts.map((d) => (
            <Link key={d.id} href={`/brief/${d.id}`} className="text-[14px] text-brand-ink underline-offset-2 hover:underline">
              {d.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Invite({ view, onInvite, disabled }: { view: StudioView; onInvite: (clientUserId: string) => void; disabled: boolean }) {
  const mates = view.teammates;
  if (mates.length === 0) return null;
  const cls = "inline-flex h-9 items-center rounded-full border border-brand-outline px-3.5 font-brand-mono text-[12px] text-brand-ink hover:border-brand-ink disabled:opacity-50";
  if (mates.length === 1) {
    return (
      <button type="button" disabled={disabled} onClick={() => onInvite(mates[0].id)} className={cls}>
        Invite {mates[0].name.split(" ")[0]} to help
      </button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" disabled={disabled} className={cls}>
          Invite a teammate to help
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {mates.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => onInvite(m.id)}>
            {m.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AttachDialog({ open, onOpenChange, projectId, onAttach }: { open: boolean; onOpenChange: (o: boolean) => void; projectId: string; onAttach: (fd: FormData) => void }) {
  const [link, setLink] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const send = (fd: FormData) => {
    fd.set("projectId", projectId);
    onAttach(fd);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-32px)] max-w-[420px] rounded-[16px] border-none font-brand">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-normal">Add a reference</DialogTitle>
          <DialogDescription className="text-[14px] text-brand-ink-2">An image, PDF or video, or a link to something you like.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => file.current?.click()} className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-brand-outline font-brand-mono text-[12px]">
            <Upload className="size-4" strokeWidth={1.75} /> Upload a file
          </button>
          <input
            ref={file}
            type="file"
            accept="image/*,application/pdf,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const fd = new FormData();
              fd.set("file", f);
              send(fd);
            }}
          />
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!link.trim()) return;
              const fd = new FormData();
              fd.set("link", link.trim());
              send(fd);
              setLink("");
            }}
          >
            <Link2 className="size-4 shrink-0 text-brand-ink-2" strokeWidth={1.75} />
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a link" aria-label="Reference link" className="h-10 min-w-0 flex-1 rounded-[10px] border border-brand-field px-3 text-[14px] outline-none focus:border-brand-ink" />
            <button type="submit" className="h-10 rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white">
              Add
            </button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
