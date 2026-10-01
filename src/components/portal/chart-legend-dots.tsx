"use client";

/** Recharts legend content renderer: a small dot + faint label per series,
 * matching the "Förklaring: prick + text-[10px] text-muted" rule instead of
 * Recharts' default colored-square legend. */
export function ChartLegendDots({ payload }: { payload?: { value: string; color?: string }[] }) {
  if (!payload || payload.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
      {payload.map((entry) => (
        <span key={entry.value} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="size-[6px] shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.value}
        </span>
      ))}
    </div>
  );
}
