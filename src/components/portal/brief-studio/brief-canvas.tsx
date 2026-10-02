"use client";

import { useState } from "react";
import { ArrowRight, FileText, Link2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { SourceTag } from "@/components/ds/source-tag";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSection, sectionFilled, SECTION_LABEL, type BriefSection, type SectionKey } from "@/lib/brief-studio/model";
import type { StudioView } from "@/lib/brief-studio/studio";

export type CanvasHandlers = {
  edit: (key: SectionKey, patch: { value?: string; items?: string[] }) => void;
  ask: (key: SectionKey) => void;
  basics: (b: { deadline?: string; markets?: string[] }) => void;
  attach: () => void;
  saveDraft: () => void;
  send: () => void;
};

/** The canvas order from the design; deadline and markets share one card. */
const CARDS: (SectionKey | "deadlineMarkets")[] = ["objective", "audience", "deliverables", "keyMessage", "tone", "references", "deadlineMarkets", "successMetric", "mustHaves", "notes"];
const LIST_KEYS = new Set<SectionKey>(["deliverables", "markets", "mustHaves"]);

function tagFor(s: BriefSection | undefined) {
  if (!s) return null;
  if (s.delegated) return <SourceTag tone="suggested">Klingit decides</SourceTag>;
  if (s.source === "brandOS") return <SourceTag tone="brandOS">From Brand OS</SourceTag>;
  if (s.source === "answer") return <SourceTag tone="answer">Your answer</SourceTag>;
  if (s.source === "pastProject") return <SourceTag tone="pastProject">From {s.sourceRef?.name ?? "a past project"}</SourceTag>;
  return <SourceTag tone="suggested">Suggested</SourceTag>;
}

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return y ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(y, m - 1, d)) : iso;
};
const joinAnd = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}` : l[0] ?? "");

// ─── Quality ───────────────────────────────────────────────────────────────

export function QualityBar({ score, compact = false }: { score: number; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="meter"
        aria-label="Brief quality"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        className="relative h-1.5 rounded-full"
        style={{ background: "linear-gradient(90deg, var(--brand-line) 80%, var(--brand-lime-zone) 80%)" }}
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-brand-ink transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${score}%` }} />
        <span aria-hidden className="absolute -top-[3px] left-1/2 h-2.5 w-px bg-brand-mute" />
        <span aria-hidden className="absolute -top-[3px] left-[80%] h-2.5 w-px bg-brand-mute" />
      </div>
      {!compact && (
        <div aria-hidden className="relative h-3.5 text-[11px] text-brand-mute">
          <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">Essentials</span>
          <span className="absolute left-[80%] -translate-x-1/2 whitespace-nowrap text-brand-lime-text">Great</span>
        </div>
      )}
    </div>
  );
}

