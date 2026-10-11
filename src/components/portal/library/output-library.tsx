"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Image as ImageIcon, Search } from "lucide-react";
import { PageHeader } from "@/components/ds/page-header";
import { pillClass } from "@/components/ds/button";
import { VideoThumb } from "@/components/review/video-thumb";
import { cn } from "@/lib/utils";

export type LibraryCard = {
  key: string;
  title: string;
  format: string;
  channel: string | null;
  source: string;
  date: string;
  href: string;
  thumb: { image: string | null; video: { src: string; poster: string | null } | null; text: string | null; color: string };
  metric: string | null;
  badge: string | null;
};

const BADGE: Record<string, string> = {
  "Top performer": "bg-brand-lime-pale",
  "Below average": "bg-brand-peach-pale",
  New: "bg-[#F6E7B8]",
  "Made with a skill": "bg-[#F7E6F7]",
};
const DATES: [string, string][] = [
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["365", "Last 12 months"],
  ["all", "All time"],
];

/**
 * The Output library (nav v3, 07): search, filters (project, format, channel, date, made by), sort, the summary
 * line, and the cards; pick several to download them as one ZIP.
 */
export function OutputLibrary({ cards, facets, summary, sourcesLine }: { cards: LibraryCard[]; facets: { projects: string[]; formats: string[]; channels: string[] }; summary: { total: number; byKlingit: number; bySkills: number }; sourcesLine: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [picked, setPicked] = useState<string[]>([]);
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/library${next.size ? `?${next}` : ""}`);
  };
  const toggle = (key: string) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Everything Klingit and your skills have made"
        title="Output library"
        actions={
          picked.length ? (
            <a href={`/api/library/download?ids=${picked.join(",")}`} className={pillClass("primary")}>
              Download {picked.length} selected
            </a>
          ) : (
            <span className={cn(pillClass("secondary"), "cursor-default opacity-70")} title="Pick outputs with the box on each card">
              Download selected
            </span>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            set("q", String(new FormData(e.currentTarget).get("q") ?? "").trim() || null);
          }}
          className="flex h-11 min-w-[240px] flex-1 basis-[280px] items-center gap-2 rounded-full border border-brand-outline bg-white px-4"
        >
          <Search className="size-4 text-brand-ink-2" strokeWidth={1.75} />
          <input name="q" defaultValue={params.get("q") ?? ""} placeholder="Search outputs, e.g. dew drop stories" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
        </form>
        <PillSelect label="Project" value={params.get("project") ?? ""} onChange={(v) => set("project", v)} options={facets.projects.map((p) => [p, p])} />
        <PillSelect label="Format" value={params.get("format") ?? ""} onChange={(v) => set("format", v)} options={facets.formats.map((p) => [p, p])} />
        <PillSelect label="Channel" value={params.get("channel") ?? ""} onChange={(v) => set("channel", v)} options={facets.channels.map((p) => [p, p])} />
        <PillSelect label="Date" value={params.get("days") ?? "90"} onChange={(v) => set("days", v === "90" ? null : v)} options={DATES} noAll />
        <PillSelect
          label="Made by"
          value={params.get("made") ?? ""}
          onChange={(v) => set("made", v)}
          options={[
            ["klingit", "Klingit"],
            ["skills", "Your skills"],
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px]">
        <span>
          <b className="font-semibold">{summary.total}</b> outputs
        </span>
        <span>
          <b className="font-semibold">{summary.byKlingit}</b> by Klingit
        </span>
        <span>
          <b className="font-semibold">{summary.bySkills}</b> made with skills
        </span>
        <span className="flex-1" />
        <PillSelect
          label="Sort"
          value={params.get("sort") ?? "best"}
          onChange={(v) => set("sort", v === "best" ? null : v)}
          options={[
            ["best", "Best performing"],
            ["newest", "Newest"],
          ]}
          noAll
        />
        {sourcesLine && <span className="text-brand-ink-2">{sourcesLine}</span>}
      </div>

      {cards.length === 0 ? (
        <p className="m-0 rounded-[14px] bg-white px-6 py-8 text-center text-[15px] text-brand-ink-2">Nothing matches. Try a longer date range or clear a filter.</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[600px]:grid-cols-2 min-[1000px]:grid-cols-3 min-[1300px]:grid-cols-4">
          {cards.map((c) => {
            const on = picked.includes(c.key);
            return (
              <li key={c.key} className={cn("group relative flex flex-col overflow-hidden rounded-[14px] bg-white", on && "ring-2 ring-brand-ink")}>
                <Link href={c.href} className="relative block aspect-[16/11] overflow-hidden no-underline" style={{ backgroundColor: `color-mix(in srgb, ${c.thumb.color} 22%, white)` }}>
                  {c.thumb.video ? (
                    <VideoThumb src={c.thumb.video.src} poster={c.thumb.video.poster} />
                  ) : c.thumb.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the client's own access-checked file
                    <img src={c.thumb.image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                  ) : c.thumb.text ? (
                    <span className="absolute inset-0 flex items-center bg-[#FBF9F4] px-5 text-[14px] leading-[1.45] text-brand-ink">
                      <span className="line-clamp-4">{c.thumb.text}</span>
                    </span>
                  ) : (
                    <ImageIcon className="absolute inset-0 m-auto size-6 text-brand-ink/30" strokeWidth={1.5} />
                  )}
                  {c.badge && <span className={cn("absolute left-3 top-3 rounded-full px-2 py-0.5 text-[12px] text-brand-ink", BADGE[c.badge])}>{c.badge}</span>}
                  <span className="absolute bottom-3 right-3 rounded-[6px] bg-brand-ink/80 px-1.5 py-0.5 font-brand-mono text-[10.5px] uppercase text-white">{c.format}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  aria-pressed={on}
                  aria-label={`${on ? "Unselect" : "Select"} ${c.title}`}
                  className={cn("absolute right-3 top-3 flex size-7 items-center justify-center rounded-[8px] border-2 border-white shadow transition-opacity", on ? "bg-brand-ink opacity-100" : "bg-white/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
                >
                  {on && <Check className="size-4 text-white" strokeWidth={3} />}
                </button>
                <div className="flex flex-col gap-1 px-4 py-3.5">
                  <Link href={c.href} className="truncate text-[15px] text-brand-ink no-underline hover:underline">
                    {c.title}
                  </Link>
                  <span className="truncate text-[13px] text-brand-mute">{[c.source, c.channel].filter(Boolean).join(" · ")}</span>
                  <span className="flex items-center justify-between pt-1 text-[14px]">
                    <span className="font-semibold">{c.metric ?? ""}</span>
                    <span className="text-[13px] text-brand-mute">{day(c.date)}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="m-0 flex flex-wrap items-center gap-3 rounded-[12px] border border-dashed border-brand-field px-5 py-3.5 text-[14px] text-brand-ink-2">
        <ImageIcon className="size-4" strokeWidth={1.75} />
        <span>
          Logos, fonts and brand photos live in{" "}
          <Link href="/assets/visual-identity" className="text-brand-ink underline underline-offset-2">
            Brand OS → Visual identity
          </Link>
          . This library holds produced work only.
        </span>
      </p>
    </div>
  );
}

function PillSelect({ label, value, onChange, options, noAll = false }: { label: string; value: string; onChange: (v: string | null) => void; options: [string, string][]; noAll?: boolean }) {
  const current = options.find(([v]) => v === value)?.[1] ?? "All";
  return (
    <label className="relative inline-flex h-11 items-center gap-1.5 rounded-full border border-brand-outline bg-white pl-4 pr-3 text-[14px] focus-within:border-brand-ink">
      <span className="text-brand-mute">{label}</span>
      <span className="max-w-[160px] truncate">{current}</span>
      <ChevronDown className="size-3.5 text-brand-ink-2" strokeWidth={1.75} />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value || null)} className="absolute inset-0 cursor-pointer opacity-0">
        {!noAll && <option value="">All</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
