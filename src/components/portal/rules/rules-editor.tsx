"use client";

import { useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MoreHorizontal, Pencil } from "lucide-react";
import { pillClass } from "@/components/ds/button";
import { saveRuleAction, ruleStatusAction, type RuleFormState } from "@/lib/actions/brand-rule-actions";
import { cn } from "@/lib/utils";
import type { BrandRuleStatus, BrandRuleType } from "@/generated/prisma";

export type RuleRow = {
  id: string;
  type: BrandRuleType;
  text: string;
  words: string[];
  scope: { channels?: string[]; products?: string[] };
  status: BrandRuleStatus;
  active: boolean;
  usedCount: number;
  caughtCount: number;
  source: string;
  suggestedBy: string | null;
};
export type RuleMode = "admin" | "member" | "staff";

const TYPES: { type: BrandRuleType; label: string; tint: string }[] = [
  { type: "TONE", label: "Tone", tint: "bg-brand-chip" },
  { type: "DO", label: "Do", tint: "bg-brand-lime-pale" },
  { type: "WORDS_USE", label: "Words to use", tint: "bg-brand-lime-pale" },
  { type: "WORDS_AVOID", label: "Words to avoid", tint: "bg-brand-peach-pale" },
  { type: "CLAIMS", label: "Claims & legal", tint: "bg-brand-lavender-pale" },
  { type: "CHANNEL", label: "Channel", tint: "bg-brand-pink-pale" },
];
const CHANNELS = ["Instagram", "TikTok", "Facebook", "LinkedIn", "Email", "Web"];
const label = (t: BrandRuleType) => TYPES.find((x) => x.type === t)!;
const chip = (on: boolean) => cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[14px]", on ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white text-brand-ink hover:border-brand-ink");

/**
 * Brand OS → Rules (design 01): filter by type, edit in place, turn off or remove from the row menu, and the orange
 * rows waiting for an admin (members' suggestions, imported drafts). Members see the same list and suggest.
 */
export function RulesEditor({ rules, mode, clientId, lastChanged }: { rules: RuleRow[]; mode: RuleMode; clientId?: string; lastChanged: string | null }) {
  const params = useSearchParams();
  const [filter, setFilter] = useState<BrandRuleType | "ALL">("ALL");
  const [editing, setEditing] = useState<string | null>(params?.get("add") ? "new" : null);
  const waiting = rules.filter((r) => r.status === "SUGGESTED" || r.status === "DRAFT");
  const listed = rules.filter((r) => r.status === "ACTIVE");
  const shown = listed.filter((r) => filter === "ALL" || r.type === filter);
  const counts = TYPES.map((t) => ({ ...t, n: listed.filter((r) => r.type === t.type).length })).filter((t) => t.n > 0);
  const canEdit = mode !== "member";

  return (
    <section id="rules" aria-label="Rules" className="overflow-hidden rounded-[12px] bg-white">
      <div className="flex flex-wrap items-baseline gap-3 border-b border-brand-line px-6 py-5">
        <h2 className="m-0 flex-1 text-[18px] font-normal">
          Rules <span className="text-[14px] text-brand-ink-2">{listed.length}</span>
        </h2>
        {lastChanged && <span className="font-brand-mono text-[12px] uppercase text-brand-ink">Last changed {lastChanged}</span>}
      </div>
      <div className="flex flex-wrap gap-2 border-b border-brand-line px-6 py-4" role="group" aria-label="Filter by type">
        <button type="button" onClick={() => setFilter("ALL")} className={chip(filter === "ALL")} aria-pressed={filter === "ALL"}>
          All · {listed.length}
        </button>
        {counts.map((t) => (
          <button key={t.type} type="button" onClick={() => setFilter(t.type)} className={chip(filter === t.type)} aria-pressed={filter === t.type}>
            {t.label} · {t.n}
          </button>
        ))}
      </div>

      {editing === "new" && <RuleForm mode={mode} clientId={clientId} onDone={() => setEditing(null)} />}

      <ul className="m-0 list-none p-0">
        {waiting.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-brand-line bg-brand-peach-pale px-6 py-4">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand-orange" />
            <span className="flex min-w-0 flex-1 basis-[260px] flex-col">
              <span className="text-[15px]">{r.text}</span>
              <span className="text-[13px] text-brand-ink-2">
                {r.status === "SUGGESTED" ? `Suggested by ${r.suggestedBy ?? "a member"}` : `Draft from ${r.source.replace(/^import:/, "")}`} · {label(r.type).label} · {scopeText(r)}
              </span>
            </span>
            {canEdit ? (
              <span className="flex gap-2">
                <StatusButton id={r.id} op="approve" clientId={clientId} primary>
                  Approve
                </StatusButton>
                <StatusButton id={r.id} op="decline" clientId={clientId}>
                  Decline
                </StatusButton>
              </span>
            ) : (
              <span className="text-[13px] text-brand-ink-2">Waiting for an admin</span>
            )}
          </li>
        ))}
        {shown.map((r) =>
          editing === r.id ? (
            <li key={r.id} className="border-b border-brand-line">
              <RuleForm rule={r} mode={mode} clientId={clientId} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={r.id} className={cn("flex items-center gap-3 border-b border-brand-line px-6 py-4 last:border-b-0", !r.active && "opacity-60")}>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[15px]">{r.words.length && !r.text ? r.words.join(", ") : r.text}</span>
                <span className="flex flex-wrap items-center gap-2 text-[13px] text-brand-ink-2">
                  <span className={cn("rounded-[6px] px-2 py-0.5 text-[12px] text-brand-ink", label(r.type).tint)}>{label(r.type).label}</span>
                  <span>{scopeText(r)}</span>
                  {/* Only real counts from the rule check; nothing when it hasn't run. */}
                  {r.usedCount > 0 && (
                    <span>
                      · Used {r.usedCount}×{r.caughtCount > 0 ? ` · caught ${r.caughtCount}` : ""}
                    </span>
                  )}
                  {!r.active && <span>· Off</span>}
                </span>
              </span>
              {canEdit && (
                <>
                  <button type="button" onClick={() => setEditing(r.id)} aria-label={`Edit “${r.text}”`} className="flex size-9 items-center justify-center rounded-full hover:bg-brand-chip">
                    <Pencil className="size-4" strokeWidth={1.75} />
                  </button>
                  <RowMenu rule={r} clientId={clientId} />
                </>
              )}
            </li>
          )
        )}
        {shown.length === 0 && <li className="px-6 py-5 text-[14px] text-brand-ink-2">{listed.length ? "No rules of this type." : "No rules yet. Add the first one."}</li>}
      </ul>
    </section>
  );
}

