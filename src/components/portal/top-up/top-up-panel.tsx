"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { askAdminTopUpAction, setAutoTopUpAction, topUpAction, topUpPanelAction, type TopUpPanel } from "@/lib/actions/top-up-actions";
import { cn } from "@/lib/utils";

const money = (n: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

/**
 * "Top up" (Phase U, design ClientTopUp): a button that opens the right-hand top-up panel over the page. Options with
 * how long each lasts at your pace, automatic top-up, credits added right away, on the next invoice, and they roll
 * over. Members get "Ask {admin} to top up" instead. ?topup=1 (from a notification) opens it on arrival.
 */
export function TopUpButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const params = useSearchParams();
  const [open, setOpen] = useState(() => params?.get("topup") === "1");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <Panel onClose={() => setOpen(false)} />}
    </>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<TopUpPanel | null>(null);
  const [pick, setPick] = useState(0);
  const [state, act, pending] = useActionState(topUpAction, {});
  const [asked, setAsked] = useState(false);
  const [, start] = useTransition();
  const load = () => topUpPanelAction().then(setData);
  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (state.ok) load();
  }, [state.ok]);
  const o = data?.options[pick];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Top up AI credits">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 hidden bg-[rgba(30,30,30,0.18)] sm:block" />
      <div className="relative flex h-full w-full flex-col gap-5 overflow-y-auto bg-white px-6 py-6 shadow-[-8px_0_32px_rgba(30,30,30,0.12)] sm:w-[460px]" style={{ paddingTop: "calc(24px + env(safe-area-inset-top, 0px))" }}>
        <header className="flex items-start justify-between gap-3">
          <h2 className="m-0 text-[22px] font-light">Top up AI credits</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full hover:bg-brand-page">
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </header>
        {!data ? (
          <p className="text-[14px] text-brand-ink-2">Loading…</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="flex justify-between text-[13px]">
                <span>
                  {data.left.toLocaleString("en-GB")} left of {data.allowance.toLocaleString("en-GB")} this month
                </span>
                <span className="text-brand-ink-2">resets {data.resets}</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-brand-track">
                <span className="block h-full rounded-full bg-[#B455B6]" style={{ width: `${Math.min(100, data.usedPct)}%` }} />
              </span>
            </div>
            <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
              <legend className="sr-only">How many credits</legend>
              {data.options.map((x) => (
                <label key={x.index} className={cn("flex cursor-pointer items-center gap-3 rounded-[12px] border px-4 py-3.5", pick === x.index ? "border-2 border-brand-ink" : "border-brand-line")}>
                  <input type="radio" name="option" checked={pick === x.index} onChange={() => setPick(x.index)} className="size-4 accent-[#1E1E1E]" />
                  <span className="flex flex-1 flex-col">
                    <span className="text-[16px]">{x.credits.toLocaleString("en-GB")} AI credits</span>
                    <span className="text-[12px] text-brand-ink-2">
                      {x.lasts}
                      {x.save ? ` · save ${x.save}%` : ""}
                    </span>
                  </span>
                  <span className="text-[17px] tabular-nums">{money(x.price, x.currency)}</span>
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-4 rounded-[12px] bg-brand-page px-4 py-3.5">
              <span className="flex flex-1 flex-col">
                <span className="text-[14px]">Top up automatically</span>
                <span className="text-[12px] text-brand-ink-2">
                  Add {data.autoRule.credits.toLocaleString("en-GB")} when below {data.autoRule.below} credits · at most {data.autoRule.maxPerMonth} times a month
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={data.auto}
                disabled={!data.admin}
                onChange={(e) => {
                  const on = e.target.checked;
                  setData({ ...data, auto: on });
                  start(() => setAutoTopUpAction(on).then(() => undefined));
                }}
                className="h-6 w-11 cursor-pointer appearance-none rounded-full bg-brand-line transition-colors before:block before:size-5 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-brand-ink checked:before:translate-x-[22px] disabled:opacity-50"
                aria-label="Top up automatically"
              />
            </label>
            <p className="m-0 text-[13px] leading-[1.5] text-brand-ink-2">
              {data.instant ? "Credits are added right away." : "Klingit approves it, then the credits are added."} {o ? `${money(o.price, o.currency)} goes on your next invoice (${data.nextInvoice}).` : ""}{" "}
              {data.rollover ? "Top-up credits don't expire at the end of the month." : "Top-up credits are for this month."}
            </p>
            <div className="mt-auto flex flex-col gap-3">
              {state.error && <p className="m-0 text-[13px] text-[#A8321F]">{state.error}</p>}
              {state.ok && <p className="m-0 text-[13px] text-[#5E6B2A]">{state.ok}</p>}
              <span className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="h-10 rounded-full border border-[#CFC8B8] px-4 font-brand-mono text-[12px]">
                  {state.ok ? "Close" : "Cancel"}
                </button>
                {data.admin ? (
                  <form action={act}>
                    <input type="hidden" name="option" value={pick} />
                    <button type="submit" disabled={pending || !o} className="h-10 rounded-full bg-brand-orange px-4 font-brand-mono text-[12px] text-white disabled:opacity-50">
                      {o ? `Add ${o.credits.toLocaleString("en-GB")} credits · ${money(o.price, o.currency)}` : "Add credits"}
                    </button>
                  </form>
                ) : (
                  <button type="button" disabled={asked} onClick={() => start(() => askAdminTopUpAction().then(() => setAsked(true)))} className="h-10 rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white disabled:opacity-50">
                    {asked ? `Asked ${data.adminName}` : `Ask ${data.adminName} to top up`}
                  </button>
                )}
              </span>
              <p className="m-0 text-[12px] text-brand-ink-2">Only admins can top up. Members get an “Ask {data.adminName} to top up” button instead.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
