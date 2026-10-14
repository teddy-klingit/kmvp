"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { findSkillAction, type FindSkillState } from "@/lib/actions/skills-actions";
import { AskKlingit } from "@/components/portal/skills/ask-klingit";

const EXAMPLES = ["a launch email for sun day", "product copy from an INCI list", "a linkedin post about our refill pouch", "a brief for a TikTok series"];

/**
 * "What do you want to make?" (design 02): plain words in, the best skill (or two) with its settings out, and
 * "Set it up" opens the run page pre-filled. One small assistant call (included, never AI credits). Nothing fits: Ask Klingit or
 * request a custom skill.
 */
export function SkillFinder() {
  const [state, action, pending] = useActionState<FindSkillState, FormData>(findSkillAction, {});
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const fit = state.fit;
  const s = fit?.settings;
  return (
    <section aria-label="What do you want to make?" className="flex flex-col gap-4 rounded-[16px] bg-brand-ink px-5 py-6 text-white min-[700px]:px-7">
      <h2 className="m-0 text-[22px] font-normal">What do you want to make?</h2>
      <form ref={form} action={action} className="flex h-14 items-center gap-2 rounded-full bg-white pl-5 pr-1.5">
        <label htmlFor="skill-finder" className="sr-only">
          What do you want to make?
        </label>
        <input ref={input} id="skill-finder" name="request" defaultValue={state.request} placeholder="three instagram stories for the dew drop restock, soft and calm" className="h-full min-w-0 flex-1 border-none bg-transparent text-[15px] text-brand-ink outline-none placeholder:text-brand-mute" autoComplete="off" data-gramm="false" />
        <button type="submit" disabled={pending} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-brand-ink px-5 font-brand-mono text-[13px] text-white hover:bg-black disabled:opacity-70">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Find skill
        </button>
      </form>
      {fit && s && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[12px] bg-white/10 px-4 py-3.5">
          <span className="font-brand-mono text-[12px] text-white/70">BEST FIT</span>
          <span className="min-w-0 flex-1 text-[15px]">
            <b className="font-semibold">{fit.skill.name}</b>
            {[s.format ?? s.channel, s.product, fit.skill.availability === "klingit_run" ? null : `${s.versions} version${s.versions === 1 ? "" : "s"}`].filter(Boolean).map((x) => ` · ${x}`)}
            {fit.then && <span className="text-white/80"> · then {fit.then.name} for each</span>}
          </span>
          {fit.skill.availability === "klingit_run" ? (
            <AskKlingit skillId={fit.skill.id} skillName={fit.skill.name} teamCredits={fit.skill.teamCredits} defaultText={state.request} dark />
          ) : (
            <>
              {fit.aiCredits != null && <span className="text-[13px] text-white/70">≈ {fit.aiCredits} AI credits</span>}
              <Link href={fit.href} className="inline-flex h-10 items-center rounded-full bg-white px-4 font-brand-mono text-[13px] text-brand-ink no-underline hover:bg-brand-cream">
                Set it up
              </Link>
            </>
          )}
        </div>
      )}
      {state.searched && !fit && !state.error && (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-white/10 px-4 py-3.5 text-[14px]">
          <span className="flex-1">No skill fits that yet.</span>
          <AskKlingit defaultText={state.request} dark label="Ask Klingit" />
          <Link href="/skills/yours#request" className="text-[13px] text-white underline underline-offset-2">
            Request a custom skill
          </Link>
        </div>
      )}
      {state.error && <p className="m-0 text-[14px] text-brand-peach-pale">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-white/60">Try:</span>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              if (input.current) input.current.value = e;
              form.current?.requestSubmit();
            }}
            className="rounded-full border border-white/25 px-3 py-1.5 text-[13px] text-white hover:border-white"
          >
            {e}
          </button>
        ))}
      </div>
    </section>
  );
}
