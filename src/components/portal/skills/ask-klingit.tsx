"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { pillClass } from "@/components/ds/button";
import { askKlingitAction, type AskKlingitState } from "@/lib/actions/skills-actions";
import { cn } from "@/lib/utils";

/** "Ask Klingit": a short note → a request for the PM on Ongoing projects (team credits, estimate to follow). */
export function AskKlingit({ skillId, skillName, teamCredits, defaultText, dark = false, label = "Ask Klingit" }: { skillId?: string; skillName?: string; teamCredits?: number | null; defaultText?: string; dark?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AskKlingitState, FormData>(askKlingitAction, {});
  if (state.ok)
    return (
      <span className={cn("text-[13px]", dark ? "text-white" : "text-brand-ink")}>
        {state.ok}{" "}
        <Link href={`/projects/${state.projectId}`} className="underline underline-offset-2">
          Open
        </Link>
      </span>
    );
  return (
    <span className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={dark ? "inline-flex h-10 items-center rounded-full bg-white px-4 font-brand-mono text-[13px] text-brand-ink hover:bg-brand-cream" : pillClass("secondary", "sm")}>
        {label}
      </button>
      {open && (
        <form action={action} className="absolute right-0 top-12 z-30 flex w-[min(340px,80vw)] flex-col gap-3 rounded-[12px] bg-white p-4 text-brand-ink shadow-[0_12px_40px_rgba(30,30,30,0.18)]">
          {skillId && <input type="hidden" name="skillId" value={skillId} />}
          <label htmlFor={`ask-${skillId ?? "any"}`} className="text-[14px]">
            {skillName ? `What should Klingit do with ${skillName.toLowerCase()}?` : "What do you need?"}
          </label>
          <textarea id={`ask-${skillId ?? "any"}`} name="text" required rows={3} defaultValue={defaultText} className="rounded-[10px] border border-brand-outline px-3 py-2 text-[14px] outline-none focus:border-brand-ink" />
          {teamCredits != null && <span className="text-[12px] text-brand-ink-2">≈ {teamCredits} team credits · Klingit confirms in the estimate</span>}
          {state.error && <span className="text-[13px] text-ds-danger-text">{state.error}</span>}
          <button type="submit" disabled={pending} className={pillClass("primary", "sm")}>
            {pending ? "Sending…" : "Send to Klingit"}
          </button>
        </form>
      )}
    </span>
  );
}
