"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = { value: T; label: string; icon?: React.ReactNode; badge?: number };

/**
 * The one tab style in the app: pills on a rounded track (Insights.dc.html). The active pill is ink with
 * white text. The track colour comes from --seg-track, so it's warm on brand pages and grey elsewhere.
 */
const track = "flex w-max max-w-full gap-1 overflow-x-auto rounded-full bg-[var(--seg-track)] p-1 [scrollbar-width:none]";
const pill = "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-[18px] text-[14px] no-underline transition-colors sm:h-9";
const pillOn = "bg-[var(--seg-active)] text-white";
const pillOff = "text-[var(--seg-text)] hover:bg-black/5";

function Badge({ n }: { n: number }) {
  return (
    <span aria-label={`${n} unread`} className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ds-turn px-[5px] text-[11px] font-semibold text-white">
      {n}
    </span>
  );
}

/** Stateful switch (e.g. the conversation panel's channels). `fill` stretches the pills to equal widths. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  fill = true,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  fill?: boolean;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn(track, fill && "grid w-full")} style={fill ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.value)} className={cn(pill, fill && "px-3", on ? pillOn : pillOff)}>
            {o.icon}
            {o.label}
            {o.badge ? <Badge n={o.badge} /> : null}
          </button>
        );
      })}
    </div>
  );
}

export type SegmentLink = { label: string; href: string; icon?: React.ReactNode; /** Override the pathname match, e.g. for query-string views. */ active?: boolean };

/**
 * Route-driven version: each pill is a link, so back/forward and deep links work. The most specific
 * matching href is active (so "/insights" doesn't light up on "/insights/market").
 */
export function SegmentedNav({ items, label, className }: { items: SegmentLink[]; label: string; className?: string }) {
  const pathname = usePathname() ?? "";
  const matched = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const explicit = items.some((i) => i.active !== undefined);
  const navRef = useRef<HTMLElement>(null);
  // On phones the strip scrolls sideways: keep the active pill in view.
  useEffect(() => {
    const nav = navRef.current;
    const on = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
  }, [pathname]);
  return (
    <nav ref={navRef} aria-label={label} className={cn(track, className)}>
      {items.map((i) => {
        const on = explicit ? Boolean(i.active) : i.href === matched;
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={cn(pill, on ? pillOn : pillOff)}>
            {i.icon}
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
