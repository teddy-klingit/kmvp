import Link from "next/link";
import { AlertTriangle, ChevronRight, Crosshair } from "lucide-react";
import type { TabFinding } from "@/lib/insight-records";
import { insightSources } from "@/lib/insight-records";
import { Chips } from "@/components/insights/source-chip";
import { ChartCard } from "@/components/insights/cards";
import { AskIdeaButton } from "@/components/insights/ask-idea-button";
import { ORANGE } from "@/components/insights/tokens";
import { cn } from "@/lib/utils";

/**
 * The parts every Insights tab is built from (Phase X v2), in this order: the short answer, 4 key numbers, the tab's
 * own views, what we found, and what we can't see yet.
 */

export function ShortAnswer({ text, sources }: { text: string; sources: string[] }) {
  return (
    <section aria-label="The short answer" className="flex flex-col gap-4 rounded-2xl bg-white px-6 py-6">
      <span className="font-brand-mono text-[12px] uppercase tracking-[0.04em] text-brand-ink-2">The short answer</span>
      <p className="m-0 max-w-[68ch] text-[20px] font-light leading-[1.45] text-brand-ink min-[700px]:text-[23px]">{text}</p>
      {sources.length > 0 && <Chips sources={sources} />}
    </section>
  );
}

export type Tone = "good" | "bad" | "neutral";
export type KeyNumberData = { label: string; value: string; change?: { text: string; tone: Tone } | null; sub?: string | null; spark?: number[] };

const TONE_TEXT: Record<Tone, string> = { good: "text-[#6E7D2F]", bad: "text-brand-orange-text", neutral: "text-brand-ink-2" };

/** A small trend line: the segment's colour, orange when the change is bad. */
function Spark({ values, color }: { values: number[]; color: string }) {
  // No line without numbers behind it: a flat zero line would read as "nothing happened".
  if (values.length < 2 || values.every((v) => !v)) return null;
  const w = 96;
  const h = 36;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 8)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-24 shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function KeyNumbers({ items, color = "#B455B6" }: { items: KeyNumberData[]; color?: string }) {
  return (
    <section aria-label="Key numbers" className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 min-[1100px]:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-white px-5 py-5">
          <span className="truncate text-[14px] text-brand-ink-2">{k.label}</span>
          <span className="flex items-end justify-between gap-3">
            <span className="whitespace-nowrap text-[28px] font-light leading-[1.15] tabular-nums">{k.value}</span>
            {k.spark && <Spark values={k.spark} color={k.change?.tone === "bad" ? ORANGE : color} />}
          </span>
          {k.change && <span className={cn("text-[13px]", TONE_TEXT[k.change.tone])}>{k.change.text}</span>}
          {k.sub && <span className="text-[12px] text-brand-mute">{k.sub}</span>}
        </div>
      ))}
    </section>
  );
}

/** A finding whose title carries on from its number ("40%" + "off from three…") reads as one line. */
export function findingLine(i: { title: string; value: string | null }) {
  return i.value && /^[a-z]/.test(i.title) ? `${i.value} ${i.title}` : i.title;
}

/** "What we found": each finding with its sources, and the opportunity it's used in, or "Ask for an idea". */
export function WhatWeFound({ findings, pm, className }: { findings: TabFinding[]; pm: string; className?: string }) {
  if (!findings.length) return null;
  return (
    <ChartCard title="What we found" flush className={className}>
      <ul className="m-0 list-none p-0">
        {findings.map(({ insight, used, askedAt }) => (
          <li key={insight.id} id={`finding-${insight.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-brand-line px-6 py-4 first:border-t-0">
            <span className="flex min-w-0 flex-1 basis-[260px] flex-col gap-2">
              <span className="text-[15px] leading-snug">{findingLine(insight)}</span>
              <Chips sources={insightSources(insight)} />
            </span>
            {used.length ? (
              <span className="flex flex-wrap gap-2">
                {used.map((o) => (
                  <Link key={o.id} href={`/opportunities/${o.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-[#F5C9B0] bg-[#FFF4EE] px-3 py-1 text-[12px] text-brand-ink no-underline hover:border-brand-orange">
                    <Crosshair className="size-3" strokeWidth={2} /> {o.title}
                    {o.done ? " (done)" : ""} <ChevronRight className="size-3" />
                  </Link>
                ))}
              </span>
            ) : (
              <AskIdeaButton insightId={insight.id} asked={Boolean(askedAt)} pm={pm} />
            )}
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

export type BlindSpot = { text: string; action?: { label: "Connect" | "Reconnect" | "Upload" | string; href: string } | null };

/** "What we can't see yet": missing or broken sources, each with what to do. Never zeros in their place. */
export function BlindSpots({ items, className }: { items: BlindSpot[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ChartCard title="What we can’t see yet" flush className={className}>
      <ul className="m-0 list-none p-0">
        {items.map((b) => (
          <li key={b.text} className="flex items-center gap-3 border-t border-brand-line px-6 py-4 first:border-t-0">
            <AlertTriangle className="size-4 shrink-0 text-brand-orange" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 text-[14px] leading-snug">{b.text}</span>
            {b.action && (
              <Link href={b.action.href} className="inline-flex h-9 shrink-0 items-center rounded-full border border-brand-ink px-4 font-brand-mono text-[12px] text-brand-ink no-underline hover:bg-brand-ink hover:text-white print:hidden">
                {b.action.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

/**
 * A view whose source isn't connected: what it would show, blurred, with what connecting unlocks. Never an empty
 * chart or zeros.
 */
export function Blurred({ children, line, action }: { children: React.ReactNode; line: string; action?: { label: string; href: string } }) {
  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div aria-hidden className="pointer-events-none select-none blur-[6px] saturate-50">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/40 px-6 text-center">
        <p className="m-0 max-w-[46ch] text-[15px] text-brand-ink">{line}</p>
        {action && (
          <Link href={action.href} className="inline-flex h-10 items-center rounded-full bg-brand-ink px-5 font-brand-mono text-[12px] text-white no-underline">
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}

/** A card with the design's title row (used by the tabs' own views). */
export { ChartCard as Card };
