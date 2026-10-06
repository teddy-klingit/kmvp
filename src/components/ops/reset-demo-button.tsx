"use client";

import { useActionState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { resetOuhersDemoAction, type ResetState } from "@/lib/actions/demo-actions";
import { pillClass } from "@/components/ds/button";

/** Staff only, on the demo client: puts the whole demo account back to its seeded state. */
export function ResetDemoButton({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetOuhersDemoAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Reset the demo? Everything changed in this demo account goes back to the seed.")) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <button type="submit" disabled={pending} className={pillClass("secondary", "sm")}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" strokeWidth={1.75} />}
        {pending ? "Resetting…" : "Reset demo"}
      </button>
      {state.ok && <span className="max-w-[320px] text-right text-[12px] text-brand-ink-2">{state.ok}</span>}
      {state.error && <span className="max-w-[320px] text-right text-[12px] text-ds-danger-text">{state.error}</span>}
    </form>
  );
}
