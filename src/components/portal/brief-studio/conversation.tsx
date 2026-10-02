"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, Link2, Mic, Paperclip, Upload } from "lucide-react";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { Popover } from "@/components/portal/brief-studio/popover";
import { StreamedText, ThinkingLine } from "@/components/portal/brief-studio/motion";
import type { StudioMessage, StudioQuestion } from "@/lib/brief-studio/model";
import type { Answer } from "@/lib/brief-studio/planner";
import type { StudioView } from "@/lib/brief-studio/studio";

export type ConversationHandlers = {
  answer: (questionId: string, answer: Answer) => void;
  send: (text: string) => void;
  basics: (b: { deadline?: string; markets?: string[] }) => void;
  attach: (form: FormData) => void;
};

function AgentAvatar() {
  return (
    <span aria-hidden className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-brand-lime-pale">
      <LogoMark className="h-[16px] w-auto text-brand-ink" />
    </span>
  );
}

// ─── Basics: deadline and markets (never asked in the conversation) ───────

const basicButton = "flex h-9 w-full min-w-0 items-center justify-between gap-1 rounded-[10px] bg-brand-chip px-2.5 text-[13px] text-brand-ink hover:bg-brand-nav min-[480px]:gap-1.5 min-[480px]:px-3";

function BasicsBar({ view, onChange, disabled }: { view: StudioView; onChange: ConversationHandlers["basics"]; disabled: boolean }) {
  const b = view.basics;
  // The picked markets live here between clicks, so quick picks never send a stale list; the server's list wins after.
  const [markets, setMarkets] = useState(b.markets);
  const [seen, setSeen] = useState(b.markets);
  if (seen !== b.markets) {
    setSeen(b.markets);
    setMarkets(b.markets);
  }
  const toggleMarket = (m: string) => {
    const next = markets.includes(m) ? markets.filter((x) => x !== m) : [...markets, m];
    setMarkets(next);
    onChange({ markets: next });
  };
  const marketsLabel = markets.length === 0 ? "Pick markets" : markets.length <= 2 ? markets.join(", ") : `${markets.length} markets`;
  return (
    <div className="grid grid-cols-2 gap-2.5 border-b border-brand-line px-4 py-4 min-[480px]:px-5">
      <Field label="Deadline">
        <Popover
          label="Deadline"
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} disabled={disabled} className={basicButton}>
              <span className="truncate">{b.deadline.label}</span>
              <ChevronDown className="size-4 shrink-0 text-brand-ink-2" strokeWidth={1.75} />
            </button>
          )}
        >
          {(close) => (
            <div className="flex flex-col gap-2 p-1">
              <button
                type="button"
                onClick={() => {
                  onChange({ deadline: b.deadline.earliestIso });
                  close();
                }}
                className="flex flex-col rounded-[8px] px-2.5 py-2 text-left hover:bg-brand-chip"
              >
                <span className="text-[14px]">{b.deadline.earliestLabel}</span>
                <span className="text-[12px] text-brand-mute">Earliest realistic: first draft by {b.deadline.firstDraftLabel}</span>
              </button>
              <label className="flex flex-col gap-1 px-2.5 pb-1 text-[12px] text-brand-mute">
                Or pick a date
                <input type="date" defaultValue={b.deadline.iso} onChange={(e) => e.target.value && onChange({ deadline: e.target.value })} className="h-9 rounded-[8px] border border-brand-field px-2 text-[14px] text-brand-ink" />
              </label>
            </div>
          )}
        </Popover>
      </Field>
      <Field label="Markets">
        <Popover
          label="Markets"
          align="end"
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} disabled={disabled} className={basicButton}>
              <span className="truncate">{marketsLabel}</span>
              <ChevronDown className="size-4 shrink-0 text-brand-ink-2" strokeWidth={1.75} />
            </button>
          )}
        >
          {() => (
            <ul className="m-0 flex max-h-[280px] list-none flex-col overflow-y-auto p-0">
              {b.marketOptions.map((m) => {
                const on = markets.includes(m);
                return (
                  <li key={m}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleMarket(m)}
                      className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[14px] hover:bg-brand-chip"
                    >
                      <span className={cn("flex size-4 items-center justify-center rounded-[4px] border", on ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline")}>{on && <Check className="size-3" strokeWidth={2.5} />}</span>
                      {m}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Popover>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] text-brand-mute">{label}</span>
      {children}
    </div>
  );
}

// ─── Questions ─────────────────────────────────────────────────────────────

function OptionChip({ label, selected, recommended, reason, onClick, disabled, dim, delay }: { label: string; selected: boolean; recommended: boolean; reason?: string; onClick?: () => void; disabled?: boolean; dim?: boolean; delay?: number }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      style={delay !== undefined ? { animationDelay: `${delay}ms` } : undefined}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-[14px] px-3.5 py-2 text-left text-[14px] text-brand-ink",
        delay !== undefined && "studio-rise",
        selected ? "border-[1.5px] border-brand-ink bg-brand-lime-pale" : "border border-brand-rule bg-white",
        !disabled && !selected && "hover:border-brand-outline",
        dim && !selected && "opacity-70"
      )}
    >
      {selected && <Check className="size-4 shrink-0" strokeWidth={2} />}
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {(recommended || reason) && (
          <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-[#6b6b6b]">
            {recommended && <span className="rounded-full bg-brand-lime px-1.5 py-px text-[11px] text-brand-ink">Recommended</span>}
            {reason}
          </span>
        )}
      </span>
    </button>
  );
}

function QuestionBlock({ q, active, onAnswer, disabled, animate }: { q: StudioQuestion; active: boolean; onAnswer: ConversationHandlers["answer"]; disabled: boolean; animate: boolean }) {
  // Multi-select starts from the recommended options, which the client can untick.
  const [picked, setPicked] = useState<string[]>(q.type === "multi" ? q.recommendedOptionIds : []);
  const [streamed, setStreamed] = useState(!animate);
  const chosen = active ? picked : q.chosen ?? [];
  const multi = q.type === "multi";
  const closing = q.type === "closing";
  const toggle = (id: string) => {
    if (!active || disabled) return;
    if (multi) setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    else onAnswer(q.id, { chosen: [id] });
  };
  const options = closing ? q.options.filter((o) => o.id !== "done") : q.options;
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  const chipDelay = (i: number) => (animate ? i * 40 : undefined);
  let n = 0;

  return (
    <div className="flex items-start gap-2.5">
      <AgentAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <StreamedText text={q.question} animate={animate} onDone={() => setStreamed(true)} className="text-[15px]" />
            {q.hint && streamed && q.type !== "confirm" && <span className="studio-rise text-[12px] text-brand-mute">{q.hint}</span>}
          </div>
          {q.hint && streamed && q.type === "confirm" && <span className="studio-rise text-[13px] text-brand-ink-2">{q.hint}</span>}
        </div>
        {streamed && options.length > 0 && (
          <div className="flex flex-col gap-2">
            {groups.map((g) => (
              <div key={g || "all"} className="flex flex-col gap-1.5">
                {g && <span className="text-[12px] text-brand-mute">{g}</span>}
                <div className="flex flex-wrap gap-2">
                  {options
                    .filter((o) => (o.group ?? "") === g)
                    .map((o) => (
                      <OptionChip
                        key={o.id}
                        label={o.label}
                        selected={chosen.includes(o.id)}
                        recommended={q.recommendedOptionIds.includes(o.id)}
                        reason={q.reasonPerOption[o.id]}
                        onClick={() => toggle(o.id)}
                        disabled={!active || disabled}
                        dim={active && disabled}
                        delay={chipDelay(n++)}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {streamed && q.footnote && <span className="text-[12px] text-brand-mute">{q.footnote}</span>}
        {!active && q.delegated && <span className="text-[13px] text-brand-ink-2">Klingit decides.</span>}
        {active && streamed && (
          <div className="studio-rise flex flex-wrap items-center gap-2" style={animate ? { animationDelay: `${n * 40}ms` } : undefined}>
            {closing && (
              <button type="button" disabled={disabled} onClick={() => onAnswer(q.id, { chosen: ["done"] })} className="h-10 rounded-full bg-brand-ink px-[18px] font-brand-mono text-[12px] text-white disabled:opacity-40">
                No, that is everything
              </button>
            )}
            {multi && (
              <button type="button" disabled={disabled || picked.length === 0} onClick={() => onAnswer(q.id, { chosen: picked })} className="h-9 rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white disabled:opacity-40">
                Continue
              </button>
            )}
            {q.type === "date" && (
              <input type="date" aria-label="Pick a date" disabled={disabled} onChange={(e) => e.target.value && onAnswer(q.id, { chosen: [], freeText: e.target.value })} className="h-9 rounded-full border border-brand-rule px-3 text-[13px]" />
            )}
            {!closing && !q.requested && (
              <button type="button" disabled={disabled} onClick={() => onAnswer(q.id, { delegate: true })} className="h-9 rounded-full px-3.5 text-[13px] text-brand-ink-2 hover:bg-brand-chip">
                Let Klingit decide
              </button>
            )}
            {q.type === "text" && <span className="text-[12px] text-brand-mute">Write it below</span>}
          </div>
        )}
        {!active && closing && q.chosen?.includes("done") && <span className="text-[13px] text-brand-ink-2">No, that is everything.</span>}
      </div>
    </div>
  );
}

function MessageRow({ m, q, active, viewerName, onAnswer, disabled, animate }: { m: StudioMessage; q?: StudioQuestion; active: boolean; viewerName: string; onAnswer: ConversationHandlers["answer"]; disabled: boolean; animate: boolean }) {
  if (m.role === "client") {
    const other = m.authorName && m.authorName !== viewerName;
    return (
      <div className={cn("flex max-w-[80%] flex-col items-end gap-1 self-end", animate && "studio-rise")}>
        {other && <span className="text-[12px] text-brand-mute">{m.authorName}</span>}
        <div className="whitespace-pre-wrap rounded-[14px_4px_14px_14px] bg-brand-ink px-3.5 py-2.5 text-[14px] text-white">{m.text}</div>
      </div>
    );
  }
  if (q) return <QuestionBlock q={q} active={active} onAnswer={onAnswer} disabled={disabled} animate={animate} />;
  return (
    <div className="flex items-start gap-2.5">
      <AgentAvatar />
      <p className="m-0 min-w-0 flex-1 text-[14px] leading-[1.5]">
        <StreamedText text={m.text} animate={animate} />
      </p>
    </div>
  );
}

// ─── Composer ──────────────────────────────────────────────────────────────

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

function Composer({ projectId, onSend, onAttach, disabled, placeholder }: { projectId?: string; onSend: (t: string) => void; onAttach?: ConversationHandlers["attach"]; disabled: boolean; placeholder: string }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  };

  // Voice: the browser's own speech recognition transcribes into the composer, so the client can check it before sending.
  const toggleVoice = () => {
    if (listening) return rec.current?.stop();
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return setNote("Voice notes need Chrome, Edge or Safari. You can type instead.");
    const r = new SR();
    r.lang = navigator.language || "en-GB";
    r.interimResults = true;
    r.continuous = true;
    const before = text ? `${text.trim()} ` : "";
    r.onresult = (e) => setText(before + Array.from(e.results).map((x) => x[0].transcript).join(" "));
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      setNote("Couldn't hear that. Check the microphone permission and try again.");
    };
    rec.current = r;
    setNote(null);
    setListening(true);
    r.start();
  };

  const attach = (fd: FormData) => {
    if (!projectId || !onAttach) return;
    fd.set("projectId", projectId);
    onAttach(fd);
  };

  return (
    <div className="border-t border-brand-line px-4 pb-4 pt-3.5">
      <label htmlFor="briefmsg" className="sr-only">
        Message the brief agent
      </label>
      <div className="flex items-center gap-1.5 rounded-[14px] border border-brand-field bg-white px-3 py-2.5 focus-within:border-brand-ink">
        {onAttach && projectId ? (
          <Popover
            label="Attach a reference"
            side="top"
            trigger={({ toggle }) => (
              <button type="button" aria-label="Attach reference" onClick={toggle} disabled={disabled} className="flex size-8 items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-chip">
                <Paperclip className="size-[18px]" strokeWidth={1.75} />
              </button>
            )}
          >
            {(close) => (
              <div className="flex w-[260px] flex-col gap-2 p-1">
                <button type="button" onClick={() => file.current?.click()} className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[14px] hover:bg-brand-chip">
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
                    attach(fd);
                    e.target.value = "";
                    close();
                  }}
                />
                <form
                  className="flex items-center gap-1.5 px-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!link.trim()) return;
                    const fd = new FormData();
                    fd.set("link", link.trim());
                    attach(fd);
                    setLink("");
                    close();
                  }}
                >
                  <Link2 className="size-4 shrink-0 text-brand-ink-2" strokeWidth={1.75} />
                  <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a link" aria-label="Reference link" className="h-9 min-w-0 flex-1 rounded-[8px] border border-brand-field px-2 text-[14px] outline-none focus:border-brand-ink" />
                </form>
              </div>
            )}
          </Popover>
        ) : null}
        <input
          id="briefmsg"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), submit())}
          placeholder={listening ? "Listening…" : placeholder}
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] outline-none placeholder:text-brand-mute"
        />
        <button type="button" aria-label={listening ? "Stop voice note" : "Voice note"} aria-pressed={listening} onClick={toggleVoice} className={cn("flex size-8 items-center justify-center rounded-full", listening ? "bg-brand-ink text-white" : "text-brand-ink-2 hover:bg-brand-chip")}>
          <Mic className="size-[18px]" strokeWidth={1.75} />
        </button>
        <button type="button" aria-label="Send" onClick={submit} disabled={disabled || !text.trim()} className="flex size-[34px] items-center justify-center rounded-full bg-brand-ink text-white disabled:opacity-40">
          <ArrowUp className="size-[18px]" strokeWidth={2} />
        </button>
      </div>
      {note && <p className="m-0 mt-2 text-[12px] text-brand-ink-2">{note}</p>}
    </div>
  );
}

