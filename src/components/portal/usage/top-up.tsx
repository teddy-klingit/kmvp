"use client";

import { useActionState, useState } from "react";
import { pillClass } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { requestTopUpAction, type TopUpState } from "@/lib/actions/usage-actions";
import { cn } from "@/lib/utils";

/** Usage → Top up AI credits: pick a bundle and request it; Klingit confirms (no payment in this phase). */
export function TopUp({ bundles, pending, admin }: { bundles: { id: string; size: number; price: string }[]; pending: string | null; admin: boolean }) {
  const [state, action, busy] = useActionState<TopUpState, FormData>(requestTopUpAction, {});
  const [picked, setPicked] = useState(bundles[1]?.id ?? bundles[0]?.id ?? "");
  return (
    <form action={action} className="flex flex-col gap-3 px-6 py-5">
      {bundles.map((b) => (
        <label key={b.id} className={cn("flex cursor-pointer items-center gap-3 rounded-[10px] border px-4 py-3 text-[14px]", picked === b.id ? "border-brand-ink" : "border-brand-line")}>
          <input type="radio" name="bundleId" value={b.id} checked={picked === b.id} onChange={() => setPicked(b.id)} className="accent-[#1E1E1E]" />
          <span className="flex-1">{b.size.toLocaleString("en-GB")} AI credits</span>
          <span className="text-brand-ink-2">{b.price}</span>
        </label>
      ))}
      <span className="text-[12px] leading-[1.5] text-brand-mute">Bundles never expire and are used after your monthly allowance.</span>
      {pending ? (
        <p className="m-0 text-[14px]">{pending}</p>
      ) : (
        <span className="flex flex-wrap items-center justify-between gap-3">
          <button type="submit" disabled={!admin || busy} className={cn(pillClass("primary"), "disabled:opacity-50")} title={admin ? undefined : "Only an admin can top up"}>
            {busy ? "Requesting…" : "Buy bundle"}
          </button>
          <PlaceholderTag>Sizes and prices TBD</PlaceholderTag>
        </span>
      )}
      {state.error && <p className="m-0 text-[13px] text-ds-danger-text">{state.error}</p>}
      {state.ok && <p className="m-0 text-[13px]">{state.ok}</p>}
    </form>
  );
}
