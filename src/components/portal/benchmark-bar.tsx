function pct(value: number, max: number) {
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

/** Own CTR marked against an AI-estimated category range — a plain comparison
 * bar (not recharts) so the "estimate" band and the "measured" marker read as
 * visually distinct kinds of data. The marker is a small black triangle at
 * the value, matching the app's Meter — no percentage box needed next to it. */
export function BenchmarkBar({
  ownCtr,
  estimatedLow,
  estimatedHigh,
}: {
  ownCtr: number;
  estimatedLow: number;
  estimatedHigh: number;
}) {
  const max = Math.max(estimatedHigh, ownCtr) * 1.3;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-full">
        <div
          className="absolute -top-[5px] size-0 -translate-x-1/2 border-x-[4px] border-t-[5px] border-x-transparent border-t-ink"
          style={{ left: pct(ownCtr, max) }}
        />
        <div className="relative h-4 w-full overflow-hidden rounded-full bg-eggshell">
          <div
            className="absolute inset-y-0 rounded-full bg-brand-lime"
            style={{ left: pct(estimatedLow, max), width: `calc(${pct(estimatedHigh, max)} - ${pct(estimatedLow, max)})` }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>0%</span>
        <span>{max.toFixed(1)}%</span>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-ink" />
          Your CTR: <strong className="font-semibold text-foreground">{ownCtr}%</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-brand-lime" />
          Est. category range: <strong className="font-semibold text-foreground">{estimatedLow}–{estimatedHigh}%</strong>
        </span>
      </div>
    </div>
  );
}
