"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Insights v2 charts (README "Insights v2"): small SVG charts, no chart library. Single series in ink; below
 * average / secondary in grey; orange only for "needs your action"; categorical series in a fixed order, always
 * with a legend and direct labels. Bars ≤ 24px with 4px rounded ends (square at the baseline), 2px lines, 1px
 * gridlines. Text is never in a series colour. Every chart has a hover tooltip; its card has a table view.
 */
import { fmt, GREY, GRID, INK, ORANGE, SERIES, type Fmt } from "@/components/insights/tokens";

export type Tone = "ink" | "grey" | "orange";
const TONE: Record<Tone, string> = { ink: INK, grey: GREY, orange: ORANGE };

/** The element's width, kept up to date (charts draw to the real pixel width so text never stretches). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function Tooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div role="tooltip" className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[8px] bg-brand-ink px-2.5 py-1.5 text-[12px] text-white shadow-md" style={{ left: x, top: y - 8 }}>
      {children}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-brand-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={i.line ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]"} style={{ backgroundColor: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((step) => n <= step) ?? 10) * p;
};

// ─── Sparkline ─────────────────────────────────────────────────────────────

/** A grey line with an ink dot on the latest value. Needs at least 2 real points; otherwise draws nothing. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 160;
  const h = 40;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 6) + 2, h - 4 - ((v - min) / span) * (h - 10)] as const);
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMinYMid meet" className={cn("h-10 w-full max-w-40", className)} aria-hidden>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={GREY} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={INK} />
    </svg>
  );
}

// ─── Horizontal bars ───────────────────────────────────────────────────────

export type BarRow = { label: string; sub?: string; value: number; display: string; tone?: Tone; color?: string; thumb?: string | null; thumbColor?: string | null; /** Makes the row's label a link (e.g. to the asset). */ href?: string };

/**
 * Horizontal bars, one per row, with an optional reference line ("Your average 4.7%"): ink above it, grey below,
 * unless a tone is given. Thumbnails are the asset's own image or its tint.
 */
function RowLabel({ href, children }: { href?: string; children: React.ReactNode }) {
  const cls = "flex min-w-0 items-center gap-2.5";
  return href ? (
    <Link href={href} className={cn(cls, "rounded-[6px] text-brand-ink no-underline hover:[&_span.truncate:first-child]:underline")}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  );
}

export function BarList({ rows, reference, max, labelWidth = 150, compact = false }: { rows: BarRow[]; reference?: { value: number; label: string }; max?: number; labelWidth?: number; compact?: boolean }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), reference?.value ?? 0) * 1.05;
  const [hover, setHover] = useState<number | null>(null);
  const pct = (v: number) => `${top > 0 ? Math.min(100, (v / top) * 100) : 0}%`;
  return (
    <div className="relative flex flex-col">
      {rows.map((r, i) => {
        const tone: Tone = r.tone ?? (reference ? (r.value >= reference.value ? "ink" : "grey") : "ink");
        return (
          <div key={`${r.label}-${i}`} className={cn("grid items-center gap-3", compact ? "py-1.5" : "py-2")} style={{ gridTemplateColumns: `minmax(0,min(${labelWidth}px,42%)) minmax(0,1fr) auto` }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <RowLabel href={r.href}>
              {(r.thumb || r.thumbColor) && (
                <span aria-hidden className="size-9 shrink-0 overflow-hidden rounded-[6px]" style={{ backgroundColor: r.thumbColor ? `color-mix(in srgb, ${r.thumbColor} 22%, white)` : "var(--brand-chip)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the asset's own access-checked image */}
                  {r.thumb && <img src={r.thumb} alt="" className="size-full object-cover" />}
                </span>
              )}
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px]">{r.label}</span>
                {r.sub && <span className="truncate text-[12px] text-brand-mute">{r.sub}</span>}
              </span>
            </RowLabel>
            <span className="relative h-5">
              <span className="absolute inset-y-0 left-0 my-auto h-3.5 rounded-r-[4px] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: pct(r.value), backgroundColor: r.color ?? TONE[tone], opacity: hover !== null && hover !== i ? 0.55 : 1 }} />
              {hover === i && <Tooltip x={0} y={0}>{`${r.label}: ${r.display}`}</Tooltip>}
            </span>
            <span className="min-w-12 text-right text-[14px] tabular-nums">{r.display}</span>
          </div>
        );
      })}
      {reference && rows.length > 0 && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: `calc(min(${labelWidth}px, 42%) + 12px)`, right: "calc(3rem + 12px)" }}>
          <span className="absolute inset-y-1 w-px bg-brand-ink" style={{ left: pct(reference.value) }} />
          <span className="absolute -bottom-5 -translate-x-1/2 whitespace-nowrap text-[12px] text-brand-ink-2" style={{ left: pct(reference.value) }}>
            {reference.label}
          </span>
        </div>
      )}
      {reference && <span className="h-5" />}
    </div>
  );
}

