import { cn } from "@/lib/utils";

/**
 * Numbers. Only pass entries that have data: a metric without data is hidden, never shown as "—"
 * (the missing source is explained once, in a Connect accounts card). A change is only shown when
 * there is a real previous period to compare against.
 */
export type Stat = { label: string; value: string; note?: string | null; change?: { pct: number; vs: string } | null };

function Change({ change }: { change: NonNullable<Stat["change"]> }) {
  const up = change.pct >= 0;
  return (
    <span className={cn("text-[12px]", up ? "text-ds-success-text" : "text-ds-danger-text")} title={`vs ${change.vs}`}>
      {up ? "+" : ""}
      {change.pct}% vs {change.vs}
    </span>
  );
}

/** Label / value rows in a card ("Last 30 days"). */
export function StatRows({ rows }: { rows: Stat[] }) {
  return (
    <dl className="m-0 py-1">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-brand-line px-6 py-3.5 first:border-t-0">
          <dt className="min-w-0 flex-1 text-[14px] text-brand-ink-2">{r.label}</dt>
          <dd className="m-0 flex items-baseline gap-2">
            <span className="text-[24px] font-light leading-[1.2] tabular-nums">{r.value}</span>
            {r.note && <span className="text-[12px] text-brand-ink-2">{r.note}</span>}
            {r.change && <Change change={r.change} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Headline numbers in a row inside one card (2 across on phones, up to 4 on wide cards). */
export function StatTiles({ tiles, className }: { tiles: Stat[]; className?: string }) {
  if (tiles.length === 0) return null;
  return (
    <div className={className}>
      {/* Flex, not grid: a short last row stretches to the edge instead of leaving an empty grey cell. */}
      <div className="flex flex-wrap gap-px bg-brand-line">
        {tiles.map((t) => (
          <div key={t.label} className="flex min-w-0 flex-1 basis-[150px] flex-col gap-1 bg-white px-6 py-5">
            <span className="text-[13px] text-brand-ink-2">{t.label}</span>
            <span className="text-[28px] font-light leading-[1.15] tabular-nums">{t.value}</span>
            {t.note && <span className="text-[12px] text-brand-ink-2">{t.note}</span>}
            {t.change && <Change change={t.change} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars ("Click-through rate by format"), scaled to the largest value with some headroom. */
export function HBars({ rows, unit = "%", decimals = 1 }: { rows: { label: string; value: number }[]; unit?: string; decimals?: number }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  const scale = max * 1.15;
  return (
    <div className="@container/bars flex flex-col gap-3.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,104px)_minmax(0,1fr)_56px] items-center gap-4 @min-[520px]/bars:grid-cols-[180px_minmax(0,1fr)_56px]">
          <span className="truncate text-[14px]">{r.label}</span>
          <span className="block h-3 overflow-hidden rounded-full bg-brand-chip">
            <span className="block h-full rounded-full bg-brand-ink" style={{ width: `${(r.value / scale) * 100}%` }} />
          </span>
          <span className="text-right text-[14px] tabular-nums">
            {r.value.toFixed(decimals)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A thin progress bar (credits, plan coverage, brand health). */
export function Meter({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div role="img" aria-label={label} className={cn("h-1 overflow-hidden rounded-full bg-brand-track", className)}>
      <span className="block h-full rounded-full bg-brand-ink" style={{ width: `${pct}%` }} />
    </div>
  );
}
