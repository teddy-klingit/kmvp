"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startBriefFromInspirationAction, type IntakeState } from "@/lib/actions/brief-intake-actions";

const initialState: IntakeState = {};

export function InspirationExploreButton({
  inspirationId,
  label = "Explore",
  variant = "secondary",
}: {
  inspirationId: string;
  label?: string;
  variant?: "secondary" | "primary";
}) {
  const [state, formAction, pending] = useActionState(startBriefFromInspirationAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="inspirationId" value={inspirationId} />
      <Button type="submit" size="sm" variant={variant} disabled={pending} className="gap-1.5">
        {pending ? (
          <>
            <Sparkles className="size-3.5 animate-pulse" />
            Setting up…
          </>
        ) : (
          label
        )}
      </Button>
      {state.error && <p className="max-w-48 text-right text-xs text-danger-foreground">{state.error}</p>}
    </form>
  );
}
