"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ds/button";
import { ThinkingBubble } from "@/components/portal/thinking-bubble";

type EmptyState = Record<string, never>;
type AnswerAction = (prev: EmptyState, formData: FormData) => Promise<EmptyState>;

function useCyclingLabel(active: boolean, steps: string[], intervalMs = 1700) {
  const [i, setI] = useState(0);
  // Restart from the first label each time it becomes active.
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setI(0);
  }
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setI((v) => (v + 1) % steps.length), intervalMs);
    return () => clearInterval(id);
  }, [active, steps, intervalMs]);
  return steps[i];
}

export function AnswerChips({
  action,
  hidden,
  quickAnswers,
  customPlaceholder = "Or type your own answer",
  thinkingLabel = "Thinking of what to ask next…",
}: {
  action: AnswerAction;
  hidden: Record<string, string>;
  quickAnswers: string[];
  customPlaceholder?: string;
  thinkingLabel?: string | string[];
}) {
  const [, formAction, pending] = useActionState(action, {});
  const steps = Array.isArray(thinkingLabel) ? thinkingLabel : [thinkingLabel];
  const label = useCyclingLabel(pending, steps);

  if (pending) return <ThinkingBubble label={label} />;

  return (
    <div className="flex animate-in fade-in flex-col gap-3 duration-150">
      <div className="flex flex-wrap gap-2">
        {quickAnswers.map((preset) => (
          <form key={preset} action={formAction}>
            {Object.entries(hidden).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <input type="hidden" name="answer" value={preset} />
            <button
              type="submit"
              className="h-11 rounded-full sm:h-9 border border-ds-control-border bg-white px-3.5 text-[13px] font-medium text-ds-text transition-colors hover:border-ds-text active:scale-[0.98]"
            >
              {preset}
            </button>
          </form>
        ))}
      </div>

      <form action={formAction} className="flex gap-2">
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="sr-only" htmlFor="brief-answer">
          Your answer
        </label>
        <input
          id="brief-answer"
          name="answer"
          placeholder={customPlaceholder}
          required
          className="h-10 min-w-0 flex-1 rounded-[8px] border border-ds-control-border bg-white px-3 text-[14px] text-ds-text outline-none placeholder:text-ds-text-3 focus:border-ds-text-3"
        />
        <Button type="submit" variant="primary" size="lg">
          Send
        </Button>
      </form>
    </div>
  );
}
