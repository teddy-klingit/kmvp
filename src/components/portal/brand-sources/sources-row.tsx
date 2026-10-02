"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, Plus, X } from "lucide-react";
import { AppIcon } from "@/components/portal/brand-sources/app-icon";
import { addSourceFromAppAction, addSourceLinkAction, removeSourceAction, type SourceState } from "@/lib/actions/brand-source-actions";
import { appMeta, detectApp, normaliseUrl, type DemoFile } from "@/lib/brand-sources";
import { cn } from "@/lib/utils";

export type SourceChipData = { id: string; app: string; url: string; title: string; isDemo: boolean };
export type ConnectedApp = { app: string; files: DemoFile[] };

/** A linked source: app icon, name, external-link icon. Clicking opens it in a new tab; × archives it. */
export function SourceChip({ source, removable = true }: { source: SourceChipData; removable?: boolean }) {
  return (
    <span className="group inline-flex h-11 max-w-full items-center gap-2 rounded-full border border-brand-outline bg-white pl-1.5 pr-1 text-[14px] text-brand-ink sm:h-10">
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-2 text-brand-ink no-underline hover:underline" title={source.url}>
        <AppIcon app={source.app} size={13} tile />
        <span className="truncate">{source.title}</span>
        {source.isDemo && <span className="rounded-full bg-ds-subtle px-1.5 text-[11px] text-ds-text-2">demo</span>}
        <ExternalLink className="size-3 shrink-0 text-ds-text-3" strokeWidth={1.75} />
      </a>
      {removable ? (
        <form action={removeSourceAction} className="flex">
          <input type="hidden" name="sourceId" value={source.id} />
          <button type="submit" aria-label={`Remove ${source.title}`} className="flex size-6 items-center justify-center rounded-full text-ds-text-3 hover:bg-ds-subtle hover:text-ds-text">
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </form>
      ) : (
        <span className="w-1.5" />
      )}
    </span>
  );
}

/** The "Sources" row under each Brand OS section: chips plus "+ Add source". */
export function SourcesRow({ section, sources, connected, divider = true }: { section: string; sources: SourceChipData[]; connected: ConnectedApp[]; divider?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-3", divider && "border-t border-brand-line pt-5")}>
      <span className="text-[12px] text-brand-ink-2">Sources for this section</span>
      <div className="flex flex-wrap items-center gap-2">
        {sources.map((s) => (
          <SourceChip key={s.id} source={s} />
        ))}
        <AddSourcePopover section={section} connected={connected} />
      </div>
    </div>
  );
}

