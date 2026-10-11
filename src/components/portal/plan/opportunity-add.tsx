"use client";

import { useActionState, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pillClass } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { addPlanItemAction, type AddPlanState } from "@/lib/actions/plan-item-actions";
import { briefByFor, type LeadTime } from "@/lib/plan-dates";
import { cn } from "@/lib/utils";

type Route = { letter: string; name: string; formats: string[]; channels: string[]; description: string; cost: string | null };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const at = (s: string) => new Date(`${s}T10:00:00`);
const wday = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);

/**
 * Opportunity → Add to plan (design 07, side): the picked route, a small month with the best window shaded, who
 * makes it (with the brief-by date when Klingit helps), then Add to plan or Add and start brief. The request key
 * makes it idempotent, like the Plan dialog.
 */
export function OpportunityAdd({ opportunityId, title, route, windowStart, windowEnd, leadTimes, today }: { opportunityId: string; title: string; route: Route | null; windowStart: string | null; windowEnd: string | null; leadTimes: LeadTime[]; today: string }) {
  const [requestKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));
  const [state, action, pending] = useActionState<AddPlanState, FormData>(addPlanItemAction, {});
  const initial = windowEnd ?? windowStart ?? null;
  const [date, setDate] = useState<string | null>(initial);
  const [month, setMonth] = useState(() => {
    const d = at(initial ?? today);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [maker, setMaker] = useState<"client" | "klingit_help">("klingit_help");
  const brief = useMemo(() => (date ? briefByFor(at(date), route?.formats ?? [], leadTimes) : null), [date, route, leadTimes]);
  const inWindow = (d: Date) => windowStart && windowEnd && iso(d) >= windowStart && iso(d) <= windowEnd;
  const lead = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const past = (d: Date) => iso(d) < today;

  return (
    <form action={action} id="add" className="flex flex-col gap-4 px-6 py-5">
      <input type="hidden" name="requestKey" value={requestKey} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="maker" value={maker} />
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {date && <input type="hidden" name="date" value={date} />}
      {route && (
        <>
          <input type="hidden" name="route" value={route.letter} />
          <input type="hidden" name="notes" value={`${route.name}: ${route.description}`} />
          {route.formats.map((f) => (
            <input key={f} type="hidden" name="formats" value={f} />
          ))}
          {route.channels.map((c) => (
            <input key={c} type="hidden" name="channels" value={c} />
          ))}
        </>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">Route</span>
        {route ? (
          <span className="flex items-center gap-2 rounded-[8px] bg-[#FBF6EE] px-3.5 py-2.5 text-[14px]">
            <span className="font-brand-mono text-[11px] text-brand-ink-2">{route.letter}</span>
            <span className="flex-1">{route.name}</span>
            {route.cost && <span className="text-[12px] text-brand-ink-2">{route.cost}</span>}
          </span>
        ) : (
          <span className="text-[14px] text-brand-ink-2">No routes yet: ask for one on the left.</span>
        )}
        <span className="text-[12px] text-brand-ink-2">Pick a route on the left</span>
      </div>

      <div className="flex flex-col gap-2" role="group" aria-label="Live date">
        <span className="flex items-center text-[15px]">
          <span className="flex-1">{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(month)}</span>
          <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="p-1">
            <ChevronLeft className="size-3.5" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="p-1">
            <ChevronRight className="size-3.5" />
          </button>
        </span>
        <div className="grid grid-cols-7 gap-y-1 text-center text-[13px]">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i} className="pb-1 font-brand-mono text-[10px] text-brand-ink-2">
              {d}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
            const on = date === iso(d);
            return (
              <button
                key={i}
                type="button"
                disabled={past(d)}
                onClick={() => setDate(iso(d))}
                aria-pressed={on}
                aria-label={wday(d)}
                className={cn("mx-auto flex size-9 items-center justify-center rounded-full", on ? "bg-brand-ink text-white" : inWindow(d) ? "bg-[#EFE6D2]" : "hover:bg-brand-chip", past(d) && "text-brand-mute")}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <span className="text-[12px] text-brand-ink-2">
          {windowStart ? "Shaded: best window" : "Any time"}
          {date ? ` · ${wday(at(date))} selected` : " · pick a day"}
        </span>
      </div>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Who makes it?">
        <span className="text-[13px] font-semibold">Who makes it?</span>
        <span className="flex flex-wrap gap-2">
          {(
            [
              ["client", "You make it"],
              ["klingit_help", "Klingit’s help needed"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={maker === v} onClick={() => setMaker(v)} className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[14px]", maker === v ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white")}>
              {l}
            </button>
          ))}
        </span>
        {maker === "klingit_help" && brief && (
          <span className="flex flex-wrap items-center gap-2 text-[12px] text-brand-ink-2">
            Brief by {wday(brief.briefBy)} · we’ll remind you <PlaceholderTag>Lead times</PlaceholderTag>
          </span>
        )}
      </div>

      {state.error && <p className="m-0 text-[13px] text-ds-danger-text">{state.error}</p>}
      {state.ok && <p className="m-0 text-[13px]">{state.ok}</p>}
      <button type="submit" disabled={pending || !date} className={cn(pillClass("primary", "md"), "w-full justify-start")}>
        Add to plan
      </button>
      {maker === "klingit_help" && (
        <button type="submit" name="start" value="1" disabled={pending || !date} className={cn(pillClass("secondary", "md"), "w-full justify-start")}>
          {pending ? "Adding…" : "Add and start brief"}
        </button>
      )}
      <p className="m-0 text-[12px] text-brand-ink-2">The brief starts pre-filled with this route, the evidence and your notes.</p>
    </form>
  );
}
