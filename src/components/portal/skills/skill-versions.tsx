"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, Maximize2, Users, X } from "lucide-react";
import { InContext, SafeZoneOverlay } from "@/components/review/in-context";
import { safeZoneFor } from "@/lib/safe-zones";
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
const RATIO: Record<string, number> = { "Story 9:16": 9 / 16, "Feed 4:5": 4 / 5, "Square 1:1": 1, "Landscape 16:9": 16 / 9, "Carousel 4:5": 4 / 5, "Carousel 1:1": 1 };
const ASPECT: Record<string, string> = { "Story 9:16": "aspect-[9/14]", "Feed 4:5": "aspect-[4/5]", "Square 1:1": "aspect-square", "Landscape 16:9": "aspect-[16/9]", "Carousel 4:5": "aspect-[4/5]", "Carousel 1:1": "aspect-square" };

/**
 * The versions side by side (design 03), each with the shared Brand OS check, and Save · Edit · Redo; pick one and
 * ask Klingit to polish it. A failed image says so honestly and offers Try again (charged only when it works).
 */
export function SkillVersions({ agentId, brand, versions, format, visual, then }: { agentId: string; brand: string; versions: VersionView[]; format: string | null; visual: boolean; then: { href: string; name: string } | null }) {
  const [picked, setPicked] = useState(versions[Math.min(1, versions.length - 1)]?.letter ?? "A");
  const [preview, setPreview] = useState<VersionView | null>(null);
  // Stories and Reels: shade the dead areas the platform's own UI covers.
  const zone = visual ? safeZoneFor(format) : null;
  const [zones, setZones] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [polish, polishAction, polishing] = useActionState<PolishState, FormData>(polishVersionAction, {});
  const chosen = versions.find((v) => v.letter === picked) ?? versions[0];

  return (
    <div className="flex flex-col gap-4">
      {zone && versions.some((v) => v.image) && (
        <label className="flex items-center gap-2 self-start text-[13px]">
          <input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} className="size-4 accent-brand-ink" />
          Show safe zones <span className="text-brand-ink-2">({zone.label} are covered by the platform&apos;s UI)</span>
        </label>
      )}
      <ul className={cn("m-0 grid list-none gap-3 p-0", versions.length >= 3 ? "grid-cols-1 min-[900px]:grid-cols-3" : "grid-cols-1 min-[700px]:grid-cols-2")}>
        {versions.map((v, i) => (
          <li key={v.runId} onClick={() => setPicked(v.letter)} className={cn("flex cursor-pointer flex-col gap-3 rounded-[14px] bg-white p-3", picked === v.letter && "ring-2 ring-brand-ink")}>
            {visual ? (
              <div className={cn("relative flex w-full flex-col justify-end gap-3 overflow-hidden rounded-[10px] p-4", ASPECT[format ?? ""] ?? "aspect-[4/5]")} style={{ backgroundColor: TINTS[i % TINTS.length] }}>
                <span className="absolute left-3 top-3 z-20 flex size-6 items-center justify-center rounded-[6px] bg-white text-[11px] font-semibold">{v.letter}</span>
                {v.image ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- this version's generated image */}
                    <img src={v.image} alt={`Version ${v.letter}`} className="absolute inset-0 size-full object-cover" />
                    {zones && zone && <SafeZoneOverlay zone={zone} />}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreview(v);
                      }}
                      aria-label={`Enlarge version ${v.letter}`}
                      className="absolute right-3 top-3 z-20 flex size-8 items-center justify-center rounded-full bg-white/90 text-brand-ink shadow-sm hover:bg-white"
                    >
                      <Maximize2 className="size-4" strokeWidth={1.75} />
                    </button>
                  </>
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
                <span>
                  No image was made: {v.imageError.replace(/\.$/, "")}.{v.headline || v.body ? " The words above are still ready to use." : ""}
                </span>
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
                <details className="group text-[13px] text-ds-danger-text" onClick={(e) => e.stopPropagation()}>
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                    <AlertTriangle className="size-4 shrink-0" strokeWidth={1.75} />
                    {v.check.violations.length === 1 ? "1 rule not met" : `${v.check.violations.length} rules not met`}
                    <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0 text-brand-ink">
                    {v.check.violations.map((x) => (
                      <li key={x.rule} className="rounded-[8px] bg-[#FDF1F0] px-3 py-2 leading-[1.45]">
                        <span className="block font-medium">{x.rule}</span>
                        {x.why && <span className="block text-brand-ink-2">{x.why}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
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

      {preview && <Preview version={preview} brand={brand} format={format} onClose={() => setPreview(null)} />}

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

/**
 * A version large: the image itself, or in its placement (a story frame or a feed post, as in project review), with
 * the dead areas shaded on request. Esc or the backdrop closes it.
 */
function Preview({ version, brand, format, onClose }: { version: VersionView; brand: string; format: string | null; onClose: () => void }) {
  const [view, setView] = useState<"image" | "context">("context");
  const zone = safeZoneFor(format);
  const [zones, setZones] = useState(Boolean(zone));
  const ratio = RATIO[format ?? ""] ?? 4 / 5;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const tab = (on: boolean) => cn("h-9 rounded-full px-4 text-[13px]", on ? "bg-brand-ink text-white" : "bg-white text-brand-ink");
  return (
    <div role="dialog" aria-modal="true" aria-label={`Version ${version.letter}`} onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(15,14,12,0.78)] px-4 py-8">
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-[720px] flex-col items-center gap-4">
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="flex gap-1 rounded-full bg-white/15 p-1">
            <button type="button" onClick={() => setView("context")} className={tab(view === "context")}>
              In Instagram
            </button>
            <button type="button" onClick={() => setView("image")} className={tab(view === "image")}>
              Image
            </button>
          </span>
          {zone && (
            <label className="flex items-center gap-2 text-[13px] text-white">
              <input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} className="size-4 accent-white" />
              Show safe zones
            </label>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto flex size-9 items-center justify-center rounded-full bg-white text-brand-ink">
            <X className="size-4" />
          </button>
        </div>
        {view === "context" ? (
          <InContext src={version.image} alt={`Version ${version.letter}`} ratio={ratio} brand={brand} caption={version.body || version.headline} format={format} safeZones={zones} width={ratio < 0.7 ? 340 : ratio > 1.5 ? 600 : 440} />
        ) : (
          <span className="relative block w-full max-w-[560px] overflow-hidden rounded-[12px]">
            {/* eslint-disable-next-line @next/next/no-img-element -- this version's generated image */}
            <img src={version.image ?? ""} alt={`Version ${version.letter}`} className="block h-auto w-full" />
            {zones && zone && <SafeZoneOverlay zone={zone} />}
          </span>
        )}
        {zone && <p className="m-0 text-center text-[13px] text-white/80">{zone.label} are covered by the platform&apos;s UI: words, logo and the call to action belong between them.</p>}
      </div>
    </div>
  );
}
