"use client";

import { useActionState } from "react";
import { askForIdeaAction, type AskIdeaState } from "@/lib/actions/insight-actions";

/** "Ask for an idea" on a finding: one click, then it says who's on it. */
const LOOK = {
  link: "text-[13px] text-brand-ink underline underline-offset-4 hover:text-brand-ink-2",
  outline: "inline-flex h-9 items-center rounded-full border border-brand-ink px-4 font-brand-mono text-[12px] text-brand-ink hover:bg-brand-ink hover:text-white",
  dark: "inline-flex h-9 items-center rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white hover:opacity-90",
};

export function AskIdeaButton({ insightId, asked, pm, about, variant = "link" }: { insightId?: string; asked: boolean; pm: string; about?: { question: string; value: string; sources: string[]; href: string; kind: string }; variant?: keyof typeof LOOK }) {
  const [state, action, pending] = useActionState<AskIdeaState, FormData>(askForIdeaAction, {});
  if (asked || state.ok) return <span className="text-[12px] text-brand-ink-2">Asked · {pm} replies in Messages</span>;
  return (
    <form action={action} className="flex items-center gap-2">
      {insightId && <input type="hidden" name="insightId" value={insightId} />}
      {about && (
        <>
          <input type="hidden" name="question" value={about.question} />
          <input type="hidden" name="value" value={about.value} />
          <input type="hidden" name="sources" value={about.sources.join(",")} />
          <input type="hidden" name="href" value={about.href} />
          <input type="hidden" name="about" value={about.kind} />
        </>
      )}
      <button type="submit" disabled={pending} className={`${LOOK[variant]} disabled:opacity-60 print:hidden`}>
        {pending ? "Asking…" : "Ask for an idea"}
      </button>
      {state.error && <span className="text-[12px] text-brand-orange-text">{state.error}</span>}
    </form>
  );
}
