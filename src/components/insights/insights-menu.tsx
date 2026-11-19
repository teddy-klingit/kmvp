"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { SEGMENTS, TABS, tabFor, type SegmentKey, type TabKey } from "@/lib/insights/tabs";
import { cn } from "@/lib/utils";

export type MenuData = {
  /** "NOVEMBER 2026 · 7 SOURCES" and "UPDATED TODAY 09:40". */
  freshness: string[];
  /** Each tab's sub-line (its sources, "4 brands tracked"…). */
  subs: Record<TabKey, string>;
  /** Tabs with a source that needs attention, and why (the dot's tooltip). */
  dots: Partial<Record<TabKey, string>>;
  issues: number;
  sourcesHref: string;
};

/** Keeps the period when moving between tabs. */
function useTabHref() {
  const params = useSearchParams();
  const range = params?.get("range");
  return (href: string) => (range ? `${href}?range=${range}` : href);
}

function Item({ tab, active, sub, dot }: { tab: (typeof TABS)[number]; active: boolean; sub: string; dot?: string }) {
  const href = useTabHref();
  return (
    <Link
      href={href(tab.href)}
      aria-current={active ? "page" : undefined}
      className={cn("relative flex flex-col gap-0.5 rounded-[12px] px-3.5 py-2.5 no-underline transition-colors", active ? "bg-brand-ink text-white" : "bg-white text-brand-ink hover:bg-white/70")}
    >
      <span className="pr-4 text-[15px] leading-tight">{tab.label}</span>
      <span className={cn("truncate text-[12px]", active ? "text-white/70" : "text-brand-ink-2")}>{sub}</span>
      {dot && <span title={dot} aria-label={dot} className="absolute right-3 top-3.5 size-2 rounded-full bg-brand-orange" />}
    </Link>
  );
}

function Segment({ seg, children }: { seg: SegmentKey; children: React.ReactNode }) {
  const s = SEGMENTS[seg];
  return (
    <section aria-label={s.label} className="flex flex-col gap-1.5 rounded-[14px] border-l-[3px] p-1.5 pb-2" style={{ background: s.tint, borderColor: s.bar }}>
      <div className="flex flex-col gap-0.5 px-2 pb-1 pt-1.5">
        <span className="flex items-center gap-2 font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-ink">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ background: s.bar }} />
          {s.label}
        </span>
        <span className="text-[12px] text-brand-ink-2">{s.sub}</span>
      </div>
      {children}
    </section>
  );
}

/** The Insights menu (Phase X v2): Overview, then Your channels · Your sales · Your market as tinted blocks. */
export function InsightsMenu({ data }: { data: MenuData }) {
  const active = tabFor(usePathname() ?? "/insights").key;
  const overview = TABS[0];
  return (
    <nav aria-label="Insights" className="flex min-h-full flex-col gap-3">
      <div className="flex flex-col gap-1 px-1.5 pb-2">
        <span className="text-[24px] font-fw-medium leading-tight text-brand-ink">Insights</span>
        {data.freshness.map((l) => (
          <span key={l} className="font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">
            {l}
          </span>
        ))}
      </div>
      <Item tab={overview} active={active === "overview"} sub={data.subs.overview} />
      {(Object.keys(SEGMENTS) as SegmentKey[]).map((seg) => (
        <Segment key={seg} seg={seg}>
          {TABS.filter((t) => t.segment === seg).map((t) => (
            <Item key={t.key} tab={t} active={active === t.key} sub={data.subs[t.key]} dot={data.dots[t.key]} />
          ))}
        </Segment>
      ))}
      <Link href={data.sourcesHref} className="mt-auto flex items-center gap-2.5 rounded-[12px] bg-white px-3.5 py-3 text-[14px] text-brand-ink no-underline hover:bg-white/70">
        {data.issues > 0 && <AlertTriangle className="size-4 shrink-0 text-brand-orange" strokeWidth={1.75} />}
        <span className="flex-1 leading-tight">Sources &amp; connections</span>
        {data.issues > 0 && <span className="text-[12px] text-brand-orange">{data.issues === 1 ? "1 issue" : `${data.issues} issues`}</span>}
      </Link>
    </nav>
  );
}

/** Phones: the tabs as one scrollable row of chips, each marked with its block's colour. */
export function InsightsChips({ data }: { data: MenuData }) {
  const active = tabFor(usePathname() ?? "/insights").key;
  const href = useTabHref();
  return (
    <nav aria-label="Insights" className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {TABS.map((t) => {
        const s = t.segment ? SEGMENTS[t.segment] : null;
        const on = active === t.key;
        return (
          <Link
            key={t.key}
            href={href(t.href)}
            aria-current={on ? "page" : undefined}
            className={cn("relative flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] no-underline", on ? "bg-brand-ink text-white" : "text-brand-ink")}
            style={on ? undefined : { background: s?.tint ?? "#fff" }}
          >
            {s && <span aria-hidden className="size-2 rounded-[2px]" style={{ background: s.bar }} />}
            {t.label}
            {data.dots[t.key] && <span aria-label={data.dots[t.key]} className="size-1.5 rounded-full bg-brand-orange" />}
          </Link>
        );
      })}
    </nav>
  );
}
