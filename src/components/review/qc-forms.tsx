"use client";

import { useActionState, useState } from "react";
import { acceptFlagAction, sendToClientAction, type QcState } from "@/lib/actions/qc-actions";
import { pillClass } from "@/components/ds/button";
import { cn } from "@/lib/utils";

/** "Accept as is": opens a reason field; the action refuses an empty reason too. */
export function AcceptAsIs({ flagId }: { flagId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<QcState, FormData>(acceptFlagAction, {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] text-brand-ink underline underline-offset-2 hover:no-underline">
        Accept as is
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-col gap-2">
      <input type="hidden" name="flagId" value={flagId} />
      <label className="sr-only" htmlFor={`reason-${flagId}`}>
        Why it&apos;s fine as it is
      </label>
      <textarea
        id={`reason-${flagId}`}
        name="reason"
        required
        minLength={3}
        rows={2}
        autoFocus
        placeholder="Why it's fine as it is (kept in the decision log)"
        className="w-full resize-none rounded-[10px] border border-brand-outline bg-white px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
      />
      <span className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={pillClass("primary", "sm")}>
          {pending ? "Saving…" : "Accept"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-brand-ink-2 underline underline-offset-2">
          Cancel
        </button>
      </span>
      {state.error && <span className="text-[12px] text-ds-danger-text">{state.error}</span>}
    </form>
  );
}

/** "Send to client": enabled only when the gate is open; says why when it isn't. */
export function SendToClient({ projectId, canSend, blockers }: { projectId: string; canSend: boolean; blockers: string[] }) {
  const [state, action, pending] = useActionState<QcState, FormData>(sendToClientAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="projectId" value={projectId} />
      <button
        type="submit"
        disabled={!canSend || pending}
        title={canSend ? undefined : blockers.join(" · ")}
        className={cn(pillClass("primary"), "disabled:bg-brand-chip disabled:text-brand-mute disabled:opacity-100")}
      >
        {pending ? "Sending…" : "Send to client"}
      </button>
      {state.error && <span className="max-w-[260px] text-right text-[12px] text-ds-danger-text">{state.error}</span>}
    </form>
  );
}
