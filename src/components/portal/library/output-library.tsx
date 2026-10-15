"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Play, Search } from "lucide-react";
import { PageHeader } from "@/components/ds/page-header";
import { pillClass } from "@/components/ds/button";
import { addOutputFactAction } from "@/lib/actions/output-fact-actions";
import { CATEGORIES, FACT_LABELS, type Category } from "@/lib/output-categories";
import { cn } from "@/lib/utils";

export type LibraryCard = {
  key: string;
  title: string;
  category: Category;
  meta: string;
  date: string;
  href: string;
  thumb: { image: string | null; video: { src: string; poster: string | null } | null; text: string | null; color: string };
  info: { kind: "performed" | "used" | "review" | "add"; text: string };
  badge: string | null;
};

const DATES: [string, string][] = [
  ["", "Any date"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["365", "Last 12 months"],
];
const MADE: [string, string][] = [
  ["", "Anyone"],
  ["klingit", "Klingit team"],
  ["skills", "A skill"],
  ["client", "You"],
];
/** Categories without channel data: their shelves say why they show usage. */
const NO_PERFORMANCE = new Set<Category>(["Presentations", "Print", "Illustration"]);
const SWATCH = ["#F2D6C9", "#DCE3F0", "#E4F0B8", "#F6DAF3", "#EFE9DE", "#D9C2B0", "#C9D6E6", "#E0D2E8"];

/** A real preview when we have one (image, first slide, poster frame), otherwise a clean placeholder per kind. */
function Thumb({ card, i }: { card: LibraryCard; i: number }) {
  const bg = SWATCH[i % SWATCH.length];
  const inner = SWATCH[(i + 3) % SWATCH.length];
  if (card.thumb.image) return <img src={card.thumb.image} alt="" className="h-full w-full object-cover" loading="lazy" />;
  if (card.thumb.video?.poster)
    return (
      <span className="relative block h-full w-full">
        <img src={card.thumb.video.poster} alt="" className="h-full w-full object-cover" loading="lazy" />
        <PlayDot />
      </span>
    );
  const page = (w: string, h: string) => (
    <span className={cn("flex flex-col gap-1 rounded-[3px] bg-white p-1.5 shadow-sm", w, h)}>
      <span className="flex-1 rounded-[2px]" style={{ background: inner }} />
      <span className="h-[3px] w-2/3 rounded bg-brand-ink" />
      <span className="h-[2px] w-1/2 rounded bg-brand-line" />
    </span>
  );
  const body = (() => {
    switch (card.category) {
      case "Presentations":
        return (
          <span className="flex h-[70%] w-[72%] flex-col gap-1.5 rounded-[3px] bg-white p-2.5 shadow-sm">
            <span className="h-[4px] w-1/3 rounded bg-brand-ink" />
            <span className="h-[2px] w-1/2 rounded bg-brand-line" />
            <span className="mt-1 flex-1 rounded-[2px]" style={{ background: inner }} />
          </span>
        );
      case "Print":
        return page("w-[34%]", "h-[82%]");
      case "Illustration":
        return (
          <span className="flex flex-col items-center gap-1">
            <span className="flex size-10 items-center justify-center gap-1.5 rounded-full bg-white">
              <span className="size-1.5 rounded-full bg-brand-ink" />
              <span className="size-1.5 rounded-full bg-brand-ink" />
            </span>
            <span className="h-8 w-16 rounded-t-full bg-white" />
          </span>
        );
      case "Video & motion":
        return <PlayDot />;
      case "Web":
        return (
          <span className="flex h-[74%] w-[84%] flex-col overflow-hidden rounded-[4px] bg-white shadow-sm">
            <span className="h-2.5 bg-brand-line" />
            <span className="m-2 flex-1 rounded-[2px]" style={{ background: inner }} />
          </span>
        );
      case "Copy & email":
        return (
          <span className="flex h-[70%] w-[60%] flex-col gap-1.5 rounded-[3px] bg-white p-3 shadow-sm">
            {card.thumb.text ? <span className="line-clamp-5 text-[10px] leading-[1.35] text-brand-ink-2">{card.thumb.text}</span> : [80, 95, 70, 90, 50].map((w) => <span key={w} className="h-[3px] rounded bg-brand-line" style={{ width: `${w}%` }} />)}
          </span>
        );
      default:
        return page("w-[46%]", "h-[96%]");
    }
  })();
  return (
    <span className="flex h-full w-full items-center justify-center" style={{ background: bg }}>
      {body}
    </span>
  );
}
function PlayDot() {
  return (
    <span className="absolute inset-0 m-auto flex size-11 items-center justify-center rounded-full bg-white/95">
      <Play className="ml-0.5 size-4 fill-brand-ink text-brand-ink" />
    </span>
  );
}

/** "+ Add how it did": a short note, an optional number and a label, saved on the piece (and in Insights). */
export function AddHowItDid({ itemKey }: { itemKey: string }) {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(addOutputFactAction, {});
  const [label, setLabel] = useState<string>(FACT_LABELS[0]);
  if (state.ok) return <span className="text-[12px] text-[#5E6B2A]">Saved</span>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-[12px] text-brand-ink underline underline-offset-2">
        + Add how it did
      </button>
    );
  return (
    <form action={act} className="flex flex-col gap-2 rounded-[10px] border border-brand-line bg-white p-3 text-[12px]">
      <input type="hidden" name="key" value={itemKey} />
      <span className="flex gap-2">
        <select name="label" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="What it is" className="h-8 rounded-[8px] border border-[#CFC8B8] px-1.5">
          {FACT_LABELS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <input name="value" inputMode="numeric" placeholder="Number" aria-label="Number (optional)" className="h-8 w-20 rounded-[8px] border border-[#CFC8B8] px-2" />
      </span>
      {label === "Other" && <input name="customLabel" placeholder="Label, e.g. Retailers" aria-label="Label" className="h-8 rounded-[8px] border border-[#CFC8B8] px-2" />}
      <input name="note" placeholder="Short note, e.g. 3 retailers" aria-label="Note" className="h-8 rounded-[8px] border border-[#CFC8B8] px-2" />
      <span className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="h-8 rounded-full bg-brand-ink px-3 font-brand-mono text-[11px] text-white">
          Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] underline">
          Cancel
        </button>
        {state.error && <span className="text-[#A8321F]">{state.error}</span>}
      </span>
    </form>
  );
}

