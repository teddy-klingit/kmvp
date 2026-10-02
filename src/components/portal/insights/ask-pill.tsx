"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { askMarketIntelligenceQuestionAction, type AskQuestionState } from "@/lib/actions/market-intelligence-actions";

type Question = { id: string; question: string; answer: string };

/**
 * "Ask anything" as a pill input in the Insights header (it replaces the old fixed bottom bar). The
 * answer opens in a panel under the input; earlier questions are one click away.
 */
export function AskPill({ recent }: { recent: Question[] }) {
  const [state, formAction, pending] = useActionState<AskQuestionState, FormData>(askMarketIntelligenceQuestionAction, {});
  // The panel opens by itself for each new answer (until closed), or when the input is focused.
  const [closedFor, setClosedFor] = useState<AskQuestionState | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const open = focusOpen || (Boolean(state.answer || state.error) && closedFor !== state);
  const setOpen = (v: boolean) => {
    setFocusOpen(v);
    if (!v) setClosedFor(state);
  };

  useEffect(() => {
    if (state.answer) formRef.current?.reset();
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !boxRef.current?.contains(e.target as Node)) {
        setFocusOpen(false);
        setClosedFor(state);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, state]);

  const past = recent.filter((q) => q.question !== state.question);

  return (
    <div ref={boxRef} className="relative w-full min-[700px]:w-[420px]">
      <form ref={formRef} action={formAction} className="flex h-11 items-center gap-2 rounded-full border border-brand-rule bg-white pl-[18px] pr-1.5">
        <label htmlFor="insights-ask" className="sr-only">
          Ask about your marketing
        </label>
        <input
          id="insights-ask"
          name="question"
          type="text"
          autoComplete="off"
          placeholder="Ask anything, e.g. is my CTR going up?"
          onFocus={() => (state.answer || past.length > 0) && setOpen(true)}
          className="h-full min-w-0 flex-1 border-none bg-transparent text-[14px] text-brand-ink outline-none placeholder:text-brand-ink-2"
          data-gramm="false"
          data-lt-active="false"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full bg-brand-ink px-3.5 font-brand-mono text-[12px] text-white hover:bg-black disabled:opacity-70"
        >
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          Ask
        </button>
      </form>

      {open && (state.answer || state.error || past.length > 0) && (
        <div role="dialog" aria-label="Answer" className="absolute right-0 top-[52px] z-30 flex max-h-[min(480px,70vh)] w-full flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_12px_40px_rgba(30,30,30,0.14)]">
          <div className="flex items-center gap-2 border-b border-brand-line px-5 py-3">
            <span className="flex-1 font-brand-mono text-[11px] text-brand-ink-2">{state.answer ? "ANSWER" : "PAST QUESTIONS"}</span>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="flex size-8 items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-chip">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
            {state.error && <p className="m-0 text-[14px] text-ds-danger-text">{state.error}</p>}
            {state.answer && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold">{state.question}</span>
                <p className="m-0 whitespace-pre-line text-[14px] leading-[1.55]">{state.answer}</p>
              </div>
            )}
            {past.length > 0 &&
              (state.answer && !showPast ? (
                <button type="button" onClick={() => setShowPast(true)} className="self-start font-brand-mono text-[12px] text-brand-ink underline underline-offset-4">
                  {past.length} EARLIER QUESTION{past.length === 1 ? "" : "S"}
                </button>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-4 p-0">
                  {past.map((q) => (
                    <li key={q.id} className="flex flex-col gap-1">
                      <span className="text-[13px] font-semibold">{q.question}</span>
                      <span className="line-clamp-4 text-[13px] leading-[1.5] text-brand-ink-2">{q.answer}</span>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
