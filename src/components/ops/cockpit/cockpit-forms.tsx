"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ds/button";
import {
  regenerateEstimateAction,
  updateBriefAction,
  updateDatesAction,
  uploadAssetAction,
  type CockpitState,
} from "@/lib/actions/cockpit-actions";
import { videoFrames } from "@/lib/media/video-frames";

const fieldCls = "rounded-[8px] border border-ds-control-border bg-white px-3 text-[14px] text-ds-text outline-none focus:border-ds-text-3";

function Status({ state }: { state: CockpitState }) {
  if (state.error) return <p className="m-0 text-[13px] text-ds-danger-text">{state.error}</p>;
  if (state.ok) return <p className="m-0 text-[13px] text-ds-success-text">{state.ok}</p>;
  return null;
}

function Footer({ note, cancelHref, submit, pending }: { note: string; cancelHref: string; submit: string; pending: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <span className="min-w-0 flex-1 text-[12px] text-ds-text-2">{note}</span>
      <Button asChild variant="secondary" size="md">
        <Link href={cancelHref} scroll={false}>
          Cancel
        </Link>
      </Button>
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {submit}
      </Button>
    </div>
  );
}

const BRIEF_FIELDS = [
  { name: "goals", label: "Objective" },
  { name: "targetAudience", label: "Audience" },
  { name: "successMetrics", label: "Success metric" },
  { name: "references", label: "References" },
  { name: "deliverablesNotes", label: "Deliverables" },
] as const;

export function BriefEditForm({ projectId, brief, cancelHref }: { projectId: string; brief: Record<(typeof BRIEF_FIELDS)[number]["name"], string | null>; cancelHref: string }) {
  const [state, action, pending] = useActionState<CockpitState, FormData>(updateBriefAction, {});
  return (
    <form action={action} className="flex flex-col gap-4 px-6 pb-5 pt-4">
      <input type="hidden" name="projectId" value={projectId} />
      {BRIEF_FIELDS.map((f) => (
        <label key={f.name} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[140px_1fr] sm:items-start sm:gap-4">
          <span className="pt-2 text-[13px] text-ds-text-2">{f.label}</span>
          <textarea name={f.name} defaultValue={brief[f.name] ?? ""} rows={2} className={`${fieldCls} resize-y py-2`} />
        </label>
      ))}
      <label className="grid grid-cols-1 gap-1.5 sm:grid-cols-[140px_1fr] sm:items-center sm:gap-4">
        <span className="text-[13px] text-ds-text-2">Why (optional)</span>
        <input name="reason" placeholder="Shown in the activity log" className={`${fieldCls} h-[38px]`} />
      </label>
      <Status state={state} />
      <Footer note="Saves a brief revision and logs a PM override on the Brief agent." cancelHref={cancelHref} submit="Save brief" pending={pending} />
    </form>
  );
}

const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function DatesForm({
  projectId,
  dueDate,
  etas,
  cancelHref,
}: {
  projectId: string;
  dueDate: Date | null;
  etas: { name: string; label: string; etaAt: Date | null }[];
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState<CockpitState, FormData>(updateDatesAction, {});
  return (
    <form action={action} className="flex flex-col gap-4 px-6 pb-5 pt-4">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-ds-text-2">Due date</span>
          <input type="date" name="dueDate" defaultValue={day(dueDate)} className={`${fieldCls} h-[38px]`} />
        </label>
        {etas.map((e) => (
          <label key={e.name} className="flex flex-col gap-1.5">
            <span className="text-[13px] text-ds-text-2">{e.label}</span>
            <input type="date" name={`eta_${e.name}`} defaultValue={day(e.etaAt)} className={`${fieldCls} h-[38px]`} />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ds-text">Reason for the client (required)</span>
        <input name="reason" required placeholder="e.g. Waiting on the Q3 numbers from finance" className={`${fieldCls} h-[38px]`} />
      </label>
      <Status state={state} />
      <Footer note="The client gets a system message with the new dates and your reason." cancelHref={cancelHref} submit="Save dates" pending={pending} />
    </form>
  );
}

/** A designer's upload: a new asset, or the next version of one. Either way the Brand OS check runs on it. */
export function UploadAssetForm({ projectId, assets = [] }: { projectId: string; assets?: { id: string; label: string }[] }) {
  // A video gets its poster frame and thumbnail strip drawn here, in the browser, and sent with the file.
  const [state, action, pending] = useActionState<CockpitState, FormData>(async (prev, fd) => {
    const file = fd.get("file");
    if (file instanceof File && file.type.startsWith("video/")) {
      const frames = await videoFrames(file);
      if (frames) {
        fd.set("poster", frames.poster, "poster.jpg");
        fd.set("strip", frames.strip, "strip.jpg");
        fd.set("durationSeconds", String(frames.durationSeconds));
      }
    }
    return uploadAssetAction(prev, fd);
  }, {});
  const [assetId, setAssetId] = useState("");
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      {assets.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-ds-text-2">This is</span>
          <select name="assetId" value={assetId} onChange={(e) => setAssetId(e.target.value)} className={`${fieldCls} h-9`}>
            <option value="">A new asset</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                A new version of {a.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!assetId && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-ds-text-2">Title</span>
            <input name="name" required placeholder="Beach hero" className={`${fieldCls} h-9`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-ds-text-2">Format</span>
            <input name="format" required placeholder="Story 9:16" className={`${fieldCls} h-9`} />
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[12px] text-ds-text-2">File · images and PDF up to 25 MB, video up to 250 MB</span>
          <input type="file" name="file" required accept="image/*,application/pdf,video/*" className="h-9 text-[13px] file:mr-3 file:h-9 file:rounded-[8px] file:border file:border-ds-control-border file:bg-white file:px-3 file:text-[13px] file:font-medium" />
        </label>
        <Button type="submit" variant="secondary" size="md" disabled={pending}>
          <Upload strokeWidth={1.75} />
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function RegenerateEstimateButton({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<CockpitState, FormData>(regenerateEstimateAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      {state.error && <span className="text-[12px] text-ds-danger-text">{state.error}</span>}
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        <Sparkles strokeWidth={1.75} />
        {pending ? "Regenerating…" : "Regenerate with AI"}
      </Button>
    </form>
  );
}
