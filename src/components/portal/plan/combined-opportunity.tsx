import Link from "next/link";
import { AlertTriangle, Check, ChevronLeft } from "lucide-react";
import type { Opportunity } from "@/generated/prisma";
import { CONFIDENCE_LABEL, type Combined, type Confidence } from "@/lib/combined";
import { COMBINED_DISMISS_REASONS } from "@/lib/opportunities";
import { addCombinedToPlanAction, dismissOpportunityAction } from "@/lib/actions/opportunity-actions";
import { Chips } from "@/components/insights/source-chip";
import { MessagePmButton } from "@/components/pm-panel/pm-panel-provider";
import { cn } from "@/lib/utils";

const wday = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
const pill = "inline-flex h-10 w-full items-center rounded-full border px-4 text-left font-brand-mono text-[12px] no-underline";

/**
 * An opportunity built from several sources (Phase V, design OpportunityCombined): the action, its expected effect as
 * a range, what it costs and when to decide; "Why we think so" (each claim with its sources and how much data is
 * behind it), "How we got the number", the data checks (and blind spots), and Do it / Not for us. Every number on
 * it was computed in code from the client's own data (lib/combined.ts).
 */
export function CombinedOpportunity({ o, clientName, pmFirst }: { o: Opportunity; clientName: string; pmFirst: string | null }) {
  const c = o.combined as unknown as Combined;
  const confidence = o.confidence as Confidence | null;
  const decideBy = c.decideBy ? new Date(c.decideBy) : null;
  const dismissed = o.status === "dismissed";
  return (
    <div className="flex flex-col gap-6">
      <Link href="/planner/opportunities" className="-mt-2 inline-flex items-center gap-1 self-start text-[13px] text-brand-ink-2 no-underline hover:text-brand-ink">
        <ChevronLeft className="size-3.5" /> Planner · Opportunities
      </Link>

      <header className="flex flex-col gap-4 rounded-[12px] bg-white px-7 py-6">
        <span className="flex flex-wrap items-center gap-3">
          <span className="flex-1 font-brand-mono text-[12px] uppercase tracking-[0.06em] text-brand-ink-2">Opportunity · from {c.sources.length} sources</span>
          {confidence ? <span className="rounded-full bg-[#E4F2B3] px-3 py-1 text-[12px] text-[#5E6B2A]">{CONFIDENCE_LABEL[confidence]}</span> : <span className="rounded-full bg-brand-chip px-3 py-1 text-[12px]">Not enough data yet</span>}
          <span className="text-[12px] text-brand-ink-2">
            Found {day(o.createdAt)} · for {clientName}
            {o.isDemo ? " · demo data" : ""}
          </span>
        </span>
        <h1 className="m-0 text-[34px] font-normal leading-[1.15] [text-wrap:balance]">{c.headline}</h1>
        <p className="m-0 max-w-[68ch] text-[16px] leading-[1.6]">{o.summary}</p>
        <dl className="m-0 grid grid-cols-1 border-t border-brand-line sm:grid-cols-3">
          {[
            { k: "Expected effect", v: c.effect.text },
            { k: "Cost", v: c.cost.text },
            { k: "Decide by", v: decideBy ? `${wday(decideBy)}, to brief in time` : "Any time" },
          ].map((x, i) => (
            <div key={x.k} className={cn("flex flex-col gap-1 py-4", i > 0 && "sm:border-l sm:border-brand-line sm:pl-5")}>
              <dt className="text-[12px] text-brand-ink-2">{x.k}</dt>
              <dd className="m-0 text-[15px]">{x.v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Why we think so" className="overflow-hidden rounded-[12px] bg-white">
            <header className="flex flex-wrap items-center gap-3 border-b border-brand-line px-6 py-4">
              <h2 className="m-0 flex-1 text-[18px] font-normal">Why we think so</h2>
              <Chips sources={c.sources} />
            </header>
            <ul className="m-0 list-none p-0">
              {c.evidence.map((e) => (
                <li key={e.title} className="flex flex-wrap items-start gap-3 border-t border-brand-line px-6 py-4 first:border-t-0">
                  <span className="flex min-w-0 flex-1 basis-[280px] flex-col gap-1">
                    <span className="text-[15px]">{e.title}</span>
                    <span className="text-[13px] text-brand-ink-2">{e.text}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Chips sources={e.sources} />
                    <span className="text-[11px] text-brand-ink-2">{e.size}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="How we got the number" className="overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 border-b border-brand-line px-6 py-4 text-[18px] font-normal">How we got the number</h2>
            <div className="flex flex-col gap-3 px-6 py-5 text-[14px] leading-[1.55]">
              {c.maths.map((m) => (
                <p key={m.label} className="m-0">
                  <b className="font-semibold">{m.label}:</b> {m.text}
                </p>
              ))}
              <p className="m-0 text-[13px] text-brand-ink-2">{c.mathsNote}</p>
              {c.disagree && (
                <p className="m-0 rounded-[10px] bg-brand-page px-4 py-3 text-[13px]">
                  {c.disagree.text}: {c.disagree.a.source} {Math.round(c.disagree.a.value).toLocaleString("en-GB")}, {c.disagree.b.source} {Math.round(c.disagree.b.value).toLocaleString("en-GB")}. We use {c.disagree.b.source}&apos;s count and show both.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Data checks" className="overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 border-b border-brand-line px-6 py-4 text-[18px] font-normal">Data checks</h2>
            <ul className="m-0 flex list-none flex-col gap-3 p-0 px-6 py-5 text-[14px]">
              {c.checks.map((x) => (
                <li key={x.text} className="flex items-start gap-2">
                  {x.ok ? <Check className="mt-0.5 size-4 shrink-0 text-[#8D9E47]" strokeWidth={2.5} /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand-orange-text" strokeWidth={2} />}
                  {x.text}
                </li>
              ))}
              {c.blind.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand-orange-text" strokeWidth={2} />
                  {b}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Do it" className="overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 border-b border-brand-line px-6 py-4 text-[18px] font-normal">Do it</h2>
            <div className="flex flex-col gap-2.5 px-6 py-5">
              {dismissed ? (
                <p className="m-0 text-[14px] text-brand-ink-2">Set aside: “{o.dismissReason}”.</p>
              ) : o.status !== "new" ? (
                <p className="m-0 text-[14px] text-brand-ink-2">Added to your plan.</p>
              ) : (
                <>
                  {c.actions.addToPlan && (
                    <form action={addCombinedToPlanAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <button type="submit" className={cn(pill, "border-brand-orange bg-brand-orange text-white")}>
                        {c.actions.addToPlan.label}
                      </button>
                    </form>
                  )}
                  <Link href={c.actions.brief.href} className={cn(pill, "border-[#CFC8B8] bg-white text-brand-ink")}>
                    {c.actions.brief.label}
                  </Link>
                  {c.actions.askPm && pmFirst && <MessagePmButton className={cn(pill, "border-[#CFC8B8] bg-white text-brand-ink")}>{`Ask ${pmFirst} first`}</MessagePmButton>}
                </>
              )}
            </div>
            {!dismissed && (
              <div className="flex flex-col gap-2 border-t border-brand-line px-6 py-4">
                <span className="text-[13px] text-brand-ink-2">Not for us</span>
                <span className="flex flex-wrap gap-2">
                  {COMBINED_DISMISS_REASONS.map((reason) => (
                    <form key={reason} action={dismissOpportunityAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="reason" value={reason} />
                      <input type="hidden" name="back" value="1" />
                      <button type="submit" className="h-9 rounded-full border border-[#CFC8B8] bg-white px-3.5 text-[13px]">
                        {reason}
                      </button>
                    </form>
                  ))}
                </span>
                <span className="text-[11px] text-brand-ink-2">“Don&apos;t trust the data” goes to your Marketing PM, who&apos;ll check the numbers with you.</span>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
