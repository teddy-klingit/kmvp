"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Users } from "lucide-react";
import { pillClass } from "@/components/ds/button";
import { editVersionAction, polishVersionAction, versionAction, type PolishState, type RunVersionsState } from "@/lib/actions/self-service-agent-actions";
import { cn } from "@/lib/utils";

export type VersionView = {
  runId: string;
  letter: string;
  headline: string;
  body: string;
  cta: string;
  image: string | null;
  imageError: string | null;
  check: { total: number; passed: number; violations: { rule: string; why: string }[] } | null;
  saved: boolean;
};

const TINTS = ["#E4ECEE", "#F6CDB8", "#F6E7B8", "#F7E6F7"];
const short = (t: string) => (t.length > 44 ? `${t.slice(0, 42).trimEnd()}…` : t);
const ASPECT: Record<string, string> = { "Story 9:16": "aspect-[9/14]", "Feed 4:5": "aspect-[4/5]", "Square 1:1": "aspect-square", "Landscape 16:9": "aspect-[16/9]", "Carousel 4:5": "aspect-[4/5]", "Carousel 1:1": "aspect-square" };

/**
 * The versions side by side (design 03), each with the shared Brand OS check, and Save · Edit · Redo; pick one and
 * ask Klingit to polish it. A failed image says so honestly and offers Try again (charged only when it works).
 */
