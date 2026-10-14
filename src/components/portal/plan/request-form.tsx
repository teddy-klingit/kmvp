"use client";

import { useActionState, useState } from "react";
import { pillClass } from "@/components/ds/button";
import { submitRequestAction, type PlanRequestState } from "@/lib/actions/plan-request-actions";

/**
 * One request on Settings → Plan (extra creative credits, an AI top-up, an extra project, pause, Per request): the
 * rule in one line and the price before sending. Options change the payload (and the price shown).
 */
export function RequestForm({ kind, title, rule, options, note, admin, cta }: { kind: string; title: string; rule: string; options?: { label: string; payload: Record<string, unknown>; price: string }[]; note?: string; admin: boolean; cta: string }) {
  const [state, action, pending] = useActionState<PlanRequestState, FormData>(submitRequestAction, {});
  const [pick, setPick] = useState(0);
  const opt = options?.[pick];
  return (
    <form action={action} className="flex flex-col gap-3 px-6 py-5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="payload" value={JSON.stringify(opt?.payload ?? {})} />
      <span className="text-[16px]">{title}</span>
      <span className="text-[13px] text-brand-ink-2">{rule}</span>
      {options && options.length > 1 && (
        <select aria-label={title} value={pick} onChange={(e) => setPick(Number(e.target.value))} disabled={!admin} className="h-10 rounded-[10px] border border-brand-outline bg-white px-3 text-[14px]">
          {options.map((o, i) => (
            <option key={o.label} value={i}>
              {o.label} · {o.price}
            </option>
          ))}
        </select>
      )}
      {options && options.length === 1 && <span className="text-[14px]">{options[0].label} · <b className="font-semibold">{options[0].price}</b></span>}
      {note && <textarea name="note" rows={2} placeholder={note} disabled={!admin} className="rounded-[10px] border border-brand-outline bg-white px-3 py-2 text-[14px]" />}
      {admin && (
        <button type="submit" disabled={pending} className={pillClass("secondary", "sm") + " self-start"}>
          {pending ? "Sending…" : cta}
        </button>
      )}
      {(state.error || state.ok) && <span className={state.error ? "text-[13px] text-ds-danger-text" : "text-[13px]"}>{state.error ?? state.ok}</span>}
    </form>
  );
}
