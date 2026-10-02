"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, FileText, Link2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { SourceTag } from "@/components/ds/source-tag";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StreamedText, useReducedMotion } from "@/components/portal/brief-studio/motion";
import { getSection, sectionFilled, slot, SECTION_LABEL, type BriefSection, type SectionKey } from "@/lib/brief-studio/model";
import { thirdPerson } from "@/lib/brief-studio/planner";
import type { StudioView } from "@/lib/brief-studio/studio";

export type CanvasHandlers = {
  edit: (key: SectionKey, patch: { value?: string; items?: string[] }) => void;
  ask: (key: SectionKey) => void;
  basics: (b: { deadline?: string; markets?: string[] }) => void;
  attach: () => void;
  saveDraft: () => void;
  send: () => void;
};

/** A card on the canvas: one slot, or several that read as one (BriefStudioEnd.dc.html). */
type Card = { id: string; title: string; keys: SectionKey[]; editKey: SectionKey };

const CARDS: Card[] = [
  { id: "task", title: "The task", keys: ["task"], editKey: "task" },
  { id: "deliverables", title: SECTION_LABEL.deliverables, keys: ["deliverables"], editKey: "deliverables" },
  { id: "whyNow", title: "Why now", keys: ["whyNow"], editKey: "whyNow" },
  { id: "objective", title: "Objective and how we measure it", keys: ["objective"], editKey: "objective" },
  { id: "audience", title: "Audience and what holds them back", keys: ["audience"], editKey: "audience" },
  { id: "keyMessage", title: "One thing to remember", keys: ["keyMessage"], editKey: "keyMessage" },
  { id: "proofOffer", title: "Proof and offer", keys: ["proofOffer"], editKey: "proofOffer" },
  { id: "cta", title: "Call to action", keys: ["cta"], editKey: "cta" },
  { id: "material", title: "Material", keys: ["material"], editKey: "material" },
  { id: "includeAvoid", title: "Must include / avoid", keys: ["mustInclude", "mustAvoid"], editKey: "mustInclude" },
  { id: "approval", title: "Approval", keys: ["approver", "feedbackRounds"], editKey: "approver" },
  { id: "tone", title: "Tone & brand", keys: ["tone"], editKey: "tone" },
  { id: "references", title: "References", keys: ["references", "competitorExamples"], editKey: "references" },
  { id: "deadline", title: "Deadline & markets", keys: ["deadline", "markets", "languages"], editKey: "deadline" },
  { id: "budget", title: "Budget", keys: ["budgetCeiling"], editKey: "budgetCeiling" },
  { id: "notes", title: "Notes", keys: ["notes"], editKey: "notes" },
];

