/** Shared Recharts styling so every chart in the app follows the same
 * "Diagram" rules: eggshell dashed gridlines in both directions, faint
 * 9-10px axis text, white-filled/colored-stroke points, and series drawn
 * from the three accent hues (never primary/ink for a data series). */

export const CHART_GRID = { stroke: "var(--eggshell)", strokeDasharray: "4 6" };

export const CHART_AXIS_TICK = { fontSize: 10, fill: "var(--faint)" };

export const CHART_TOOLTIP_STYLE = {
  background: "var(--paper)",
  border: "1px solid var(--surface)",
  borderRadius: 12,
  fontSize: 12,
};

/** Purple, green, orange, then ink for a 4th+ series — the three accent
 * hues carry chart lines/bars, cycling in this order for consistency. */
export const CHART_SERIES_COLORS = ["var(--purple)", "var(--green)", "var(--orange)", "var(--ink)"];

/** A chart point: 4px radius, white fill, the series color as the outline. */
export function chartDot(color: string) {
  return { r: 4, fill: "var(--paper)", stroke: color, strokeWidth: 2 };
}

const FADE_ORANGE: [number, number, number] = [255, 93, 2];
const FADE_GREEN: [number, number, number] = [228, 242, 179];

function mixRgb(a: [number, number, number], b: [number, number, number], t: number) {
  return a.map((c, i) => Math.round(c + (b[i] - c) * t)) as [number, number, number];
}

/** A bar/meter always starts orange at its base; the far end blends toward
 * green as the value climbs, eased so the shift is visible past halfway —
 * a high bar reads as greener than a low one, never a flat black fill. */
export function diagramFadeEnd(fraction: number) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const eased = Math.pow(clamped, 0.6);
  const [r, g, b] = mixRgb(FADE_ORANGE, FADE_GREEN, eased);
  return `rgb(${r}, ${g}, ${b})`;
}

export const DIAGRAM_FADE_START = "#FF5D02";
