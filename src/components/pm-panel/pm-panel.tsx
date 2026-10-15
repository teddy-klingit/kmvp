"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Folder, Paperclip, X } from "lucide-react";
import { clientPanelAction, clientSendAction, staffPanelAction, staffSendAction, type PanelData } from "@/lib/actions/pm-message-actions";
import { cn } from "@/lib/utils";

/**
 * The PM message panel (Phase U, design HomeMessage): right-hand, over the current page (full screen on phones).
 * Header with the PM, reply time and Book a call; All / General / About a project; the thread with project chips;
 * the composer with an "About" picker, attachments, Enter to send and a draft kept when it's closed.
 */

const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
}
const initials = (n: string) =>
  n
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function PmPanel({ side, clientId, projectId, onClose }: { side: "client" | "staff"; clientId?: string; projectId: string | null; onClose: () => void }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [filter, setFilter] = useState<"all" | "general" | "project">("all");
  const [about, setAbout] = useState<string | null>(projectId);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const draftKey = `pm-draft:${side}:${clientId ?? "me"}`;
  const [body, setBody] = useState(() => {
    try {
      return localStorage.getItem(draftKey) ?? "";
    } catch {
      return "";
    }
  });
  const end = useRef<HTMLDivElement>(null);
  const load = () => (side === "staff" && clientId ? staffPanelAction(clientId) : clientPanelAction()).then(setData);

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, body);
    } catch {}
  }, [body, draftKey]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [data, filter]);

  const shown = useMemo(() => (data?.thread ?? []).filter((m) => filter === "all" || (filter === "general" ? m.source === "general" : m.source === "project")), [data, filter]);
  const aboutName = about ? data?.projects.find((p) => p.id === about)?.name : null;
  const projectHref = (id: string) => (side === "staff" ? `/ops/projects/${id}` : `/projects/${id}`);

  const send = () => {
    if (!body.trim() && !files.length) return;
    const fd = new FormData();
    fd.set("body", body);
    if (about) fd.set("projectId", about);
    if (clientId) fd.set("clientId", clientId);
    for (const f of files) fd.append("files", f);
    start(async () => {
      const r = await (side === "staff" ? staffSendAction(fd) : clientSendAction(fd));
      if (r.error) return setError(r.error);
      setError(null);
      setBody("");
      setFiles([]);
      await load();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={side === "client" ? "Message your Marketing PM" : `Messages with ${data?.title ?? "the client"}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 hidden bg-[rgba(30,30,30,0.18)] sm:block" />
      <div className="relative flex h-full w-full flex-col bg-white shadow-[-8px_0_32px_rgba(30,30,30,0.12)] sm:w-[460px]">
        <header className="flex items-start gap-3 border-b border-brand-line px-5 py-4" style={{ paddingTop: "calc(16px + env(safe-area-inset-top, 0px))" }}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#B8860B] text-[14px] font-medium text-white">{data?.initials ?? "…"}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[17px]">{data?.title ?? "Messages"}</span>
            <span className="text-[12px] leading-[1.4] text-brand-ink-2">{data?.subtitle ?? ""}</span>
          </span>
          {data?.bookingUrl && (
            <a href={data.bookingUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-full border border-[#CFC8B8] px-3.5 font-brand-mono text-[12px] text-brand-ink no-underline">
              Book a call
            </a>
          )}
          <button type="button" onClick={onClose} aria-label="Close messages" className="flex size-9 items-center justify-center rounded-full hover:bg-brand-page">
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </header>
        <nav aria-label="Show" className="flex gap-2 border-b border-brand-line px-5 py-3">
          {(
            [
              ["all", "All"],
              ["general", "General"],
              ["project", "About a project"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={cn("h-9 rounded-full border px-3.5 text-[13px]", filter === k ? "border-brand-ink bg-brand-ink text-white" : "border-[#DCD6C8] bg-white")}>
              {l}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!data ? (
            <p className="text-[14px] text-brand-ink-2">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-[14px] text-brand-ink-2">{filter === "all" ? "No messages yet. Say hi." : "Nothing here yet."}</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {shown.map((m, i) => {
                const d = dayLabel(m.createdAt);
                const sep = i === 0 || dayLabel(shown[i - 1].createdAt) !== d;
                // The client's own messages sit right; Klingit's left (for staff, the reverse view: theirs right).
                const right = side === "client" ? !m.fromKlingit : m.fromKlingit;
                return (
                  <li key={m.id} className="flex flex-col gap-1">
                    {sep && <span className="my-2 flex items-center gap-3 font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-ink-2 before:h-px before:flex-1 before:bg-brand-line after:h-px after:flex-1 after:bg-brand-line">{d}</span>}
                    <span className={cn("flex items-end gap-2", right && "flex-row-reverse")}>
                      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] text-white", m.fromKlingit ? "bg-[#B8860B]" : "bg-[#B0344B]")}>{initials(m.authorName)}</span>
                      <span className={cn("flex max-w-[78%] flex-col gap-1", right && "items-end")}>
                        {m.project && (
                          <Link href={projectHref(m.project.id)} className="inline-flex items-center gap-1 self-start rounded-full bg-brand-page px-2 py-0.5 text-[12px] text-brand-ink-2 no-underline hover:text-brand-ink">
                            <Folder className="size-3" strokeWidth={1.75} /> {m.project.name} ›
                          </Link>
                        )}
                        <span className={cn("whitespace-pre-wrap rounded-[14px] px-3.5 py-2.5 text-[14px] leading-[1.45]", right ? "bg-brand-ink text-white" : "bg-brand-page text-brand-ink")}>{m.body}</span>
                        {m.attachments.map((a) => (
                          <a key={a.storageKey} href={a.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-brand-ink-2">
                            <Paperclip className="size-3" strokeWidth={1.75} /> {a.name}
                          </a>
                        ))}
                        <span className="text-[11px] text-brand-ink-2">
                          {m.authorName.split(" ")[0]} · {time(m.createdAt)}
                        </span>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          <div ref={end} />
        </div>

        <div className="relative flex flex-col gap-2 border-t border-brand-line px-5 py-3" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
          {picking && data && (
            <div className="absolute bottom-full left-5 right-5 mb-2 max-h-[320px] overflow-y-auto rounded-[12px] border border-brand-line bg-white p-2 shadow-[0_8px_24px_rgba(30,30,30,0.12)]">
              <span className="block px-2 py-1.5 font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-ink-2">What is it about?</span>
              {search !== null && <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all projects" aria-label="Search all projects" className="mb-1 h-9 w-full rounded-[8px] border border-[#CFC8B8] px-2.5 text-[14px] outline-none" />}
              {[{ id: null as string | null, name: "General, not a project" }, ...data.projects.filter((p) => (search === null ? p.active : p.name.toLowerCase().includes(search.toLowerCase())))].map((p) => (
                <button
                  key={p.id ?? "general"}
                  type="button"
                  onClick={() => {
                    setAbout(p.id);
                    setPicking(false);
                    setSearch(null);
                  }}
                  className={cn("flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[14px] hover:bg-brand-page", about === p.id && "bg-brand-page")}
                >
                  <span className="w-4">{about === p.id && <Check className="size-4" strokeWidth={2} />}</span>
                  {p.name}
                </button>
              ))}
              {search === null && (
                <button type="button" onClick={() => setSearch("")} className="w-full rounded-[8px] px-2.5 py-2 text-left text-[14px] text-brand-ink-2 hover:bg-brand-page">
                  Search all projects…
                </button>
              )}
            </div>
          )}
          <button type="button" onClick={() => setPicking((x) => !x)} className="self-start rounded-full bg-brand-page px-3 py-1 text-[12px]">
            About: {aboutName ?? "General, not a project"} ▾
          </button>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            placeholder={side === "client" ? "Write to your Marketing PM" : "Write to the client"}
            aria-label="Message"
            className="w-full resize-none rounded-[12px] border border-[#CFC8B8] px-3.5 py-2.5 text-[14px] outline-none focus:border-brand-ink"
          />
          <span className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1 text-[13px] text-brand-ink-2">
              <Paperclip className="size-4" strokeWidth={1.75} /> Attach
              <input type="file" multiple accept="image/*,application/pdf,video/*" className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            </label>
            {files.length > 0 && <span className="text-[12px] text-brand-ink-2">{files.map((f) => f.name).join(", ")}</span>}
            {error && <span className="text-[12px] text-[#A8321F]">{error}</span>}
            <button type="button" onClick={send} disabled={pending} className="ml-auto inline-flex h-9 items-center rounded-full bg-brand-orange px-4 font-brand-mono text-[12px] text-white disabled:opacity-50">
              {pending ? "Sending…" : "Send"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
