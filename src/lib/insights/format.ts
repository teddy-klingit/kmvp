/** How Insights (Phase X v2) prints its numbers: "€141k", "€30.6k", "€31", "+18%", "−9%", "+0.2 pts". */

const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export function money(v: number, currency = "EUR") {
  const sym = SYMBOL[currency] ?? `${currency} `;
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  const body = a >= 100_000 ? `${Math.round(a / 1000)}k` : a >= 1000 ? `${(a / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${Math.round(a)}`;
  return `${sign}${sym}${body}`;
}

/** 41000 → "41k", 1100 → "1.1k", 930 → "930", 1480 → "1,480" (thousands under 10k keep their digits when asked). */
export function count(v: number, opts: { exactUnder?: number } = {}) {
  const a = Math.round(v);
  if (a < (opts.exactUnder ?? 1000)) return a.toLocaleString("en-GB");
  return a >= 10_000 ? `${(a / 1000).toFixed(a >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k` : `${(a / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export const signedPct = (change: number) => `${change >= 0 ? "+" : "−"}${Math.round(Math.abs(change) * 100)}%`;
export const pts = (diff: number) => `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1).replace(/\.0$/, "")} pts`;
export const pct1 = (v: number) => `${v.toFixed(1).replace(/\.0$/, "")}%`;
export const times = (v: number) => `${v.toFixed(1)}×`;

/** "vs the previous 30 days", "vs the previous 12 months". */
export const vsLabel = (days: number) => `vs the previous ${days === 365 ? "12 months" : `${days} days`}`;
