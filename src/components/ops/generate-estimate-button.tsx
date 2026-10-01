"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { generateEstimateWithAiAction, type GenerateEstimateState } from "@/lib/actions/ops-ai-actions";

const initialState: GenerateEstimateState = {};

export function GenerateEstimateButton({ projectId, clientId }: { projectId: string; clientId: string }) {
  const [state, formAction, pending] = useActionState(generateEstimateWithAiAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="clientId" value={clientId} />
      <Button type="submit" disabled={pending}>
        {pending ? "Scoping with AI…" : "Generate estimate with AI"}
      </Button>
      {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
    </form>
  );
}