function InfoLine({ card }: { card: LibraryCard }) {
  if (card.info.kind === "add") return <AddHowItDid itemKey={card.key} />;
  return <span className={cn("self-start rounded-[5px] px-1.5 py-0.5 text-[12px]", card.info.kind === "performed" ? "bg-brand-lime-pale text-[#3E5A22]" : "bg-brand-page text-brand-ink")}>{card.info.text}</span>;
}

function Card({ card, i, picked, onPick }: { card: LibraryCard; i: number; picked: boolean; onPick: () => void }) {
  return (
    <li className="group flex min-w-0 flex-col gap-1.5">
      <span className="relative block aspect-[17/10] overflow-hidden rounded-[10px]">
        <Link href={card.href} aria-label={card.title} className="block h-full w-full">
          <Thumb card={card} i={i} />
        </Link>
        {card.badge === "Top performer" && <span className="absolute left-2 top-2 rounded-full bg-brand-lime-pale px-2 py-0.5 text-[11px]">Top performer</span>}
        <button type="button" onClick={onPick} aria-pressed={picked} aria-label={picked ? `Unselect ${card.title}` : `Select ${card.title}`} className={cn("absolute right-2 top-2 flex size-6 items-center justify-center rounded-full border bg-white/95", picked ? "border-brand-ink" : "border-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}>
          {picked && <Check className="size-3.5" strokeWidth={2.5} />}
        </button>
      </span>
      <Link href={card.href} className="truncate text-[14px] text-brand-ink no-underline hover:underline">
        {card.title}
      </Link>
      <span className="truncate text-[12px] text-brand-ink-2">{card.meta}</span>
      <InfoLine card={card} />
    </li>
  );
}

/**
 * The Output library (Phase U, design OutputLibrary2): every kind of work, by category. Search, Project / Date /
 * Made by, Grid / List; "All" is a New this month shelf then one shelf per category; a category chip is that
 * category as a full grid. Pick several to download them as one ZIP.
 */
export function OutputLibrary({ cards, newThisMonth, counts, total, projects, view }: { cards: LibraryCard[]; newThisMonth: LibraryCard[]; counts: Record<string, number>; total: number; projects: string[]; view: "grid" | "list" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState(params.get("q") ?? "");
  const category = params.get("category");
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/library${next.size ? `?${next}` : ""}`);
  };
  const toggle = (key: string) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  const flat = Boolean(category || params.get("q"));
  const select = "h-10 rounded-full border border-[#DCD6C8] bg-white px-3 text-[13px] outline-none focus:border-brand-ink";
  const grid = (list: LibraryCard[], offset = 0) =>
    view === "list" ? (
      <ul className="m-0 flex list-none flex-col p-0">
        {list.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-brand-line py-2.5 first:border-t-0">
            <input type="checkbox" checked={picked.includes(c.key)} onChange={() => toggle(c.key)} aria-label={`Select ${c.title}`} />
            <Link href={c.href} className="min-w-0 flex-1 truncate text-[14px] text-brand-ink no-underline hover:underline">
              {c.title}
            </Link>
            <span className="w-32 text-[12px] text-brand-ink-2">{c.category}</span>
            <span className="hidden min-w-0 flex-1 truncate text-[12px] text-brand-ink-2 md:block">{c.meta}</span>
            <InfoLine card={c} />
          </li>
        ))}
      </ul>
    ) : (
      <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-6 p-0 md:grid-cols-4">
        {list.map((c, i) => (
          <Card key={c.key} card={c} i={i + offset} picked={picked.includes(c.key)} onPick={() => toggle(c.key)} />
        ))}
      </ul>
    );
  const shelf = (title: string, list: LibraryCard[], see: Record<string, string | null>, note?: string, offset = 0) => (
    <section key={title} aria-label={title} className="flex flex-col gap-4 rounded-[12px] bg-white px-5 py-5 sm:px-6">
      <header className="flex flex-wrap items-baseline gap-2">
        <h2 className="m-0 text-[18px] font-normal">{title}</h2>
        <span className="text-[13px] text-brand-ink-2">{list.length}</span>
        {note && <span className="text-[12px] text-brand-ink-2">{note}</span>}
        <button type="button" onClick={() => set(see)} className="ml-auto font-brand-mono text-[12px] uppercase tracking-[0.04em] underline underline-offset-4">
          See all
        </button>
      </header>
      {grid(list.slice(0, 4), offset)}
    </section>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`Everything Klingit and your skills made · ${total} pieces`}
        title="Output library"
        actions={
          picked.length ? (
            <a href={`/api/library/download?ids=${picked.join(",")}`} className={pillClass("primary")}>
              Download {picked.length} selected
            </a>
          ) : (
            <span className={cn(pillClass("secondary"), "opacity-60")} title="Pick pieces first">
              Download selected
            </span>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: q.trim() || null });
          }}
          className="flex h-11 min-w-[260px] flex-1 items-center gap-2 rounded-full border border-[#DCD6C8] bg-white px-4"
        >
          <Search className="size-4 text-brand-ink-2" strokeWidth={1.75} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything we made, e.g. “Christmas deck” or “retail poster”" aria-label="Search the library" className="w-full bg-transparent text-[14px] outline-none" />
        </form>
        <select aria-label="Project" value={params.get("project") ?? ""} onChange={(e) => set({ project: e.target.value || null })} className={select}>
          <option value="">Project</option>
          {projects.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select aria-label="Date" value={params.get("days") ?? ""} onChange={(e) => set({ days: e.target.value || null })} className={select}>
          {DATES.map(([v, l]) => (
            <option key={v} value={v}>
              {v ? l : "Date"}
            </option>
          ))}
        </select>
        <select aria-label="Made by" value={params.get("made") ?? ""} onChange={(e) => set({ made: e.target.value || null })} className={select}>
          {MADE.map(([v, l]) => (
            <option key={v} value={v}>
              {v ? l : "Made by"}
            </option>
          ))}
        </select>
        <span className="flex rounded-full bg-[var(--seg-track)] p-1">
          {(["grid", "list"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => set({ view: v === "grid" ? null : "list" })} className={cn("h-8 rounded-full px-3 text-[13px] capitalize", view === v ? "bg-white shadow-sm" : "")}>
              {v}
            </button>
          ))}
        </span>
      </div>
      <nav aria-label="Categories" className="flex flex-wrap gap-2">
        {[["", "All", total] as const, ...CATEGORIES.filter((c) => counts[c]).map((c) => [c, c, counts[c]] as const)].map(([v, l, n]) => (
          <button key={l} type="button" onClick={() => set({ category: v || null })} aria-pressed={(category ?? "") === v} className={cn("inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[14px]", (category ?? "") === v ? "border-brand-ink bg-brand-ink text-white" : "border-[#DCD6C8] bg-white")}>
            {l} <span className={cn("text-[12px]", (category ?? "") === v ? "text-white/70" : "text-brand-ink-2")}>{n}</span>
          </button>
        ))}
      </nav>
      <p className="m-0 flex flex-wrap items-center gap-2 text-[12px] text-brand-ink-2">
        Under every piece: <span className="rounded-[5px] bg-brand-lime-pale px-1.5 py-0.5 text-[#3E5A22]">How it performed</span> when it ran on a connected channel ·
        <span className="rounded-[5px] bg-brand-page px-1.5 py-0.5 text-brand-ink">How it was used</span> for decks, print, illustration · <span className="underline">+ Add how it did</span> when we don&apos;t know yet
      </p>

      {flat ? (
        <section className="rounded-[12px] bg-white px-5 py-5 sm:px-6">{cards.length ? grid(cards) : <p className="m-0 text-[14px] text-brand-ink-2">Nothing matches. Try another word or category.</p>}</section>
      ) : cards.length === 0 ? (
        <section className="rounded-[12px] bg-white px-6 py-5 text-[14px] text-brand-ink-2">Nothing here yet. Approved work and what your skills make show up here.</section>
      ) : (
        <>
          {newThisMonth.length > 0 && shelf("New this month", newThisMonth, { days: "30", category: null })}
          {CATEGORIES.filter((c) => counts[c]).map((c, n) => shelf(c, cards.filter((x) => x.category === c), { category: c }, NO_PERFORMANCE.has(c) ? "no performance data, so we show how they were used" : undefined, (n + 1) * 4))}
        </>
      )}
    </div>
  );
}
