"use client";

import { useActionState, useState } from "react";
import { pillClass } from "@/components/ds/button";
import { planFeedAction, type FeedState } from "@/lib/actions/plan-item-actions";

/** Subscribe: a private iCal URL for this user's plan (paste it into Google Calendar or Outlook); renewing revokes the old one. */
export function Subscribe() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FeedState, FormData>(planFeedAction, {});
  const [copied, setCopied] = useState(false);
  const url = state.url && typeof window !== "undefined" ? `${window.location.origin}${state.url}` : null;
  return (
    <span className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={pillClass("secondary", "md")}>
        Subscribe
      </button>
      {open && (
        <div className="absolute right-0 top-14 z-40 flex w-[min(380px,85vw)] flex-col gap-3 rounded-[12px] bg-white p-5 text-[14px] shadow-[0_12px_40px_rgba(30,30,30,0.18)]">
          <span className="text-[16px]">Your plan in your calendar</span>
          <span className="text-brand-ink-2">A private link only for you. Anyone with it can see your plan, so keep it to yourself.</span>
          {url ? (
            <>
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar link" className="h-10 rounded-[8px] border border-brand-outline px-3 font-brand-mono text-[12px]" />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false))} className={pillClass("primary", "sm")}>
                  {copied ? "Copied" : "Copy link"}
                </button>
                <form action={action}>
                  <input type="hidden" name="renew" value="1" />
                  <button type="submit" className={pillClass("secondary", "sm")}>
                    New link (old one stops)
                  </button>
                </form>
              </div>
            </>
          ) : (
            <form action={action}>
              <button type="submit" disabled={pending} className={pillClass("primary", "sm")}>
                {pending ? "Making your link…" : "Get my calendar link"}
              </button>
            </form>
          )}
        </div>
      )}
    </span>
  );
}
