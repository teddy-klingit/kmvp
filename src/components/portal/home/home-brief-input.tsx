"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ds/button";
import { startBriefFromIntakeAction, type IntakeState } from "@/lib/actions/brief-intake-actions";

/**
 * "What do you need?" — submitting starts a new brief with this text as the first answer, through the
 * same intake action as /projects/new, so the "Continue your draft" check applies here too.
 */
export function HomeBriefInput() {
  const [state, action, pending] = useActionState<IntakeState, FormData>(startBriefFromIntakeAction, {});
  const [text, setText] = useState("");
  const value = text || state.submitted?.rawText || "";

  return (
    <section aria-label="Start a project" className="flex flex-col gap-3 rounded-[12px] border border-ds-border bg-ds-card px-4 py-4 shadow-ds sm:pl-6">
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="new-project" className="sr-only">
          What do you need?
        </label>
        <input
          id="new-project"
          name="rawText"
          value={value}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
          placeholder="What do you need? e.g. a 10-slide sales deck for merchant partners"
          className="h-11 min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ds-text outline-none placeholder:text-ds-text-3 sm:h-10"
        />
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? "Reading your brief…" : "Start brief"}
        </Button>
      </form>
      {state.error && <p className="m-0 text-[13px] text-ds-danger-text">{state.error}</p>}
      {state.existingDraft && (
        <div className="flex flex-col gap-3 rounded-[10px] bg-ds-subtle-2 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-medium text-ds-text">You already have an unfinished draft like this</span>
            <span className="truncate text-[13px] text-ds-text-2">{state.existingDraft.name}</span>
          </div>
          <form action={action} className="flex flex-col-reverse gap-2 sm:flex-row">
            <input type="hidden" name="rawText" value={value} />
            <Button type="submit" name="startNew" value="1" variant="ghost" size="md">
              Start a new one
            </Button>
            <Button asChild variant="secondary" size="md">
              <Link href={`/projects/${state.existingDraft.id}`}>Continue your draft</Link>
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}

/**
 * Brand-theme version (ClientHome.dc.html): the dark "What do you need made?" card with an orange round
 * go button. Same intake action, so the "Continue your draft" check applies.
 */
export function BrandBriefInput() {
  const [state, action, pending] = useActionState<IntakeState, FormData>(startBriefFromIntakeAction, {});
  const [text, setText] = useState("");
  const value = text || state.submitted?.rawText || "";
  return (
    <section id="new-need" aria-label="Start something new" className="flex scroll-mt-4 flex-col gap-4 rounded-[12px] bg-brand-ink p-[22px] text-brand-cream">
      <span className="font-brand-mono text-[12px] text-brand-lime">NEW PROJECT</span>
      <span className="text-[22px] font-light leading-[1.25]">What do you need made?</span>
      <form action={action} className="flex items-center gap-2 border-b border-brand-ink-2 pb-2">
        <label htmlFor="new-need-input" className="sr-only">
          Describe what you need
        </label>
        <input
          id="new-need-input"
          name="rawText"
          value={value}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
          placeholder="e.g. a 10-slide sales deck"
          className="min-w-0 flex-1 border-0 bg-transparent py-1.5 font-brand-mono text-[13px] text-brand-cream outline-none placeholder:text-brand-cream/50"
        />
        <button
          type="submit"
          aria-label="Start brief"
          disabled={pending}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-orange text-brand-ink disabled:opacity-60 min-[900px]:size-10"
        >
          <ArrowRight className="size-5" strokeWidth={1.75} />
        </button>
      </form>
      {pending && <span className="font-brand-mono text-[12px] text-brand-cream/70">Reading your brief…</span>}
      {state.error && <span className="text-[13px] text-brand-peach">{state.error}</span>}
      {state.existingDraft && (
        <div className="flex flex-col gap-3 rounded-[10px] bg-white/10 p-3.5">
          <span className="text-[14px]">
            You already have an unfinished draft like this: <span className="text-brand-lime">{state.existingDraft.name}</span>
          </span>
          <form action={action} className="flex flex-wrap gap-2">
            <input type="hidden" name="rawText" value={value} />
            <Link
              href={`/projects/${state.existingDraft.id}`}
              className="inline-flex min-h-11 items-center rounded-full bg-brand-lime px-4 font-brand-mono text-[12px] text-brand-ink no-underline min-[900px]:min-h-9"
            >
              Continue your draft
            </Link>
            <button
              type="submit"
              name="startNew"
              value="1"
              className="inline-flex min-h-11 items-center rounded-full border border-brand-ink-2 px-4 font-brand-mono text-[12px] text-brand-cream min-[900px]:min-h-9"
            >
              Start a new one
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