export function AddSourcePopover({ section, connected, label = "Add source" }: { section: string; connected: ConnectedApp[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"link" | "apps">("link");
  // Opens to the right of the chip, or right-aligned when there isn't room (never past the viewport edge).
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAlignRight(rect.left + 340 > window.innerWidth - 16);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className="inline-flex h-11 items-center gap-1 rounded-full border border-dashed border-brand-lime-strong bg-[#F1F7E1] px-4 text-[14px] text-brand-ink hover:brightness-[0.98] sm:h-10"
      >
        <Plus className="size-3.5" strokeWidth={2} />
        {label}
      </button>
      {open && (
        <div role="dialog" aria-label="Add a source" className={cn("absolute top-10 z-30 flex w-[340px] max-w-[85vw] flex-col gap-3 rounded-[12px] border border-ds-border bg-white p-3 shadow-[0_8px_24px_rgba(16,24,40,0.12)]", alignRight ? "right-0" : "left-0")}>
          <div className="grid grid-cols-2 rounded-[8px] bg-ds-subtle p-[3px]" role="tablist">
            {(["link", "apps"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn("h-8 rounded-[6px] text-[13px]", tab === t ? "bg-white font-semibold text-ds-text shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "font-medium text-ds-text-2")}
              >
                {t === "link" ? "Paste a link" : "From connected apps"}
              </button>
            ))}
          </div>
          {tab === "link" ? <PasteLinkForm section={section} onDone={() => setOpen(false)} /> : <FromAppsList section={section} connected={connected} onDone={() => setOpen(false)} />}
        </div>
      )}
    </div>
  );
}

export function PasteLinkForm({ section, onDone, submitLabel = "Add link", inline = false }: { section?: string; onDone?: () => void; submitLabel?: string; inline?: boolean }) {
  const [url, setUrl] = useState("");
  const [state, action, pending] = useActionState<SourceState, FormData>(async (prev, fd) => {
    const r = await addSourceLinkAction(prev, fd);
    if (r.ok) {
      setUrl("");
      onDone?.();
    }
    return r;
  }, {});
  const valid = normaliseUrl(url);
  const app = valid ? detectApp(valid) : null;
  return (
    <form action={action} className={cn("flex flex-col gap-2", inline && "sm:grid sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] sm:gap-x-2")}>
      {section && <input type="hidden" name="section" value={section} />}
      <label className="flex h-10 items-center gap-2 rounded-[8px] border border-ds-control-border px-2.5 focus-within:border-ds-text-3 focus-within:ring-4 focus-within:ring-ds-text/5">
        {app ? <AppIcon app={app} size={16} /> : <Link2 className="size-4 text-ds-text-3" strokeWidth={1.75} />}
        <span className="sr-only">Link</span>
        <input
          name="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.figma.com/file/…"
          className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ds-text outline-none placeholder:text-ds-text-3"
          autoFocus={!inline}
        />
      </label>
      <input name="title" placeholder="Name (optional)" className="h-10 rounded-[8px] border border-ds-control-border px-2.5 text-[14px] outline-none placeholder:text-ds-text-3 focus:border-ds-text-3 focus:ring-4 focus:ring-ds-text/5" />
      <div className={cn("flex items-center gap-2", inline && "sm:col-span-2")}>
        <span className="min-w-0 flex-1 text-[12px] text-ds-text-2">{app ? `Recognised: ${appMeta(app).name}` : "Google Drive, Figma, Notion, Dropbox, SharePoint, Canva, Frame.io or any site"}</span>
        <button type="submit" disabled={pending || !valid} className="h-9 rounded-[8px] bg-ds-text px-3.5 text-[13px] font-medium text-white disabled:opacity-40">
          {submitLabel}
        </button>
      </div>
      {state.error && <p className="m-0 text-[12px] text-ds-danger-text">{state.error}</p>}
    </form>
  );
}

function FromAppsList({ section, connected, onDone }: { section: string; connected: ConnectedApp[]; onDone: () => void }) {
  const [state, action, pending] = useActionState<SourceState, FormData>(async (prev, fd) => {
    const r = await addSourceFromAppAction(prev, fd);
    if (r.ok) onDone();
    return r;
  }, {});
  if (connected.length === 0) {
    return (
      <p className="m-0 px-1 py-2 text-[13px] text-ds-text-2">
        No apps connected yet.{" "}
        <Link href="/assets/sources" className="font-medium text-ds-text">
          Connect one in Sources
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
      {connected.map((c) => (
        <div key={c.app} className="flex flex-col">
          <span className="flex items-center gap-1.5 px-1 pb-1 pt-2 text-[12px] font-medium text-ds-text-2">
            <AppIcon app={c.app} size={12} />
            {appMeta(c.app).name}
          </span>
          {c.files.map((f) => (
            <form key={f.key} action={action}>
              <input type="hidden" name="app" value={c.app} />
              <input type="hidden" name="file" value={f.key} />
              <input type="hidden" name="section" value={section} />
              <button type="submit" disabled={pending} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-left text-[13px] text-ds-text hover:bg-ds-subtle">
                <AppIcon app={c.app} size={14} />
                <span className="min-w-0 flex-1 truncate">{f.title}</span>
                <span className="text-[11px] text-ds-text-3">{f.kind}</span>
              </button>
            </form>
          ))}
        </div>
      ))}
      <p className="m-0 px-1 pt-2 text-[11px] text-ds-text-3">Demo: no data is synced yet</p>
      {state.error && <p className="m-0 text-[12px] text-ds-danger-text">{state.error}</p>}
    </div>
  );
}

export function RemoveSourceButton({ sourceId, label }: { sourceId: string; label: string }) {
  return (
    <form action={removeSourceAction}>
      <input type="hidden" name="sourceId" value={sourceId} />
      <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium text-ds-text-2 hover:bg-ds-subtle hover:text-ds-text">
        <X className="size-3.5" strokeWidth={2} />
        {label}
      </button>
    </form>
  );
}
