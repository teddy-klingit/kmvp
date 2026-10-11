"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { pillClass } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { addPlanItemAction, type AddPlanState } from "@/lib/actions/plan-item-actions";
import { briefByFor, teamCreditsFor, type LeadTime } from "@/lib/plan-dates";
import { cn } from "@/lib/utils";

const CHANNELS = ["Instagram", "TikTok", "Facebook", "Newsletter", "Web"];
const chip = (on: boolean) => cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[14px]", on ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white text-brand-ink hover:border-brand-ink");
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);

export type AddPrefill = { title?: string; date?: string; endDate?: string; channels?: string[]; formats?: string[]; maker?: "client" | "klingit_help" | "klingit_project"; notes?: string; opportunityId?: string; route?: string; source?: string };

/**
 * Add to plan (design 05): what it is, when, channels, formats, who makes it — with the brief-by date and a rough
 * team-credit estimate when Klingit helps — and notes. Opens on ?add=1. A fresh request key each time it opens
 * makes it idempotent: a double click never adds two items.
 */
export function AddToPlan({ leadTimes, projects, prefill }: { leadTimes: LeadTime[]; projects: { id: string; name: string }[]; prefill?: AddPrefill }) {
  const params = useSearchParams();
  const router = useRouter();
  const open = params?.get("add") === "1";
  const close = () => {
    const q = new URLSearchParams(params?.toString());
    ["add", "opportunity", "route"].forEach((k) => q.delete(k));
    router.replace(`/plan${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  if (!open) return null;
  return <Dialog leadTimes={leadTimes} projects={projects} prefill={prefill} onClose={close} />;
}

function Dialog({ leadTimes, projects, prefill, onClose }: { leadTimes: LeadTime[]; projects: { id: string; name: string }[]; prefill?: AddPrefill; onClose: () => void }) {
  const [requestKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));
  const [state, action, pending] = useActionState<AddPlanState, FormData>(addPlanItemAction, {});
  const [date, setDate] = useState(prefill?.date ?? "");
  const [channels, setChannels] = useState<string[]>(prefill?.channels ?? []);
  const [formats, setFormats] = useState<string[]>(prefill?.formats ?? []);
  const [maker, setMaker] = useState(prefill?.maker ?? "klingit_help");
  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const brief = useMemo(() => (date ? briefByFor(new Date(`${date}T10:00:00`), formats, leadTimes) : null), [date, formats, leadTimes]);
  const credits = teamCreditsFor(formats, leadTimes);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="add-to-plan-title" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-10" onClick={onClose}>
      <form action={action} onClick={(e) => e.stopPropagation()} className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-[16px] bg-brand-page shadow-[0_24px_64px_rgba(30,30,30,0.25)]">
        <input type="hidden" name="requestKey" value={requestKey} />
        <input type="hidden" name="maker" value={maker} />
        {channels.map((c) => (
          <input key={c} type="hidden" name="channels" value={c} />
        ))}
        {formats.map((f) => (
          <input key={f} type="hidden" name="formats" value={f} />
        ))}
        {prefill?.opportunityId && <input type="hidden" name="opportunityId" value={prefill.opportunityId} />}
        {prefill?.route && <input type="hidden" name="route" value={prefill.route} />}
        <header className="flex items-center justify-between bg-white px-7 py-5">
          <h2 id="add-to-plan-title" className="m-0 text-[22px] font-normal">
            Add to plan
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full hover:bg-brand-chip">
            <X className="size-4" />
          </button>
        </header>
        <div className="flex flex-col gap-5 px-7 py-6">
          <label className="flex flex-col gap-2">
            <span className="text-[14px] font-semibold">What is it?</span>
            <input name="title" required defaultValue={prefill?.title} placeholder="Singles Day self-care set" className="h-12 rounded-full border border-brand-outline bg-white px-4 text-[15px] outline-none focus:border-brand-ink" />
          </label>
          <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-[14px] font-semibold">Live date</span>
              <input type="date" name="date" required value={date} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-full border border-brand-outline bg-white px-4 text-[15px]" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[14px] font-semibold">Or a date range</span>
              <input type="date" name="endDate" defaultValue={prefill?.endDate} min={date || undefined} aria-label="End date" className="h-12 rounded-full border border-brand-outline bg-white px-4 text-[15px]" />
            </label>
          </div>
          <div className="flex flex-col gap-2" role="group" aria-label="Channel">
            <span className="text-[14px] font-semibold">Channel</span>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <button key={c} type="button" onClick={() => setChannels(toggle(channels, c))} className={chip(channels.includes(c))} aria-pressed={channels.includes(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2" role="group" aria-label="Format">
            <span className="text-[14px] font-semibold">Format</span>
            <div className="flex flex-wrap gap-2">
              {leadTimes.map((l) => (
                <button key={l.format} type="button" onClick={() => setFormats(toggle(formats, l.format))} className={chip(formats.includes(l.format))} aria-pressed={formats.includes(l.format)}>
                  {l.format}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Who makes it?">
            <span className="text-[14px] font-semibold">Who makes it?</span>
            {(
              [
                { v: "client", title: "You make it", text: "Your team makes and posts it. It just shows on the plan." },
                { v: "klingit_help", title: "Klingit’s help needed", text: "We remind you to brief it in time and start the brief for you." },
                { v: "klingit_project", title: "Already a Klingit project", text: "Link it to a project on your board." },
              ] as const
            ).map((o) => (
              <label key={o.v} className={cn("flex cursor-pointer flex-col gap-3 rounded-[12px] border bg-white px-5 py-4", maker === o.v ? (o.v === "klingit_help" ? "border-2 border-brand-ink bg-brand-peach-pale" : "border-2 border-brand-ink") : "border-brand-line")}>
                <span className="flex items-start gap-3">
                  <input type="radio" name="makerChoice" checked={maker === o.v} onChange={() => setMaker(o.v)} className="mt-1 size-4 accent-brand-ink" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[16px]">{o.title}</span>
                    <span className="text-[13px] text-brand-ink-2">{o.text}</span>
                  </span>
                </span>
                {o.v === "klingit_help" && maker === "klingit_help" && brief && (
                  <span className="ml-7 flex flex-col gap-0.5 rounded-[8px] bg-white px-3 py-2.5 text-[13px]">
                    <span>
                      <b className="font-semibold">Brief by {day(brief.briefBy)}</b> · {brief.format.toLowerCase()} usually take{brief.format.endsWith("s") ? "" : "s"} {brief.days} working days
                    </span>
                    {credits != null && (
                      <span className="flex flex-wrap items-center gap-2 text-brand-ink-2">
                        ≈ {credits} team credits, final price in the estimate <PlaceholderTag>Placeholder</PlaceholderTag>
                      </span>
                    )}
                  </span>
                )}
                {o.v === "klingit_project" && maker === "klingit_project" && (
                  <select name="projectId" required className="ml-7 h-10 rounded-full border border-brand-outline bg-white px-3 text-[14px]">
                    <option value="">Pick a project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-[14px] font-semibold">Notes for Klingit</span>
            <textarea name="notes" rows={2} defaultValue={prefill?.notes} className="rounded-[14px] border border-brand-outline bg-white px-4 py-3 text-[15px] outline-none focus:border-brand-ink" />
            {prefill?.source && <span className="text-[12px] text-brand-ink-2">{prefill.source}</span>}
          </label>
          {state.error && <p className="m-0 text-[13px] text-ds-danger-text">{state.error}</p>}
        </div>
        <footer className="flex flex-wrap items-center gap-3 bg-white px-7 py-4">
          <span className="min-w-0 flex-1 basis-[220px] text-[13px] text-brand-ink-2">{maker === "klingit_help" ? "We’ll remind you 7 days and 2 days before the brief-by date." : date ? `Live ${day(new Date(`${date}T10:00:00`))}.` : ""}</span>
          <button type="submit" disabled={pending} className={pillClass("secondary", "md")}>
            Add to plan
          </button>
          {maker !== "klingit_project" && (
            <button type="submit" name="start" value="1" disabled={pending} className={pillClass("primary", "md")}>
              {pending ? "Adding…" : "Add and start brief"}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}

