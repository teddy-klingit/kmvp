"use client";

import { useActionState } from "react";
import { todayNudgeAction } from "@/lib/actions/today-actions";

/** Plan's one-click "Send nudge": the drafted reminder, sent in-app; also ticks the same task off Today. */
export function SendNudge({ itemId, draft, label, clientId, primary = true }: { itemId: string; draft: string; label: string; clientId: string; primary?: boolean }) {
  const [state, act, pending] = useActionState(todayNudgeAction, {});
  if (state.ok) return <span className="text-[13px] text-[#5E6B2A]">Sent</span>;
  return (
    <form action={act}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="text" value={draft} />
      <input type="hidden" name="key" value={`PLAN:${itemId}`} />
      <input type="hidden" name="label" value={label} />
      <input type="hidden" name="clientId" value={clientId} />
      <button type="submit" disabled={pending} className={primary ? "inline-flex h-9 items-center rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white" : "inline-flex h-9 items-center rounded-full border border-[#CFC8B8] bg-white px-4 font-brand-mono text-[12px]"}>
        Send nudge
      </button>
      {state.error && <span className="ml-2 text-[12px] text-[#A8321F]">{state.error}</span>}
    </form>
  );
}