const LIST_KEYS = new Set<SectionKey>(["markets", "languages", "mustInclude", "mustAvoid", "competitorExamples"]);
const order = (s: BriefSection) => ({ suggested: 0, pastProject: 1, brandOS: 2, answer: 3 })[s.source];

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
const and = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}` : l[0] ?? "");
const signature = (sections: BriefSection[], keys: SectionKey[]) => keys.map((k) => { const s = getSection(sections, k); return s ? `${s.value}|${(s.items ?? []).join(",")}|${(s.refs ?? []).length}` : ""; }).join("§");

// ─── Quality ───────────────────────────────────────────────────────────────

export function QualityBar({ score, compact = false }: { score: number; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div role="meter" aria-label="Brief quality" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} className="relative h-1.5 rounded-full" style={{ background: "linear-gradient(90deg, var(--brand-line) 80%, var(--brand-lime-zone) 80%)" }}>
        {/* The fill turns lime once the brief is Great. */}
        <span className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 motion-reduce:transition-none", score >= 80 ? "bg-brand-lime-strong" : "bg-brand-ink")} style={{ width: `${score}%` }} />
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
      <span className="text-[13px] text-brand-ink-2">{q.detail}</span>
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {q.score < 80 && q.essentialsCovered && q.suggestions.length > 0 && (
          <>
            <span className="text-[13px] text-brand-mute">Make it great:</span>
            {q.suggestions.map((s) => (
              <button key={s.nice} type="button" disabled={disabled} onClick={() => onAsk(s.key)} className="h-[30px] rounded-full border border-brand-rule bg-white px-3 text-[13px] hover:border-brand-outline disabled:opacity-60">
                +{s.points} {s.label}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sections ──────────────────────────────────────────────────────────────

function SectionCard({ title, tag, state, editing, onEdit, disabled, justAdded, innerRef, children }: { title: string; tag: React.ReactNode; state: "idle" | "asking" | "writing"; editing: boolean; onEdit: () => void; disabled: boolean; justAdded: boolean; innerRef?: (el: HTMLDivElement | null) => void; children: React.ReactNode }) {
  const peach = state !== "idle";
  return (
    <div ref={innerRef} className={cn("flex flex-col gap-1.5 rounded-[10px] border px-4 py-3.5 transition-colors duration-500 motion-reduce:transition-none", peach ? "border-brand-peach-line bg-brand-peach-active" : "border-transparent")}>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[13px] font-semibold">{title}</span>
        {justAdded && state === "idle" && <span className="studio-rise text-[12px] text-brand-lime-text">Just added</span>}
        {!peach && tag}
        {!editing && (
          <button type="button" aria-label={`Edit ${title.toLowerCase()}`} disabled={disabled} onClick={onEdit} className="flex size-[30px] items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-chip disabled:opacity-40">
            <Pencil className="size-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="text-[15px] leading-[1.5]">{children}</div>
      {state === "asking" && <span className="text-[12px] text-brand-orange-text">Answering now</span>}
      {state === "writing" && <span className="text-[12px] text-brand-orange-text">Writing…</span>}
    </div>
  );
}

/** New or changed text: streams in with a caret and fades from pale lime (plain, with reduced motion). */
function Fresh({ text, fresh, onDone, className }: { text: string; fresh: boolean; onDone: () => void; className?: string }) {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(!fresh || reduced);
  if (!text) return null;
  return (
    <span className={cn(fresh && "studio-highlight", !done && "studio-caret", className)}>
      <StreamedText
        text={text}
        animate={fresh && !reduced}
        onDone={() => {
          setDone(true);
          onDone();
        }}
      />
    </span>
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

function Refs({ s, h, disabled }: { s: BriefSection | undefined; h: CanvasHandlers; disabled: boolean }) {
  return (
    <span className="flex flex-wrap gap-2">
      {(s?.refs ?? []).map((r, i) => {
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
      <button type="button" disabled={disabled} onClick={h.attach} className="inline-flex items-center rounded-[10px] border border-dashed border-brand-field bg-white px-3.5 py-2 text-[13px] text-brand-ink-2 hover:border-brand-outline">
        + Add file or link
      </button>
    </span>
  );
}

export function BriefCanvas({ view, pending, h }: { view: StudioView; pending: boolean; h: CanvasHandlers }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const activeKey = view.active?.key ?? null;
  const disabled = pending || !view.editable;
  const S = view.sections;
  const hasTask = sectionFilled(getSection(S, "task"));

  // What changed since the last view streams in ("Writing…"), then shows "Just added" for a few seconds.
  const [prev, setPrev] = useState(view);
  const [writing, setWriting] = useState<Set<string>>(new Set());
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  if (prev !== view) {
    const changed = CARDS.filter((c) => c.keys.some((k) => sectionFilled(getSection(S, k))) && signature(prev.sections, c.keys) !== signature(S, c.keys)).map((c) => c.id);
    setPrev(view);
    if (changed.length) {
      setWriting(new Set(changed));
      setJustAdded(new Set(changed));
    }
  }
  useEffect(() => {
    if (!justAdded.size) return;
    const t = window.setTimeout(() => setJustAdded(new Set()), 3500);
    return () => window.clearTimeout(t);
  }, [justAdded]);
  const refs = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    // Scroll to a section being written only if it's off screen.
    const first = [...writing][0];
    const el = first ? refs.current.get(first) : null;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const parent = el.closest("[data-canvas-scroll]")?.getBoundingClientRect();
    if (parent && (box.top < parent.top || box.bottom > parent.bottom)) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [writing]);
  const finished = (id: string) => setWriting((w) => (w.has(id) ? new Set([...w].filter((x) => x !== id)) : w));

  const cards = CARDS.flatMap((c) => {
    if (c.id === "deliverables" && hasTask) return [];
    const parts = c.keys.map((k) => getSection(S, k));
    const asking = c.keys.includes(activeKey as SectionKey) && !(c.id === "deadline");
    if (!parts.some(sectionFilled) && !asking) return [];
    const tag = tagFor(parts.filter((p): p is BriefSection => Boolean(p && sectionFilled(p))).sort((a, b) => order(a) - order(b))[0]);
    const isEditing = editing === c.id;
    const fresh = writing.has(c.id);
    const state = asking ? "asking" : fresh ? "writing" : "idle";
    const main = parts[0];
    const initial = main ? (LIST_KEYS.has(c.editKey) ? (main.items ?? []).join(", ") : main.value) : "";
    const body = isEditing ? (
      c.id === "deadline" ? (
        <DeadlineEditor view={view} h={h} onDone={() => setEditing(null)} />
      ) : (
        <Editor
          initial={initial}
          list={LIST_KEYS.has(c.editKey)}
          onCancel={() => setEditing(null)}
          onSave={(v) => {
            h.edit(c.editKey, LIST_KEYS.has(c.editKey) ? { items: v.split(",").map((x) => x.trim()).filter(Boolean) } : { value: v.trim() });
            setEditing(null);
          }}
        />
      )
    ) : (
      <CardBody card={c} view={view} h={h} disabled={disabled} fresh={fresh} onDone={() => finished(c.id)} />
    );
    return [
      <SectionCard
        key={c.id}
        innerRef={(el) => (el ? refs.current.set(c.id, el) : refs.current.delete(c.id))}
        title={c.title}
        tag={tag}
        state={state}
        editing={isEditing}
        justAdded={justAdded.has(c.id) && !fresh}
        onEdit={() => (c.id === "references" ? h.attach() : setEditing(c.id))}
        disabled={disabled}
      >
        {body}
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
        <div className="flex shrink-0 flex-col items-end max-[699px]:items-start">
          <span className="text-[12px] text-brand-mute">Estimate preview</span>
          <span className="whitespace-nowrap text-[18px] font-light">{view.estimate ? `≈ ${view.estimate.low}–${view.estimate.high} credits` : "Pick formats"}</span>
          {view.estimate && view.estimate.unpriced.length > 0 && <span className="text-[12px] text-brand-mute">+ {and(view.estimate.unpriced.map((u) => u.toLowerCase()))}, priced by Klingit</span>}
        </div>
      </div>
      <QualityBlock view={view} onAsk={h.ask} disabled={disabled} />
      <div data-canvas-scroll className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
        {cards.length ? cards : <p className="m-0 px-4 py-3 text-[15px] text-brand-mute">Your brief fills in here as you answer.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-brand-line px-7 py-4 max-[699px]:px-5">
        <span className="min-w-[140px] flex-1 text-[13px] text-brand-ink-2">{view.readyToSend ? "Ready to send" : left ? `About ${left} question${left === 1 ? "" : "s"} left` : "Send any time: Klingit fills the gaps"}</span>
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
          <p className="m-0 text-[13px] text-brand-mute">
            Brief quality {view.quality.score} · {view.quality.detail}
          </p>
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

function CardBody({ card, view, h, disabled, fresh, onDone }: { card: Card; view: StudioView; h: CanvasHandlers; disabled: boolean; fresh: boolean; onDone: () => void }) {
  const S = view.sections;
  const s = getSection(S, card.keys[0]);
  // Changed text remounts (key = text), so it streams in again.
  const f = (text: string, className?: string) => <Fresh key={text} text={text} fresh={fresh} onDone={onDone} className={className} />;
  switch (card.id) {
    case "task": {
      const t = slot(S, "task");
      return (
        <span className="flex flex-col gap-1">
          <span className="text-[18px] leading-[1.45]">
            {f(s?.value ?? "")}
          </span>
          {t.meta && <span className="text-[14px] text-brand-ink-2">{t.meta}</span>}
        </span>
      );
    }
    case "deliverables": {
      const d = slot(S, "deliverables");
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          {(d.channels ?? []).length > 0 && <span className="mr-1 text-brand-ink-2">{and(d.channels!)}:</span>}
          {(d.formats ?? []).map((f) => (
            <span key={f} className="rounded-full bg-brand-nav px-2.5 py-1 text-[13px]">
              {f}
            </span>
          ))}
          {d.ideasCount ? <span className="text-[13px] text-brand-ink-2">× {d.ideasCount} ideas</span> : null}
          <button type="button" disabled={disabled} onClick={() => h.ask("deliverables")} className="rounded-full border border-dashed border-brand-field px-2.5 py-1 text-[13px] text-brand-ink-2 hover:border-brand-outline">
            + more?
          </button>
        </span>
      );
    }
    case "audience": {
      const a = slot(S, "audience");
      const who = [a.personaName, a.description].filter(Boolean).join(", ");
      if (!who && !a.barrier) return f(s?.value ?? "");
      return (
        <>
          {f(who ? `${who.replace(/\.$/, "")}.` : "")}
          {a.barrier && f(` ${thirdPerson(a.barrier).replace(/\.$/, "")}.`, "text-brand-ink-2")}
        </>
      );
    }
    case "proofOffer": {
      const p = slot(S, "proofOffer");
      const base = (p.text ?? "").replace(/\.$/, "");
      const rest = (s?.value ?? "").slice(base.length).replace(/^\.\s*/, "");
      return base ? (
        <>
          {f(`${base}.`)}
          {rest && f(` ${rest}`, "text-brand-ink-2")}
        </>
      ) : (
        f(s?.value ?? "")
      );
    }
    case "includeAvoid": {
      const inc = getSection(S, "mustInclude")?.items ?? [];
      const avoid = getSection(S, "mustAvoid")?.items ?? [];
      return (
        <span className="flex flex-col gap-0.5">
          {inc.length > 0 && f(`Include: ${inc.join(", ")}`)}
          {avoid.length > 0 && f(`Avoid: ${avoid.join(", ")}`)}
        </span>
      );
    }
    case "approval": {
      const who = getSection(S, "approver")?.value;
      const rounds = getSection(S, "feedbackRounds")?.value;
      return f([who && `${who} signs off`, rounds].filter(Boolean).join(" · "));
    }
    case "references": {
      const comp = getSection(S, "competitorExamples")?.items ?? [];
      return (
        <span className="flex flex-col gap-2">
          <Refs s={getSection(S, "references")} h={h} disabled={disabled} />
          {comp.length > 0 && <span className="text-[14px] text-brand-ink-2">Competitor examples: {comp.join(" · ")}</span>}
        </span>
      );
    }
    case "deadline": {
      const markets = getSection(S, "markets")?.items ?? [];
      const languages = getSection(S, "languages")?.items ?? [];
      const d = view.basics.deadline;
      return f([`First draft by ${d.firstDraftLabel}, final by ${fmtDay(d.iso)}`, markets.length ? and(markets) : null, languages.length ? `${and(languages)} copy` : null].filter(Boolean).join(" · "));
    }
    default:
      return f(s?.value || (s?.items ?? []).join(", "), "whitespace-pre-wrap");
  }
}

function DeadlineEditor({ view, h, onDone }: { view: StudioView; h: CanvasHandlers; onDone: () => void }) {
  const [date, setDate] = useState(view.basics.deadline.iso);
  const [list, setList] = useState(view.basics.markets.join(", "));
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