export function SkillVersions({ agentId, versions, format, visual, then }: { agentId: string; versions: VersionView[]; format: string | null; visual: boolean; then: { href: string; name: string } | null }) {
  const [picked, setPicked] = useState(versions[Math.min(1, versions.length - 1)]?.letter ?? "A");
  const [editing, setEditing] = useState<string | null>(null);
  const [polish, polishAction, polishing] = useActionState<PolishState, FormData>(polishVersionAction, {});
  const chosen = versions.find((v) => v.letter === picked) ?? versions[0];

  return (
    <div className="flex flex-col gap-4">
      <ul className={cn("m-0 grid list-none gap-3 p-0", versions.length >= 3 ? "grid-cols-1 min-[900px]:grid-cols-3" : "grid-cols-1 min-[700px]:grid-cols-2")}>
        {versions.map((v, i) => (
          <li key={v.runId} onClick={() => setPicked(v.letter)} className={cn("flex cursor-pointer flex-col gap-3 rounded-[14px] bg-white p-3", picked === v.letter && "ring-2 ring-brand-ink")}>
            {visual ? (
              <div className={cn("relative flex w-full flex-col justify-end gap-3 overflow-hidden rounded-[10px] p-4", ASPECT[format ?? ""] ?? "aspect-[4/5]")} style={{ backgroundColor: TINTS[i % TINTS.length] }}>
                <span className="absolute left-3 top-3 flex size-6 items-center justify-center rounded-[6px] bg-white text-[11px] font-semibold">{v.letter}</span>
                {v.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- this version's generated image
                  <img src={v.image} alt={`Version ${v.letter}`} className="absolute inset-0 size-full object-cover" />
                ) : (
                  <>
                    {v.headline && <span className="font-serif text-[22px] leading-[1.15] text-brand-ink">{v.headline}</span>}
                    {v.cta && <span className="self-start rounded-full bg-[#3B2B26] px-3 py-1 text-[11px] text-white">{v.cta}</span>}
                  </>
                )}
              </div>
            ) : (
              <div className="flex min-h-40 flex-col gap-2 rounded-[10px] bg-brand-page p-4 text-[14px] leading-[1.5]">
                <span className="flex size-6 items-center justify-center rounded-[6px] bg-white text-[11px] font-semibold">{v.letter}</span>
                {v.headline && <b className="font-semibold">{v.headline}</b>}
                <span className="line-clamp-6 text-brand-ink-2">{v.body}</span>
              </div>
            )}
            {v.imageError && (
              <div role="status" className="flex flex-col gap-2 rounded-[10px] bg-[#FFF6DA] px-3 py-2 text-[13px] leading-[1.45]">
                Image generation didn&apos;t run. The words above are still ready to use.
                <form action={versionAction} onClick={(e) => e.stopPropagation()}>
                  <input type="hidden" name="agentId" value={agentId} />
                  <input type="hidden" name="runId" value={v.runId} />
                  <input type="hidden" name="op" value="image" />
                  <button type="submit" className="text-[13px] underline underline-offset-2">
                    Try again
                  </button>
                </form>
              </div>
            )}
            {v.check ? (
              v.check.violations.length === 0 ? (
                <span className="flex items-center gap-1.5 text-[13px]">
                  <Check className="size-4 text-brand-lime-strong" /> Brand OS check · {v.check.passed} of {v.check.total}
                </span>
              ) : (
                <span className="flex items-start gap-1.5 text-[13px] text-ds-danger-text" title={v.check.violations.map((x) => x.why).join(" · ")}>
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                  {v.check.violations.length === 1 ? `1 rule: ${short(v.check.violations[0].rule)}` : `${v.check.violations.length} rules: ${v.check.violations.map((x) => short(x.rule)).join("; ")}`}
                </span>
              )
            ) : (
              <span className="text-[13px] text-brand-ink-2">No words to check</span>
            )}
            {editing === v.runId ? (
              <EditForm agentId={agentId} version={v} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                <form action={versionAction}>
                  <input type="hidden" name="agentId" value={agentId} />
                  <input type="hidden" name="runId" value={v.runId} />
                  <input type="hidden" name="op" value="save" />
                  <button type="submit" disabled={v.saved} className={pillClass(picked === v.letter && !v.saved ? "primary" : "secondary", "sm")}>
                    {v.saved ? "Saved" : "Save"}
                  </button>
                </form>
                <button type="button" onClick={() => setEditing(v.runId)} className={pillClass("secondary", "sm")}>
                  Edit
                </button>
                <form action={versionAction}>
                  <input type="hidden" name="agentId" value={agentId} />
                  <input type="hidden" name="runId" value={v.runId} />
                  <input type="hidden" name="op" value="redo" />
                  <button type="submit" className={pillClass("secondary", "sm")}>
                    Redo
                  </button>
                </form>
              </div>
            )}
          </li>
        ))}
      </ul>

      {then && (
        <Link href={then.href} className="self-start text-[14px] text-brand-ink underline underline-offset-2">
          Next: {then.name} for each version →
        </Link>
      )}

      <section aria-label="Ask Klingit to polish" className="flex flex-col gap-3 rounded-[14px] border border-brand-line bg-white px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-chip">
            <Users className="size-4" strokeWidth={1.75} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[16px]">Want it perfect? Ask Klingit to polish version {chosen?.letter}.</span>
            <span className="text-[13px] text-brand-ink-2">A Klingit designer refines it and sends it back for review, usually within 2 working days.</span>
          </span>
        </div>
        {polish.ok ? (
          <p className="m-0 text-[14px]">
            {polish.ok}{" "}
            <Link href={`/projects/${polish.projectId}`} className="underline underline-offset-2">
              Open it
            </Link>
          </p>
        ) : (
          <form action={polishAction} className="flex flex-wrap items-center justify-end gap-3">
            <input type="hidden" name="agentId" value={agentId} />
            <input type="hidden" name="runId" value={chosen?.runId} />
            {polish.error && <span className="text-[13px] text-ds-danger-text">{polish.error}</span>}
            <span className="text-[12px] text-brand-ink-2">≈ 2 team credits</span>
            <button type="submit" disabled={polishing} className={pillClass("primary", "md")}>
              {polishing ? "Adding…" : "Ask Klingit to polish"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function EditForm({ agentId, version, onDone }: { agentId: string; version: VersionView; onDone: () => void }) {
  const [state, action, pending] = useActionState<RunVersionsState, FormData>(async (prev, fd) => {
    const r = await editVersionAction(prev, fd);
    if (!r.error) onDone();
    return r;
  }, {});
  return (
    <form action={action} className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      <input type="hidden" name="agentId" value={agentId} />
      <input type="hidden" name="runId" value={version.runId} />
      {version.headline !== "" && <input name="headline" defaultValue={version.headline} aria-label="Headline" className="h-9 rounded-[8px] border border-brand-outline px-3 text-[14px]" />}
      {version.cta !== "" && <input name="cta" defaultValue={version.cta} aria-label="Call to action" className="h-9 rounded-[8px] border border-brand-outline px-3 text-[14px]" />}
      {version.headline === "" && <textarea name="body" defaultValue={version.body} rows={4} aria-label="Text" className="rounded-[8px] border border-brand-outline px-3 py-2 text-[14px]" />}
      {state.error && <span className="text-[12px] text-ds-danger-text">{state.error}</span>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={pillClass("primary", "sm")}>
          {pending ? "Checking…" : "Save and check"}
        </button>
        <button type="button" onClick={onDone} className={pillClass("secondary", "sm")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