function scopeText(r: Pick<RuleRow, "scope">) {
  const c = r.scope.channels ?? [];
  const p = r.scope.products ?? [];
  if (!c.length && p.length) return `${p.join(", ")} only`;
  return [c.length ? c.join(", ") : "All channels", p.length ? `${p.join(", ")} only` : null].filter(Boolean).join(" · ");
}

function StatusButton({ id, op, clientId, primary, children }: { id: string; op: string; clientId?: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <form action={ruleStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      {clientId && <input type="hidden" name="clientId" value={clientId} />}
      <button type="submit" className={pillClass(primary ? "primary" : "secondary", "sm")}>
        {children}
      </button>
    </form>
  );
}

function RowMenu({ rule, clientId }: { rule: RuleRow; clientId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="More" className="flex size-9 items-center justify-center rounded-full hover:bg-brand-chip">
        <MoreHorizontal className="size-4" strokeWidth={1.75} />
      </button>
      {open && (
        <span className="absolute right-0 top-10 z-20 flex w-44 flex-col rounded-[10px] bg-white p-1 shadow-[0_8px_28px_rgba(30,30,30,0.14)]">
          {[
            { op: rule.active ? "off" : "on", text: rule.active ? "Turn off" : "Turn on" },
            { op: "delete", text: "Remove" },
          ].map((o) => (
            <form key={o.op} action={ruleStatusAction}>
              <input type="hidden" name="id" value={rule.id} />
              <input type="hidden" name="op" value={o.op} />
              {clientId && <input type="hidden" name="clientId" value={clientId} />}
              <button type="submit" className={cn("w-full rounded-[8px] px-3 py-2 text-left text-[14px] hover:bg-brand-chip", o.op === "delete" && "text-ds-danger-text")}>
                {o.text}
              </button>
            </form>
          ))}
        </span>
      )}
    </span>
  );
}

function RuleForm({ rule, mode, clientId, onDone }: { rule?: RuleRow; mode: RuleMode; clientId?: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<RuleFormState, FormData>(saveRuleAction, {});
  const [type, setType] = useState<BrandRuleType>(rule?.type ?? "TONE");
  const [pick, setPick] = useState(Boolean(rule?.scope.channels?.length));
  const [channels, setChannels] = useState<string[]>(rule?.scope.channels ?? []);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  const wordsType = type === "WORDS_USE" || type === "WORDS_AVOID";
  return (
    <form action={action} className="flex flex-col gap-4 border-l-[3px] border-brand-ink bg-brand-page px-6 py-5">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      {clientId && <input type="hidden" name="clientId" value={clientId} />}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="scope" value={pick ? "pick" : "all"} />
      {channels.map((c) => (
        <input key={c} type="hidden" name="channels" value={c} />
      ))}
      <label className="sr-only" htmlFor={`rule-text-${rule?.id ?? "new"}`}>
        Rule
      </label>
      <textarea id={`rule-text-${rule?.id ?? "new"}`} name="text" required defaultValue={rule?.text} rows={2} placeholder="e.g. headlines end with a full stop, no exclamation marks" className="min-h-16 w-full rounded-[10px] border border-brand-outline bg-white px-4 py-3 text-[15px] outline-none focus:border-brand-ink" data-gramm="false" />
      {wordsType && (
        <label className="flex flex-col gap-1 text-[13px] text-brand-ink-2">
          Words (comma separated)
          <input name="words" defaultValue={rule?.words.join(", ")} className="h-10 rounded-[10px] border border-brand-outline bg-white px-3 text-[14px] text-brand-ink" />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] text-brand-mute">Type</span>
        {TYPES.map((t) => (
          <button key={t.type} type="button" onClick={() => setType(t.type)} className={chip(type === t.type)} aria-pressed={type === t.type}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] text-brand-mute">Applies to</span>
        <button type="button" onClick={() => setPick(false)} className={chip(!pick)} aria-pressed={!pick}>
          All channels
        </button>
        <button type="button" onClick={() => setPick(true)} className={chip(pick)} aria-pressed={pick}>
          Pick channels
        </button>
        {pick &&
          CHANNELS.map((c) => (
            <button key={c} type="button" onClick={() => setChannels((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))} className={chip(channels.includes(c))} aria-pressed={channels.includes(c)}>
              {c}
            </button>
          ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={pillClass("primary", "sm")}>
          {pending ? "Saving…" : mode === "member" && !rule ? "Suggest rule" : "Save rule"}
        </button>
        <button type="button" onClick={onDone} className={pillClass("secondary", "sm")}>
          Cancel
        </button>
        {state.error && <span className="text-[13px] text-ds-danger-text">{state.error}</span>}
        <span className="ml-auto text-[12px] text-brand-ink-2">{mode === "member" ? "An admin approves suggestions before they apply." : "Applies to every skill, assistant and quality check as soon as you save."}</span>
      </div>
    </form>
  );
}
