"use client";

import { useActionState } from "react";
import { pillClass } from "@/components/ds/button";
import { askForMoreAction, anotherRouteAction, type AskState } from "@/lib/actions/opportunity-actions";

/** "Ask for more" (06) and "Ask for another route" (07): both on the client's AI credits. */
export function AskForMore() {
  const [state, action, pending] = useActionState<AskState, FormData>(askForMoreAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <button type="submit" disabled={pending} className={pillClass("secondary", "sm")}>
        {pending ? "Looking…" : "Ask for more"}
      </button>
      <span className="text-[12px] text-brand-ink-2">Uses a few AI credits. The weekly look is on Klingit.</span>
      {(state.error || state.ok) && <span className={state.error ? "text-[13px] text-ds-danger-text" : "text-[13px]"}>{state.error ?? state.ok}</span>}
    </form>
  );
}

export function AnotherRoute({ id }: { id: string }) {
  const [state, action, pending] = useActionState<AskState, FormData>(anotherRouteAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="font-brand-mono text-[12px] uppercase text-brand-ink underline underline-offset-4">
        {pending ? "Thinking…" : "Ask for another route"}
      </button>
      {state.error && <span className="text-[12px] text-ds-danger-text">{state.error}</span>}
    </form>
  );
}
