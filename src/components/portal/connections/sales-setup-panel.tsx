"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { salesFinishAction, salesLoginAction, salesStagesAction } from "@/lib/actions/sales-connection-actions";
import { KLINGIT_STAGES, stepsFor, type KlingitStage, type SalesHealth, type SalesSettings, type SalesSourceKey } from "@/lib/sales-sources";
import { cn } from "@/lib/utils";

const noop = () => () => {};
const pill = (primary: boolean) => cn("h-10 rounded-full px-4 font-brand-mono text-[12px] disabled:opacity-50", primary ? "bg-brand-orange text-white" : "border border-[#CFC8B8] bg-white text-brand-ink");
const CURRENCIES = ["EUR", "SEK", "NOK", "DKK", "GBP", "USD"];

/**
 * Connect a sales source (Phase V, design ConnectCRM): a right-hand panel in 3 steps for a CRM (log in · map your
 * stages · choose what to sync), 2 for a shop or email tool. Read-only access; only totals are synced.
 */
export function SalesSetupButton(props: { source: SalesSourceKey; name: string; monogram: string; tone: string; status: string | null; settings: SalesSettings | null; health: SalesHealth | null; demo: boolean; label: string; primary?: boolean; open?: boolean }) {
  const [open, setOpen] = useState(Boolean(props.open));
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("h-9 rounded-full px-3.5 font-brand-mono text-[12px]", props.primary ? "bg-brand-ink text-white" : "border border-[#CFC8B8] bg-white text-brand-ink")}>
        {props.label}
      </button>
      {open && mounted && createPortal(<Panel {...props} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Panel({ source, name, monogram, tone, status: initialStatus, settings: initialSettings, health, demo, onClose }: Parameters<typeof SalesSetupButton>[0] & { onClose: () => void }) {
  const steps = stepsFor(source);
  const [status, setStatus] = useState(initialStatus);
  const [settings, setSettings] = useState<SalesSettings | null>(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // A disconnected source, or one whose access expired (Reconnect), logs in again.
  const loggedIn = Boolean(settings?.login) && status !== "disconnected" && status !== "needs_reconnect";
  // Where we are: 1 until logged in, then the saved step (CRMs map stages first), the last step when connected.
  const stepIndex = !loggedIn ? 0 : status === "connected" ? steps.length - 1 : steps.length === 3 ? (settings?.step === 3 ? 2 : 1) : 1;
  const [mapping, setMapping] = useState<Record<string, KlingitStage>>(() => Object.fromEntries((initialSettings?.stages ?? []).map((s) => [s.name, s.mapTo])));
  const [pipes, setPipes] = useState<string[]>(() => (initialSettings?.pipelines ?? []).filter((p) => p.selected).map((p) => p.name));
  const [currency, setCurrency] = useState(initialSettings?.currency ?? "EUR");
  const [history, setHistory] = useState(initialSettings?.historyMonths ?? 12);
  const [back, setBack] = useState(false);
  const shown = back ? Math.max(0, stepIndex - 1) : stepIndex;

  const run = (fn: () => Promise<{ error?: string; ok?: string; settings?: SalesSettings; status?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) return setError(r.error);
      if (r.ok) setNote(r.ok);
      if (r.status) setStatus(r.status);
      if (r.settings) {
        setSettings(r.settings);
        setMapping(Object.fromEntries((r.settings.stages ?? []).map((s) => [s.name, s.mapTo])));
        setPipes((r.settings.pipelines ?? []).filter((p) => p.selected).map((p) => p.name));
        if (r.settings.currency) setCurrency(r.settings.currency);
      }
      setBack(false);
    });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Connect ${name}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 hidden bg-[rgba(30,30,30,0.18)] sm:block" />
      <div className="relative flex h-full w-full flex-col gap-5 overflow-y-auto bg-white px-6 py-6 shadow-[-8px_0_32px_rgba(30,30,30,0.12)] sm:w-[500px]" style={{ paddingTop: "calc(24px + env(safe-area-inset-top, 0px))" }}>
        <header className="flex items-start gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[10px] font-brand-mono text-[12px] font-semibold", tone)}>{monogram}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <h2 className="m-0 text-[22px] font-light">Connect {name}</h2>
            <span className="text-[13px] text-brand-ink-2">{loggedIn ? `Logged in as ${settings?.login} · read-only access` : "Read-only access · totals only"}</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full hover:bg-brand-page">
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </header>

        <ol className="m-0 grid list-none gap-2 p-0" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((s, i) => (
            <li key={s} className="flex flex-col gap-1.5">
              <span className={cn("h-1 rounded-full", i <= shown ? "bg-brand-ink" : "bg-brand-track")} />
              <span className={cn("text-[11px]", i === shown ? "text-brand-ink" : "text-brand-ink-2")}>
                {i + 1}. {s}
              </span>
            </li>
          ))}
        </ol>

        {note && status === "requested" ? (
          <p className="m-0 rounded-[10px] bg-brand-page px-4 py-3 text-[14px]">{note}</p>
        ) : shown === 0 ? (
          <div className="flex flex-col gap-3 text-[14px] leading-[1.55]">
            <p className="m-0">Log in to {name} with an account that can see {source === "Shopify" ? "orders" : source === "Klaviyo" ? "campaigns and flows" : "deals and pipelines"}. Klingit asks for read-only access and never writes to it.</p>
            {!demo && <p className="m-0 text-brand-ink-2">Klingit sets this connection up with you: we&apos;ll be in touch to finish it.</p>}
            {status === "requested" && <p className="m-0 text-brand-ink-2">Asked Klingit to connect it. You&apos;ll get a notification when it&apos;s ready.</p>}
          </div>
        ) : steps[shown] === "Map your stages" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="m-0 text-[16px] font-normal">Map your deal stages to ours</h3>
              <p className="m-0 text-[13px] text-brand-ink-2">So we can count leads, qualified leads, deals and customers the same way for every client. We pre-filled it from your stage names.</p>
            </div>
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="text-left font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-ink-2">
                  <th className="py-2 font-normal">Your stage in {name}</th>
                  <th className="py-2 font-normal">Klingit stage</th>
                </tr>
              </thead>
              <tbody>
                {(settings?.stages ?? []).map((s) => (
                  <tr key={s.name} className="border-t border-brand-line">
                    <td className="py-2.5 pr-3">
                      <span className="block">{s.name}</span>
                      <span className="text-[12px] text-brand-ink-2">{s.deals12m.toLocaleString("en-GB")} deals last 12 months</span>
                    </td>
                    <td className="py-2.5">
                      <select aria-label={`Klingit stage for ${s.name}`} value={mapping[s.name]} onChange={(e) => setMapping({ ...mapping, [s.name]: e.target.value as KlingitStage })} className="h-10 w-full rounded-full border border-[#CFC8B8] bg-white px-3 text-[14px]">
                        {KLINGIT_STAGES.map((k) => (
                          <option key={k.key} value={k.key}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="rounded-[10px] bg-brand-page px-4 py-3 text-[13px] leading-[1.55]">
              <b className="font-semibold">How we find the source of each deal</b>
              <p className="m-0 mt-1 text-brand-ink-2">
                From the UTM tags on the first visit ({name} &ldquo;Original source&rdquo;).{health ? ` ${Math.round(health.withSource * 100)}% of ${health.of} last year have one.` : ""} Everything Klingit ships from now on is tagged automatically.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 text-[14px]">
            <h3 className="m-0 text-[16px] font-normal">Choose what to sync</h3>
            {(settings?.pipelines ?? []).length > 0 && (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1 text-[13px] text-brand-ink-2">{source === "HubSpot" ? "Pipelines" : source === "Klaviyo" ? "What to count" : "Store"}</legend>
                {(settings?.pipelines ?? []).map((p) => (
                  <label key={p.name} className="flex items-center gap-2">
                    <input type="checkbox" checked={pipes.includes(p.name)} onChange={(e) => setPipes(e.target.checked ? [...pipes, p.name] : pipes.filter((x) => x !== p.name))} className="size-4 accent-[#1E1E1E]" />
                    {p.name}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="flex items-center justify-between gap-3">
              Currency
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-10 rounded-full border border-[#CFC8B8] bg-white px-3">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3">
              History
              <select value={history} onChange={(e) => setHistory(Number(e.target.value))} className="h-10 rounded-full border border-[#CFC8B8] bg-white px-3">
                {[6, 12, 24].map((m) => (
                  <option key={m} value={m}>
                    {m} months
                  </option>
                ))}
              </select>
            </label>
            <p className="m-0 text-[13px] text-brand-ink-2">Only totals per day, channel and campaign are synced. No names, emails, phone numbers or addresses.</p>
            {status === "connected" && <p className="m-0 text-[13px] text-[#5E6B2A]">Connected. Changes apply from the next sync.</p>}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3">
          {error && <p className="m-0 text-[13px] text-[#A8321F]">{error}</p>}
          <span className="flex justify-end gap-2">
            {shown > 0 && status !== "connected" ? (
              <button type="button" onClick={() => setBack(true)} disabled={pending} className={pill(false)}>
                Back
              </button>
            ) : (
              <button type="button" onClick={onClose} className={pill(false)}>
                {status === "connected" || status === "requested" ? "Close" : "Cancel"}
              </button>
            )}
            {status !== "requested" &&
              (shown === 0 ? (
                <button type="button" disabled={pending} onClick={() => (loggedIn ? setBack(false) : run(() => salesLoginAction(source)))} className={pill(true)}>
                  {loggedIn ? "Next" : demo ? `Log in to ${name}` : "Ask Klingit to connect it"}
                </button>
              ) : steps[shown] === "Map your stages" ? (
                <button type="button" disabled={pending} onClick={() => run(() => salesStagesAction(source, mapping))} className={pill(true)}>
                  Next: choose what to sync
                </button>
              ) : (
                <button type="button" disabled={pending} onClick={() => run(() => salesFinishAction(source, { pipelines: pipes, currency, historyMonths: history }))} className={pill(true)}>
                  {status === "connected" ? "Save" : "Start syncing"}
                </button>
              ))}
          </span>
        </div>
      </div>
    </div>
  );
}
