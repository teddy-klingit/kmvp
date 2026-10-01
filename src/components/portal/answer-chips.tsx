"use client";

import { useActionState, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThinkingBubble } from "@/components/portal/thinking-bubble";

type EmptyState = Record<string, never>;
type AnswerAction = (prev: EmptyState, formData: FormData) => Promise<EmptyState>;

function useCyclingLabel(active: boolean, steps: string[], intervalMs = 1700) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) {
      setI(0);
      return;
    }
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
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-[color,border-color,background-color,transform] duration-100 ease-out hover:border-primary hover:text-primary active:scale-95"
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
        <Input name="answer" placeholder={customPlaceholder} required className="flex-1" />
        <Button type="submit">Send</Button>
      </form>
    </div>
  );
}
