"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { runSkillVersionsAction, type RunVersionsState } from "@/lib/actions/self-service-agent-actions";
import type { SkillForm } from "@/lib/skill-forms";
import { cn } from "@/lib/utils";

const chip = (on: boolean) => cn("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px]", on ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white text-brand-ink hover:border-brand-ink");

export type StartOption = { value: string; label: string; color: string };

/**
 * The run form (design 03): format and channel as chips, the product from Brand OS, what it should say, where it
 * starts from, 1–4 versions, an optional project; the cost is shown before Run.
 */
export function SkillRunForm({
  agentId,
  form,
  products,
  starts,
  projects,
  aiPerRun,
  left,
  initial,
}: {
  agentId: string;
  form: SkillForm;
  products: { name: string; color: string }[];
  starts: StartOption[];
  projects: { id: string; name: string }[];
  aiPerRun: number | null;
  left: string | null;
  initial: { format: string | null; channel: string | null; product: string | null; say: string; versions: number; startFrom: string };
}) {
  const [state, action, pending] = useActionState<RunVersionsState, FormData>(runSkillVersionsAction, {});
  const [format, setFormat] = useState(initial.format ?? form.formats?.[0] ?? null);
  const [channel, setChannel] = useState(initial.channel ?? form.channels?.[0] ?? null);
  const [product, setProduct] = useState(initial.product);
  const [versions, setVersions] = useState(form.versions ? initial.versions : 1);
  const [start, setStart] = useState(initial.startFrom);
  const cost = aiPerRun != null ? Math.round(aiPerRun * versions) : null;

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="agentId" value={agentId} />
      {format && <input type="hidden" name="format" value={format} />}
      {channel && <input type="hidden" name="channel" value={channel} />}
      {product && <input type="hidden" name="product" value={product} />}
      <input type="hidden" name="versions" value={versions} />
      <input type="hidden" name="startFrom" value={start} />

      {form.formats && (
        <Field label="Format">
          {form.formats.map((f) => (
            <button key={f} type="button" onClick={() => setFormat(f)} className={chip(format === f)} aria-pressed={format === f}>
              {f}
            </button>
          ))}
        </Field>
      )}
      {form.channels && form.channels.length > 1 && (
        <Field label="Channel">
          {form.channels.map((c) => (
            <button key={c} type="button" onClick={() => setChannel(c)} className={chip(channel === c)} aria-pressed={channel === c}>
              {c}
            </button>
          ))}
        </Field>
      )}
      {products.length > 0 && (
        <Field label="Product" note="From Brand OS · product facts and claims come with it">
          {products.map((p) => (
            <button key={p.name} type="button" onClick={() => setProduct(product === p.name ? null : p.name)} className={chip(product === p.name)} aria-pressed={product === p.name}>
              <span aria-hidden className="size-6 rounded-full border border-black/5" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
          ))}
        </Field>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold">{form.say}</span>
        <textarea name="say" required rows={3} defaultValue={initial.say} placeholder={form.sayPlaceholder} className="min-h-20 rounded-[14px] border border-brand-outline px-4 py-3 text-[15px] leading-[1.5] outline-none focus:border-brand-ink" data-gramm="false" />
      </label>

      {form.startFrom && starts.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold">Start from</span>
          <div className="grid grid-cols-3 gap-2">
            {starts.map((s) => (
              <button key={s.value} type="button" onClick={() => setStart(s.value)} aria-pressed={start === s.value} className={cn("flex flex-col gap-2 rounded-[10px] border p-2 text-left text-[12px] leading-[1.35]", start === s.value ? "border-2 border-brand-ink" : "border-brand-outline hover:border-brand-ink")}>
                <span aria-hidden className="block h-14 rounded-[6px]" style={{ backgroundColor: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {form.versions && (
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold">Versions</span>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((v) => (
              <button key={v} type="button" onClick={() => setVersions(v)} aria-pressed={versions === v} className={cn("flex size-9 items-center justify-center rounded-full border text-[14px]", versions === v ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline hover:border-brand-ink")}>
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold">Link to a project</span>
          <select name="projectId" defaultValue="" className="h-11 rounded-full border border-brand-outline bg-white px-4 text-[15px]">
            <option value="">None · keep it as a one-off</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-brand-ink-2">Optional. Linked runs show up in the project and in Usage by project.</span>
        </label>
      )}

      {state.error && (
        <p className="m-0 rounded-[10px] bg-brand-peach-pale px-4 py-3 text-[14px]" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-brand-line pt-5">
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-ink px-5 font-brand-mono text-[13px] text-white hover:bg-black disabled:opacity-70">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? `Making ${versions} version${versions === 1 ? "" : "s"}…` : `Run${cost != null ? ` · ≈ ${cost} AI credits` : ""}`}
        </button>
        {left && <span className="text-[13px] text-brand-ink-2">{left}</span>}
        {cost != null && <PlaceholderTag className="ml-auto" />}
      </div>
    </form>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      <span className="text-[14px] font-semibold">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
      {note && <span className="text-[12px] text-brand-ink-2">{note}</span>}
    </div>
  );
}
