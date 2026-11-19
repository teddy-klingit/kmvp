import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, ChevronRight, Crosshair, Eye, Sparkle } from "lucide-react";
import type { AnswerCard, SignalStatus } from "@/lib/insights/short-answer";
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

const SIGNAL: Record<SignalStatus, { label: string; tile: string; text: string; Icon: typeof ArrowUp }> = {
  good: { label: "Good news", tile: "bg-[#F2F6E4]", text: "text-[#6E7D2F]", Icon: ArrowUp },
  attention: { label: "Needs attention", tile: "bg-[#FFF1E8]", text: "text-brand-orange-text", Icon: ArrowDown },
  watch: { label: "Keep an eye on", tile: "bg-[#EEF1FA]", text: "text-[#5B6FB0]", Icon: Eye },
};

/** "The short answer": a headline of 12 words or fewer, and 3 signal tiles. Sources sit in a "Based on" row. */
/** The three-weight hierarchy: Medium headline and labels, Semibold numbers. */
export function ShortAnswer({ card, sources, weighted = true }: { card: AnswerCard; sources: string[]; weighted?: boolean }) {
  return (
    <section aria-label="The short answer" className="flex flex-col gap-4 rounded-2xl bg-white px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="font-brand-mono text-[12px] uppercase tracking-[0.04em] text-brand-ink-2">The short answer</span>
        {sources.length > 0 && (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-brand-mute">Based on</span>
            <Chips sources={sources} />
          </span>
        )}
      </div>
      <p className={cn("m-0 text-balance text-[22px] leading-[1.3] text-brand-ink min-[700px]:text-[26px]", weighted ? "font-fw-medium" : "font-light")}>{card.headline}</p>
      {card.tiles.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[700px]:grid-cols-3">
          {card.tiles.map((t) => {
            const k = SIGNAL[t.status];
            return (
              <li key={t.id} className={cn("flex min-w-0 flex-col gap-1.5 rounded-xl px-4 py-4", k.tile)}>
                <span className={cn("inline-flex items-center gap-1.5 font-brand-mono text-[11px] uppercase tracking-[0.04em]", k.text, weighted && "font-fw-medium")}>
                  <k.Icon className="size-3.5" strokeWidth={2} aria-hidden /> {k.label}
                </span>
                <span className={cn("text-[26px] leading-[1.15] tabular-nums text-brand-ink", weighted ? "font-fw-semibold" : "font-light")}>{t.value}</span>
                <span className="text-[14px] leading-snug text-brand-ink-2">{t.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export type PillTone = "good" | "bad" | "neutral" | "watch";
const PILL: Record<PillTone, string> = {
  good: "bg-[#EEF4DA] text-[#5E6B2A]",
  bad: "bg-[#FFF1E8] text-brand-orange-text",
  neutral: "bg-brand-chip text-brand-ink-2",
  watch: "bg-[#EEF1FA] text-[#5B6FB0]",
};

/** Status as a small icon pill: ▲ good, ▼ bad, eye to watch (Best / Weakest, On track / Behind, Planned / Not planned…). */
export function StatusPill({ tone, children, icon = true, className }: { tone: PillTone; children: React.ReactNode; icon?: boolean; className?: string }) {
  const Icon = tone === "good" ? ArrowUp : tone === "bad" ? ArrowDown : tone === "watch" ? Eye : null;
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-fw-medium tabular-nums", PILL[tone], className)}>
      {icon && Icon && <Icon className="size-3" strokeWidth={2.25} aria-hidden />}
      {children}
    </span>
  );
}

/** One "What it means" box at the bottom of a chart card: one sentence, and an optional action. */
export function WhatItMeans({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-6 mb-6 flex flex-wrap items-center gap-3 rounded-xl bg-[#F4F1EA] px-4 py-3", className)}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-ink text-white" aria-hidden>
        <ArrowRight className="size-3.5" strokeWidth={2.25} />
      </span>
      <p className="m-0 min-w-0 flex-1 basis-[260px] text-[14px] leading-snug text-brand-ink">
        <b className="font-fw-semibold">What it means:</b> {children}
      </p>
      {action && <span className="shrink-0 print:hidden">{action}</span>}
    </div>
  );
}

/** The dark pill button used inside a "What it means" box. */
export function MeansButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-9 items-center rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white no-underline hover:opacity-90">
      {children}
    </Link>
  );
}

export type StatTile = { value: string; label: string; sub?: string | null; tone?: PillTone };
const TILE: Record<PillTone, string> = { good: "bg-[#F2F6E4]", bad: "bg-[#FFF1E8]", neutral: "bg-[#F4F1EA]", watch: "bg-[#EEF1FA]" };

/** Small stat tiles in place of sentences (sentiment, list health, new vs returning, pipeline, budget…). */
export function StatTiles({ items, className }: { items: StatTile[]; className?: string }) {
  return (
    <ul className={cn("m-0 grid list-none gap-2.5 p-0", items.length >= 4 ? "grid-cols-2 min-[700px]:grid-cols-4" : items.length === 3 ? "grid-cols-3" : "grid-cols-2", className)}>
      {items.map((t) => (
        <li key={t.label} className={cn("flex min-w-0 flex-col gap-0.5 rounded-xl px-4 py-3", TILE[t.tone ?? "neutral"])}>
          <span className={cn("text-[24px] font-fw-medium leading-[1.2] tabular-nums", t.tone === "bad" ? "text-brand-orange-text" : "text-brand-ink")}>{t.value}</span>
          <span className="text-[13px] text-brand-ink-2">{t.label}</span>
          {t.sub && <span className="text-[12px] text-brand-mute">{t.sub}</span>}
        </li>
      ))}
    </ul>
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
            <span className="whitespace-nowrap text-[28px] font-fw-medium leading-[1.15] tabular-nums">{k.value}</span>
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
            <span className="flex size-7 shrink-0 items-center justify-center self-start rounded-lg bg-[#FFF1E8] text-brand-orange" aria-hidden>
              <Sparkle className="size-3.5" strokeWidth={2} />
            </span>
            <span className="flex min-w-0 flex-1 basis-[240px] flex-col gap-2">
              <span className="text-[15px] font-fw-medium leading-snug">{findingLine(insight)}</span>
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
              <AskIdeaButton insightId={insight.id} asked={Boolean(askedAt)} pm={pm} variant="outline" />
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
