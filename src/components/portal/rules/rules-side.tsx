"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { pillClass } from "@/components/ds/button";
import { importGuidelinesAction, testCopyAction, type RuleFormState, type TestCopyState } from "@/lib/actions/brand-rule-actions";

/** The copy with every offending word or character marked, as the check found them. */
function Highlighted({ text, marks }: { text: string; marks: string[] }) {
  // Words and characters only (a quoted half-sentence would underline everything).
  const parts = [...new Set(marks.filter((m) => m && m.length <= 24))].sort((a, b) => b.length - a.length);
  if (!parts.length) return <>{text}</>;
  const re = new RegExp(`(${parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return (
    <>
      {text.split(re).map((piece, i) =>
        parts.includes(piece) ? (
          <mark key={i} className="bg-transparent text-brand-ink underline decoration-brand-orange decoration-2 underline-offset-4">
            {piece}
          </mark>
        ) : (
          <span key={i}>{piece}</span>
        )
      )}
    </>
  );
}

/** "Test copy against your rules": the one shared rule check (rule-check.ts). An assistant: never uses AI credits. */
export function TestCopyCard({ clientId }: { clientId?: string }) {
  const [state, action, pending] = useActionState<TestCopyState, FormData>(testCopyAction, {});
  const [copied, setCopied] = useState(false);
  const r = state.result;
  return (
    <section aria-label="Test copy against your rules" className="overflow-hidden rounded-[12px] bg-white">
      <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[18px] font-normal">Test copy against your rules</h2>
      <form action={action} className="flex flex-col gap-4 px-6 py-5">
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        <label htmlFor="rules-test-copy" className="sr-only">
          Copy to check
        </label>
        <textarea id="rules-test-copy" name="text" required rows={3} defaultValue={state.text} placeholder="Paste a headline, caption or email…" className="min-h-20 w-full rounded-[10px] border border-brand-outline px-4 py-3 text-[14px] leading-[1.5] outline-none focus:border-brand-ink" data-gramm="false" />
        {r && state.text && r.violations.length > 0 && (
          <p className="m-0 rounded-[10px] border border-brand-line px-4 py-3 text-[14px] leading-[1.5]">
            <Highlighted text={state.text} marks={r.violations.flatMap((v) => v.offending)} />
          </p>
        )}
        {state.error && <p className="m-0 text-[13px] text-ds-danger-text">{state.error}</p>}
        {r && (
          <>
            {r.violations.length === 0 ? (
              <p className="m-0 flex items-center gap-2 text-[14px]">
                <Check className="size-4 text-brand-lime-strong" /> Follows all {r.total} rules{r.aiChecked ? "" : " we could check"}.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {r.violations.map((v) => (
                  <li key={v.ruleId} className="flex gap-2.5 text-[14px] leading-[1.45]">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand-orange" strokeWidth={1.75} />
                    <span className="flex flex-col">
                      <b className="font-semibold">{v.why}</b>
                      <span className="text-[13px] text-brand-ink-2">{v.rule}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {r.fix && (
              <div className="flex flex-col gap-1 rounded-[10px] bg-brand-page px-4 py-3 text-[14px] leading-[1.5]">
                <span className="text-[13px] text-brand-ink-2">Suggested fix</span>
                {r.fix}
              </div>
            )}
          </>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className={pillClass("primary", "sm")}>
            {pending ? "Checking…" : r ? "Check again" : "Check copy"}
          </button>
          {r?.fix && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(r.fix!).then(
                  () => setCopied(true),
                  () => setCopied(false)
                );
              }}
              className={pillClass("secondary", "sm")}
            >
              {copied ? "Copied" : "Copy fix"}
            </button>
          )}
        </div>
        <span className="flex flex-wrap items-center gap-2 text-[12px] text-brand-ink-2">
          Included: checks never use AI credits
        </span>
      </form>
    </section>
  );
}

/** Import from guidelines: a PDF → draft rules an admin approves one by one (none apply before that). */
export function ImportCard({ clientId }: { clientId?: string }) {
  const [state, action, pending] = useActionState<RuleFormState, FormData>(importGuidelinesAction, {});
  const [name, setName] = useState<string | null>(null);
  return (
    <section id="import" aria-label="Import from guidelines" className="overflow-hidden rounded-[12px] bg-white">
      <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[18px] font-normal">Import from guidelines</h2>
      <form action={action} className="flex flex-col gap-3 px-6 py-5">
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        <p className="m-0 text-[14px] leading-[1.5] text-brand-ink-2">Upload your brand guidelines (PDF). We turn them into draft rules you approve one by one.</p>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-[10px] border border-dashed border-brand-outline px-4 py-5 text-center text-[14px] hover:border-brand-ink">
          <input type="file" name="file" accept="application/pdf" className="sr-only" onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} />
          {name ?? (
            <span>
              Drop a PDF here or <span className="underline underline-offset-2">choose a file</span>
            </span>
          )}
        </label>
        {name && (
          <button type="submit" disabled={pending} className={pillClass("primary", "sm")}>
            {pending ? "Reading the guidelines…" : "Draft rules from it"}
          </button>
        )}
        {state.error && <p className="m-0 text-[13px] text-ds-danger-text">{state.error}</p>}
        {state.ok && <p className="m-0 text-[13px]">{state.ok}</p>}
        <span className="flex flex-wrap items-center gap-2 text-[12px] text-brand-ink-2">
          Included: reading the file never uses AI credits
        </span>
      </form>
    </section>
  );
}