// ─── Columns ───────────────────────────────────────────────────────────────

export type Column = { x: string; values: number[] };

/** Vertical columns: one series in ink, or stacked categorical series (with a legend). */
export function ColumnChart({ data, series, height = 160, format: f, xEvery }: { data: Column[]; series: { name: string; color?: string }[]; height?: number; format?: Fmt; xEvery?: number }) {
  const format = (v: number) => fmt(f, v);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const left = 40;
  const bottom = 22;
  const innerW = Math.max(0, width - left - 4);
  const innerH = height - bottom - 6;
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(...totals, 0));
  const ticks = [0, max / 2, max];
  const slot = data.length ? innerW / data.length : 0;
  const barW = Math.max(2, Math.min(24, slot * 0.62));
  const every = xEvery ?? Math.max(1, Math.ceil(data.length / 6));
  const colors = series.map((s, i) => s.color ?? (series.length === 1 ? INK : SERIES[i % SERIES.length]));
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.name).join(", ")} by ${data.length} periods`}>
          {ticks.map((t) => {
            const y = 6 + innerH - (t / max) * innerH;
            return (
              <g key={t}>
                <line x1={left} x2={width - 4} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                <text x={left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#8A8A8A">
                  {format(t)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const cx = left + slot * i + slot / 2;
            let acc = 0;
            return (
              <g key={d.x + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={left + slot * i} y={0} width={slot} height={height} fill="transparent" />
                {d.values.map((v, s) => {
                  const h = (v / max) * innerH;
                  const y = 6 + innerH - acc - h;
                  acc += h;
                  const topSeg = d.values.slice(s + 1).every((x) => x === 0);
                  if (h <= 0) return null;
                  const r = topSeg ? Math.min(4, barW / 2, h) : 0;
                  return <path key={s} d={roundedTop(cx - barW / 2, y, barW, h, r)} fill={colors[s]} opacity={hover !== null && hover !== i ? 0.55 : 1} />;
                })}
                {(data.length - 1 - i) % every === 0 && (
                  <text x={cx} y={height - 6} textAnchor={cx > width - 24 ? "end" : "middle"} fontSize={11} fill="#8A8A8A">
                    {d.x}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={left + slot * hover + slot / 2} y={6 + innerH - (totals[hover] / max) * innerH}>
          {data[hover].x}: {series.length === 1 ? format(data[hover].values[0]) : series.map((s, i) => `${s.name} ${format(data[hover].values[i])}`).join(" · ")}
        </Tooltip>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (r <= 0) return `M${x},${y + h}V${y}H${x + w}V${y + h}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// ─── Lines ─────────────────────────────────────────────────────────────────

