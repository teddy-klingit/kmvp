"use client";

import { useActionState } from "react";
import { askForIdeaAction, type AskIdeaState } from "@/lib/actions/insight-actions";

/** "Ask for an idea" on a finding: one click, then it says who's on it. */
export function AskIdeaButton({ insightId, asked, pm }: { insightId: string; asked: boolean; pm: string }) {
  const [state, action, pending] = useActionState<AskIdeaState, FormData>(askForIdeaAction, {});
  if (asked || state.ok) return <span className="text-[12px] text-brand-ink-2">Asked · {pm} replies in Messages</span>;
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="insightId" value={insightId} />
      <button type="submit" disabled={pending} className="text-[13px] text-brand-ink underline underline-offset-4 hover:text-brand-ink-2 disabled:opacity-60 print:hidden">
        {pending ? "Asking…" : "Ask for an idea"}
      </button>
      {state.error && <span className="text-[12px] text-brand-orange-text">{state.error}</span>}
    </form>
  );
}
