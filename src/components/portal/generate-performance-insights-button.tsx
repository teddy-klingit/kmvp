"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  generatePerformanceInsightsAction,
  type GeneratePerformanceInsightsState,
} from "@/lib/actions/performance-actions";

const initialState: GeneratePerformanceInsightsState = {};

export function GeneratePerformanceInsightsButton({ label }: { label: string }) {
  const [state, formAction, pending] = useActionState(generatePerformanceInsightsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <Button type="submit" size="sm" variant="accent" disabled={pending} className="gap-1.5">
        <Sparkles className="size-3.5" />
        {pending ? "Analyzing performance…" : label}
      </Button>
      {state.error && <p className="text-xs text-danger-foreground">{state.error}</p>}
    </form>
  );
}
