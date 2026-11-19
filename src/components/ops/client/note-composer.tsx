"use client";

import { useState } from "react";
import { createNoteAction } from "@/lib/actions/client-note-actions";
import { cn } from "@/lib/utils";

/**
 * Phase T2: the Notes composer — Note / Call / Meeting / Decision / Risk, text with @mention and a project link, Pin to
 * overview and Remind me. "Log a call" in the header opens it with Call picked and a length field.
 */
const KINDS = [
  ["note", "Note"],
  ["call", "Call"],
  ["meeting", "Meeting"],
  ["decision", "Decision"],
  ["risk", "Risk"],
] as const;

export function NoteComposer({ clientId, projects, initialKind = "note", back = "notes" }: { clientId: string; projects: { id: string; name: string }[]; initialKind?: string; back?: string }) {
  const [kind, setKind] = useState(KINDS.some(([k]) => k === initialKind) ? initialKind : "note");
  const [remind, setRemind] = useState(false);
  return (
    <form action={createNoteAction} id="compose" className="flex flex-col gap-4 rounded-[12px] bg-white px-6 py-5">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="back" value={back} />
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cn("inline-flex h-9 items-center rounded-full border px-4 text-[14px]", kind === k ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white text-brand-ink hover:border-brand-ink")}>
            {label}
          </button>
        ))}
        <span className="ml-auto font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-orange-text">Only Klingit staff see this</span>
      </div>
      <label className="sr-only" htmlFor="note-text">
        The note
      </label>
      <textarea id="note-text" name="text" required rows={3} placeholder="Write a note… @mention a colleague. The first line is the title." className="w-full resize-y rounded-[10px] border border-brand-outline bg-white px-4 py-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[14px]">
        <label className="flex items-center gap-2">
          Project
          <select name="projectId" defaultValue="" className="h-9 rounded-full border border-brand-outline bg-white px-3 text-[13px]">
            <option value="">none</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Tags
          <input name="tags" placeholder="e.g. 2027 planning, Upsell" className="h-9 w-[200px] rounded-full border border-brand-outline bg-white px-3 text-[13px]" />
        </label>
        {kind === "call" && (
          <label className="flex items-center gap-2">
            Length
            <input name="durationMin" type="number" min={1} max={480} placeholder="15" className="h-9 w-[72px] rounded-full border border-brand-outline bg-white px-3 text-[13px]" />
            min
          </label>
        )}
        {(kind === "call" || kind === "meeting") && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="kickoff" className="size-4" /> The kick-off
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pin" className="size-4" /> Pin to overview
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="remind" className="size-4" checked={remind} onChange={(e) => setRemind(e.target.checked)} /> Remind me
        </label>
        {remind && <input name="remindAt" type="date" required className="h-9 rounded-full border border-brand-outline bg-white px-3 text-[13px]" aria-label="Remind me on" />}
        <button type="submit" className="ml-auto inline-flex h-10 items-center rounded-full bg-brand-orange px-5 font-brand-mono text-[12px] text-white hover:opacity-90">
          Save {kind === "note" ? "note" : kind}
        </button>
      </div>
    </form>
  );
}