// ─── The panel ─────────────────────────────────────────────────────────────

/** Earlier answers fold away once there are more than this many, as "N answers above · show". */
const KEEP_ANSWERED = 2;

export function ConversationPanel({
  view,
  viewerName,
  pending,
  thinking,
  thinkingLine,
  handlers,
  intro,
}: {
  view: StudioView | null;
  viewerName: string;
  pending: boolean;
  /** The client's first message, waiting on the agent (shown before the server answers). */
  thinking?: string | null;
  /** What the agent is doing right now ("Checking what worked on Meta in your past projects"). */
  thinkingLine: string;
  handlers: ConversationHandlers;
  intro?: React.ReactNode;
}) {
  const end = useRef<HTMLDivElement>(null);
  // Messages already on screen when the studio opened don't stream again.
  const [seen] = useState(() => new Set(view?.messages.map((m) => m.id) ?? []));
  const [expanded, setExpanded] = useState(false);
  const messages = view?.messages ?? [];
  const count = messages.length + (thinking ? 1 : 0) + (pending ? 1 : 0);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [count]);
  const byId = new Map((view?.log ?? []).map((q) => [q.id, q]));
  const disabled = pending || (view ? !view.editable : false);

  // Fold everything before the last two answered questions (the open one always shows).
  const answeredIdx = messages.map((m, i) => (m.questionId && byId.get(m.questionId)?.answeredAt ? i : -1)).filter((i) => i >= 0);
  const cut = answeredIdx.length > KEEP_ANSWERED + 1 ? answeredIdx[answeredIdx.length - KEEP_ANSWERED] : 0;
  const hiddenAnswers = answeredIdx.filter((i) => i < cut).length;

  return (
    <section aria-label="Brief conversation" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white">
      <div className="flex items-center gap-2.5 border-b border-brand-line px-5 py-[18px]">
        <h2 className="m-0 flex-1 text-[18px] font-normal">Brief agent</h2>
        {view && <span className="text-right text-[12px] text-brand-mute max-[479px]:hidden">{view.agentNote}</span>}
      </div>
      {view && <BasicsBar view={view} onChange={handlers.basics} disabled={disabled} />}
      <div aria-live="polite" className="flex min-h-[240px] flex-1 flex-col gap-[18px] overflow-y-auto p-5">
        {intro}
        {cut > 0 && (
          <p className="m-0 text-center text-[13px] text-brand-mute">
            {expanded ? "Earlier answers · " : `${hiddenAnswers} answer${hiddenAnswers === 1 ? "" : "s"} above · `}
            <button type="button" onClick={() => setExpanded((e) => !e)} className="text-brand-ink underline underline-offset-2">
              {expanded ? "hide" : "show"}
            </button>
          </p>
        )}
        {messages.map((m, i) => (
          // Folded rows stay mounted (hidden), so nothing replays its animation when the fold moves.
          <div key={m.id} className={cn("flex flex-col", !expanded && i < cut && "hidden")}>
          <MessageRow
            m={m}
            q={m.questionId ? byId.get(m.questionId) : undefined}
            active={Boolean(m.questionId && view?.active?.id === m.questionId)}
            viewerName={viewerName}
            onAnswer={handlers.answer}
            disabled={disabled}
            animate={!seen.has(m.id)}
          />
          </div>
        ))}
        {thinking && <MessageRow m={{ id: "pending", role: "client", text: thinking, at: "" }} active={false} viewerName={viewerName} onAnswer={handlers.answer} disabled animate />}
        {pending && (
          <div className="flex items-center gap-2.5">
            <AgentAvatar />
            <ThinkingLine text={thinkingLine} />
          </div>
        )}
        <div ref={end} />
      </div>
      <Composer projectId={view?.projectId} onSend={handlers.send} onAttach={view ? handlers.attach : undefined} disabled={disabled} placeholder={view ? "Answer in your own words, or ask anything" : "What do you need made?"} />
    </section>
  );
}
