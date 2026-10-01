"use client";

import { useActionState, useRef, useState } from "react";
import { MessageCircleQuestion, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThinkingBubble } from "@/components/portal/thinking-bubble";
import { askMarketIntelligenceQuestionAction, type AskQuestionState } from "@/lib/actions/market-intelligence-actions";

const initialState: AskQuestionState = {};

type Question = { id: string; question: string; answer: string };

export function AskMarketIntelligenceForm({ recentQuestions = [] }: { recentQuestions?: Question[] }) {
  const [state, formAction, pending] = useActionState(askMarketIntelligenceQuestionAction, initialState);
  const [historyOpen, setHistoryOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <MessageCircleQuestion className="size-3.5" />
          Ask anything — market, performance, or SEO
        </p>
        {recentQuestions.length > 0 && (
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            {historyOpen ? "Hide" : "Show"} {recentQuestions.length} past question{recentQuestions.length === 1 ? "" : "s"}
            {historyOpen ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
          </button>
        )}
      </div>

      {historyOpen && (
        <div className="flex max-h-56 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-paper p-3">
          {recentQuestions.map((q) => (
            <div key={q.id} className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-foreground">You asked: {q.question}</p>
              <p className="text-xs text-muted-foreground">{q.answer}</p>
            </div>
          ))}
        </div>
      )}

      {pending ? (
        <ThinkingBubble label="Reading the signals…" />
      ) : (
        <form
          ref={formRef}
          action={(formData) => {
            formAction(formData);
            formRef.current?.reset();
          }}
          className="flex gap-2"
        >
          <Input name="question" placeholder="e.g. Is my CTR trending up or down this month?" className="flex-1" />
          <Button type="submit" size="sm">
            Ask
          </Button>
        </form>
      )}
      {state.error && <p className="text-xs text-danger-foreground">{state.error}</p>}
    </div>
  );
}