/** 2px lines with end labels and a crosshair tooltip. One series in ink; several in the categorical order. */
export function LineChart({ x, series, height = 160, format: f, xEvery }: { x: string[]; series: { name: string; values: (number | null)[]; color?: string }[]; height?: number; format?: Fmt; xEvery?: number }) {
  const format = (v: number) => fmt(f, v);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const left = 40;
  const right = 48;
  const bottom = 22;
  const innerW = Math.max(0, width - left - right);
  const innerH = height - bottom - 6;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = niceMax(Math.max(...all, 0));
  const ticks = [0, max / 2, max];
  const px = (i: number) => left + (x.length > 1 ? (i / (x.length - 1)) * innerW : innerW / 2);
  const py = (v: number) => 6 + innerH - (v / max) * innerH;
  const every = xEvery ?? Math.max(1, Math.ceil(x.length / 6));
  const colors = series.map((s, i) => s.color ?? (series.length === 1 ? INK : SERIES[i % SERIES.length]));
  return (
    <div
      ref={ref}
      className="relative w-full"
      style={{ height }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - r.left - left) / (innerW || 1)) * (x.length - 1));
        setHover(i >= 0 && i < x.length ? i : null);
      }}
      onMouseLeave={() => setHover(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.name).join(", ")} over ${x.length} points`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width - right} y1={py(t)} y2={py(t)} stroke={GRID} strokeWidth={1} />
              <text x={left - 8} y={py(t) + 4} textAnchor="end" fontSize={11} fill="#8A8A8A">
                {format(t)}
              </text>
            </g>
          ))}
          {x.map((label, i) =>
            (x.length - 1 - i) % every === 0 ? (
              <text key={label + i} x={px(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="#8A8A8A">
                {label}
              </text>
            ) : null
          )}
          {hover !== null && <line x1={px(hover)} x2={px(hover)} y1={6} y2={6 + innerH} stroke={GREY} strokeWidth={1} />}
          {series.map((s, si) => {
            const pts = s.values.map((v, i) => (v === null ? null : ([px(i), py(v)] as const))).filter((p): p is readonly [number, number] => Boolean(p));
            const lastIdx = s.values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop();
            return (
              <g key={s.name}>
                <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={colors[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {lastIdx !== undefined && (
                  <>
                    <circle cx={px(lastIdx)} cy={py(s.values[lastIdx]!)} r={3.5} fill={colors[si]} />
                    <text x={px(lastIdx) + 8} y={py(s.values[lastIdx]!) + 4} fontSize={12} fill={INK}>
                      {format(s.values[lastIdx]!)}
                    </text>
                  </>
                )}
                {hover !== null && s.values[hover] !== null && s.values[hover] !== undefined && <circle cx={px(hover)} cy={py(s.values[hover]!)} r={3.5} fill="white" stroke={colors[si]} strokeWidth={2} />}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && x[hover] && (
        <Tooltip x={px(hover)} y={6}>
          {x[hover]}: {series.map((s) => `${series.length > 1 ? `${s.name} ` : ""}${s.values[hover] === null || s.values[hover] === undefined ? "no data" : format(s.values[hover]!)}`).join(" · ")}
        </Tooltip>
      )}
    </div>
  );
}

// ─── Dumbbell, stack bar, mini bars ────────────────────────────────────────

/** Before → now on one track: grey dot for before, ink for now, the segment orange when it got worse. */
export function DumbbellRow({ label, before, after, format: f, worse, note }: { label: string; before: number; after: number; format?: Fmt; worse: boolean; note?: string }) {
  const format = (v: number) => fmt(f, v);
  const max = Math.max(before, after) * 1.15 || 1;
  const a = (before / max) * 100;
  const b = (after / max) * 100;
  const change = before > 0 ? Math.round(((after - before) / before) * 100) : null;
  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-baseline gap-2 text-[13px]">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="tabular-nums text-brand-ink-2">
          {format(before)} → {format(after)}
        </span>
        {change !== null && <span className="w-11 text-right tabular-nums">{change > 0 ? `+${change}` : change}%</span>}
      </div>
      <div className="relative h-3" title={`${label}: ${format(before)} → ${format(after)}`}>
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-brand-line" />
        <span className="absolute top-1/2 h-0.5 -translate-y-1/2" style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(a - b)}%`, backgroundColor: worse ? ORANGE : INK }} />
        <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${a}%`, backgroundColor: GREY }} />
        <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${b}%`, backgroundColor: INK }} />
      </div>
      {note && <span className="text-[12px] text-brand-mute">{note}</span>}
    </div>
  );
}

/** One 100% bar split into segments, with a legend that carries the numbers. */
export function StackBar({ segments }: { segments: { label: string; value: number; display?: string; color?: string }[] }) {
  const legendValue = (s: { value: number; display?: string }) => s.display ?? String(s.value);
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const colors = segments.map((s, i) => s.color ?? SERIES[i % SERIES.length]);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={segments.map((s) => `${s.label} ${legendValue(s)}`).join(", ")}>
        {segments.map((s, i) => (s.value > 0 ? <span key={s.label} title={`${s.label}: ${legendValue(s)}`} style={{ width: `${(s.value / total) * 100}%`, backgroundColor: colors[i] }} /> : null))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-brand-ink-2">
        {segments.map((s, i) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ backgroundColor: colors[i] }} />
            {s.label} <span className="text-brand-ink">{legendValue(s)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Two or three compared values as short bars (a takeaway's or an idea's mini chart). */
export function MiniBars({ rows }: { rows: { label: string; value: number; display: string; tone?: Tone }[] }) {
  // Changes ("−61%") are drawn by size: the label carries the sign.
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0) || 1;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <div key={r.label + i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-3 text-[14px]">
          <span className="truncate">{r.label}</span>
          <span className="h-3.5">
            <span className="block h-full rounded-r-[4px]" style={{ width: `${Math.max(1.5, (Math.abs(r.value) / max) * 100)}%`, backgroundColor: TONE[r.tone ?? (i === 0 ? "ink" : "grey")] }} />
          </span>
          <span className="text-right tabular-nums">{r.display}</span>
        </div>
      ))}
    </div>
  );
}
