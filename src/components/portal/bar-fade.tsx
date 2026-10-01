"use client";

import { DIAGRAM_FADE_START, diagramFadeEnd } from "@/lib/chart-theme";

/** Per-bar gradient defs for a vertical BarChart — every bar starts orange
 * at its base and blends toward green at its top end, biased by how large
 * the value is relative to the tallest bar. A bar is never a flat color. */
export function BarFadeDefs({
  data,
  dataKey,
  idPrefix,
}: {
  data: Record<string, number | string>[];
  dataKey: string;
  idPrefix: string;
}) {
  const max = Math.max(1, ...data.map((d) => Number(d[dataKey]) || 0));
  return (
    <defs>
      {data.map((d, i) => (
        <linearGradient key={i} id={`${idPrefix}-${i}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={DIAGRAM_FADE_START} />
          <stop offset="100%" stopColor={diagramFadeEnd(Number(d[dataKey]) / max)} />
        </linearGradient>
      ))}
    </defs>
  );
}

export function barFadeUrl(i: number, idPrefix: string) {
  return `url(#${idPrefix}-${i})`;
}
