"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
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
