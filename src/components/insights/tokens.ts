/** Chart colours (README "Insights v2"), in a plain module so server components can read them too. */
export const INK = "#1E1E1E";
export const GREY = "#C2C3C5";
export const GRID = "#EFEBE2";
export const ORANGE = "#FF5D02";
/** Categorical order: always with a legend and direct labels. */
export const SERIES = ["#3B6FB6", "#8D9E47", "#B455B6", "#D08A2E"];

/** How a chart prints a number. A plain object, so server pages can pass it to the (client) charts. */
export type Fmt = { kind: "int" | "compact" | "pct" | "money"; currency?: string | null; decimals?: number };

export function fmt(f: Fmt | undefined, v: number) {
  const k = f?.kind ?? "int";
  if (k === "pct") return `${v.toFixed(f?.decimals ?? (v < 1 && v > 0 ? 2 : 1)).replace(/\.0+$/, "")}%`;
  if (k === "compact") return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K` : String(Math.round(v));
  const n = new Intl.NumberFormat("en-GB", { maximumFractionDigits: f?.decimals ?? 0 }).format(v);
  return k === "money" && f?.currency ? `${f.currency} ${n}` : n;
}
