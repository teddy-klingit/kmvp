import { cn } from "@/lib/utils";
import { DIAGRAM_FADE_START, diagramFadeEnd } from "@/lib/chart-theme";

/** A single-value meter — beige, fully-rounded track; the fill is the
 * diagramFade (orange base, blending toward green as the value climbs),
 * never a flat block. A small black triangle marks the exact value instead
 * of a percentage box next to the bar. */
export function Meter({ value, className, showMarker = true }: { value: number; className?: string; showMarker?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative w-full", className)}>
      {showMarker && (
        <div
          className="absolute -top-[5px] size-0 -translate-x-1/2 border-x-[4px] border-t-[5px] border-x-transparent border-t-ink"
          style={{ left: `${v}%` }}
        />
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-eggshell">
        <div
          className="h-full rounded-full"
          style={{ width: `${v}%`, backgroundImage: `linear-gradient(90deg, ${DIAGRAM_FADE_START}, ${diagramFadeEnd(v / 100)})` }}
        />
      </div>
    </div>
  );
}