function QualityBlock({ view, onAsk, disabled }: { view: StudioView; onAsk: (k: SectionKey) => void; disabled: boolean }) {
  const q = view.quality;
  return (
    <div className="flex flex-col gap-2.5 border-b border-brand-line px-7 pb-4 pt-3.5 max-[699px]:px-5">
      <div className="flex flex-wrap items-baseline gap-2 text-[14px]">
        <span className="font-semibold">Brief quality {q.score}</span>
        <span className="text-brand-mute">{q.status}</span>
      </div>
      <QualityBar score={q.score} />
      {q.suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-brand-mute">Make it great:</span>
          {q.suggestions.map((s) => (
            <button key={s.key} type="button" disabled={disabled} onClick={() => onAsk(s.key)} className="h-[30px] rounded-full border border-brand-rule bg-white px-3 text-[13px] hover:border-brand-outline disabled:opacity-60">
              +{s.points} {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sections ──────────────────────────────────────────────────────────────

function SectionCard({
  title,
  tag,
  active,
  editing,
  onEdit,
  disabled,
  children,
}: {
  title: string;
  tag: React.ReactNode;
  active: boolean;
  editing: boolean;
  onEdit: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-[10px] border px-4 py-3.5", active ? "border-brand-peach-line bg-brand-peach-active" : "border-transparent")}>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[13px] font-semibold">{title}</span>
        {!active && tag}
        {!editing && (
          <button type="button" aria-label={`Edit ${title.toLowerCase()}`} disabled={disabled} onClick={onEdit} className="flex size-[30px] items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-chip disabled:opacity-40">
            <Pencil className="size-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="text-[15px] leading-[1.5]">{children}</div>
      {active && <span className="text-[12px] text-brand-orange-text">Answering now</span>}
    </div>
  );
}

function Editor({ initial, list, onSave, onCancel }: { initial: string; list: boolean; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      {list ? (
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-label="Items, separated by commas" className="h-10 rounded-[10px] border border-brand-field px-3 text-[15px] outline-none focus:border-brand-ink" />
      ) : (
        <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} rows={3} aria-label="Section text" className="resize-y rounded-[10px] border border-brand-field px-3 py-2 text-[15px] leading-[1.5] outline-none focus:border-brand-ink" />
      )}
      {list && <span className="text-[12px] text-brand-mute">Separate items with commas</span>}
      <div className="flex gap-2">
        <button type="submit" className="h-9 rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white">
          Save
        </button>
        <button type="button" onClick={onCancel} className="h-9 rounded-full border border-brand-outline px-4 font-brand-mono text-[12px]">
          Cancel
        </button>
      </div>
    </form>
  );
}

const chip = "rounded-full bg-brand-nav px-2.5 py-1 text-[13px]";
const dashed = "rounded-full border border-dashed border-brand-field px-2.5 py-1 text-[13px] text-brand-ink-2 hover:border-brand-outline";

function Body({ s, h, disabled }: { s: BriefSection; h: CanvasHandlers; disabled: boolean }) {
  if (s.key === "deliverables") {
    return (
      <span className="flex flex-wrap gap-1.5">
        {(s.items ?? []).map((i) => (
          <span key={i} className={chip}>
            {i}
          </span>
        ))}
        {!s.items?.length && <span>{s.value}</span>}
        <button type="button" disabled={disabled} onClick={() => h.ask("deliverables")} className={dashed}>
          + more?
        </button>
      </span>
    );
  }
  if (s.key === "references") {
    return (
      <span className="flex flex-wrap gap-2">
        {(s.refs ?? []).map((r, i) => {
          const inner = (
            <>
              <span className="flex size-8 items-center justify-center rounded-[6px] bg-brand-pink-pale text-brand-ink-2">
                {r.kind === "file" ? <FileText className="size-4" strokeWidth={1.5} /> : r.kind === "link" ? <Link2 className="size-4" strokeWidth={1.5} /> : null}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{r.label}</span>
                {r.sub && <span className="text-[11px] text-brand-ink-2">{r.sub}</span>}
              </span>
            </>
          );
          const cls = "inline-flex max-w-[260px] items-center gap-2 rounded-[10px] border border-brand-field bg-white py-1 pl-1 pr-3 text-[13px] text-brand-ink no-underline";
          return r.url ? (
            <a key={i} href={r.url} target="_blank" rel="noreferrer" className={cls}>
              {inner}
            </a>
          ) : (
            <span key={i} className={cls}>
              {inner}
            </span>
          );
        })}
        {s.value && !s.refs?.length && <span>{s.value}</span>}
        <button type="button" disabled={disabled} onClick={h.attach} className="inline-flex items-center rounded-[10px] border border-dashed border-brand-field bg-white px-3.5 text-[13px] text-brand-ink-2 hover:border-brand-outline">
          + Add file or link
        </button>
      </span>
    );
  }
  if (s.key === "audience") {
    return (
      <>
        {s.value}
        {s.sourceRef?.id === "persona" && <span className="text-brand-ink-2"> Persona: &quot;{s.sourceRef.name}&quot;</span>}
      </>
    );
  }
  if (s.key === "budget") return <>{s.value}</>;
  if (s.items?.length) return <>{s.items.join(", ")}</>;
  return <span className="whitespace-pre-wrap">{s.value}</span>;
}

function DeadlineMarkets({ view, editing, onDone, h }: { view: StudioView; editing: boolean; onDone: () => void; h: CanvasHandlers }) {
  const markets = getSection(view.sections, "markets")?.items ?? [];
  const [date, setDate] = useState(view.basics.deadline.iso);
  const [list, setList] = useState(markets.join(", "));
  if (editing) {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          h.basics({ deadline: date, markets: list.split(",").map((m) => m.trim()).filter(Boolean) });
          onDone();
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] text-brand-mute">
          Final deadline
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 w-[200px] rounded-[10px] border border-brand-field px-3 text-[15px] text-brand-ink" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-brand-mute">
          Markets, separated by commas
          <input value={list} onChange={(e) => setList(e.target.value)} className="h-10 rounded-[10px] border border-brand-field px-3 text-[15px] text-brand-ink outline-none focus:border-brand-ink" />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="h-9 rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white">
            Save
          </button>
          <button type="button" onClick={onDone} className="h-9 rounded-full border border-brand-outline px-4 font-brand-mono text-[12px]">
            Cancel
          </button>
        </div>
      </form>
    );
  }
  const d = view.basics.deadline;
  const parts = [`First draft by ${d.firstDraftLabel}, final by ${fmtDay(d.iso)}`, markets.length ? joinAnd(markets) : null].filter(Boolean);
  return <>{parts.join(" · ")}</>;
}

export function BriefCanvas({ view, pending, h }: { view: StudioView; pending: boolean; h: CanvasHandlers }) {
  const [editing, setEditing] = useState<SectionKey | "deadlineMarkets" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const activeKey = view.active?.key ?? null;
  const disabled = pending || !view.editable;

  const cards = CARDS.flatMap((c) => {
    if (c === "deadlineMarkets") {
      const deadline = getSection(view.sections, "deadline");
      const markets = getSection(view.sections, "markets");
      const active = activeKey === "deadline" || activeKey === "markets";
      if (!sectionFilled(deadline) && !sectionFilled(markets) && !active) return [];
      // The weaker of the two sources: a suggested deadline is still a suggestion.
      const tagSource = [deadline, markets].filter(sectionFilled).sort((a, b) => order(a!) - order(b!))[0];
      return [
        <SectionCard key={c} title="Deadline & markets" tag={tagFor(tagSource)} active={active} editing={editing === c} onEdit={() => setEditing(c)} disabled={disabled}>
          <DeadlineMarkets view={view} editing={editing === c} onDone={() => setEditing(null)} h={h} />
        </SectionCard>,
      ];
    }
    const s = getSection(view.sections, c);
    const active = activeKey === c;
    if (!sectionFilled(s) && !active) return [];
    const title = c === "deliverables" && view.title.toLowerCase().includes("deck") ? "Deliverables" : SECTION_LABEL[c];
    const isEditing = editing === c;
    const initial = s ? (LIST_KEYS.has(c) ? (s.items ?? []).join(", ") : s.value) : "";
    return [
      <SectionCard key={c} title={title} tag={tagFor(s)} active={active} editing={isEditing} onEdit={() => (c === "references" ? h.attach() : setEditing(c))} disabled={disabled}>
        {isEditing ? (
          <Editor
            initial={initial}
            list={LIST_KEYS.has(c)}
            onCancel={() => setEditing(null)}
            onSave={(v) => {
              h.edit(c, LIST_KEYS.has(c) ? { items: v.split(",").map((x) => x.trim()).filter(Boolean) } : { value: v.trim() });
              setEditing(null);
            }}
          />
        ) : s && sectionFilled(s) ? (
          <Body s={s} h={h} disabled={disabled} />
        ) : (
          <span className="text-brand-mute">Answer on the left, or write it here.</span>
        )}
      </SectionCard>,
    ];
  });

  const left = view.questionsLeft;
  const sendNow = () => (view.quality.score < 50 ? setConfirm(true) : h.send());

  return (
    <section aria-label="Live brief" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-brand-line px-7 py-5 max-[699px]:px-5">
        <div className="flex min-w-[min(100%,240px)] flex-1 flex-col gap-1">
          <span className="text-[12px] text-brand-mute">Your brief</span>
          <h2 className="m-0 text-[22px] font-light leading-[1.2] min-[700px]:truncate min-[700px]:text-[24px]">{view.title}</h2>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-[12px] text-brand-mute">Estimate preview</span>
          <span className="whitespace-nowrap text-[18px] font-light">{view.estimate ? `≈ ${view.estimate.low}–${view.estimate.high} credits` : "Pick formats"}</span>
        </div>
      </div>
      <QualityBlock view={view} onAsk={h.ask} disabled={disabled} />
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
        {cards.length ? cards : <p className="m-0 px-4 py-3 text-[15px] text-brand-mute">Your brief fills in here as you answer.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-brand-line px-7 py-4 max-[699px]:px-5">
        <span className="min-w-[140px] flex-1 text-[13px] text-brand-ink-2">
          {left ? `About ${left} question${left === 1 ? "" : "s"} left` : view.quality.essentialsCovered ? "Essentials covered" : "Send any time: Klingit fills the gaps"}
        </span>
        <button type="button" onClick={h.saveDraft} disabled={disabled} className="inline-flex h-10 items-center whitespace-nowrap rounded-full border border-brand-outline bg-white px-[18px] font-brand-mono text-[12px] disabled:opacity-50">
          Save draft
        </button>
        <button type="button" onClick={sendNow} disabled={disabled} className="inline-flex h-11 items-center gap-2.5 whitespace-nowrap rounded-full bg-brand-orange px-5 font-brand-mono text-[13px] text-brand-ink disabled:opacity-60">
          Send brief to Klingit
          <ArrowRight className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="w-[calc(100%-32px)] max-w-[420px] rounded-[16px] border-none font-brand">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-normal">Send it now?</DialogTitle>
            <DialogDescription className="text-[15px] text-brand-ink-2">Klingit may come back with questions. Send anyway?</DialogDescription>
          </DialogHeader>
          <p className="m-0 text-[13px] text-brand-mute">Brief quality {view.quality.score} · {view.quality.status.split(" · ")[1]}</p>
          <DialogFooter>
            <button type="button" onClick={() => setConfirm(false)} className="h-10 rounded-full border border-brand-outline px-[18px] font-brand-mono text-[12px]">
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirm(false);
                h.send();
              }}
              className="h-10 rounded-full bg-brand-ink px-[18px] font-brand-mono text-[12px] text-white"
            >
              Send anyway
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

const order = (s: BriefSection) => ({ suggested: 0, pastProject: 1, brandOS: 2, answer: 3 })[s.source];
