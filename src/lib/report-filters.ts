export type DateRangePreset = "7d" | "30d" | "90d" | "this_month" | "last_month" | "this_quarter";

export const DATE_RANGE_PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_quarter", label: "This quarter" },
];

export type ReportFilters = {
  preset?: string;
  from?: string; // ISO yyyy-mm-dd, only used when preset is absent/"custom"
  to?: string;
  platform?: string;
  contentType?: string;
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * Resolves a filter's date preset (or explicit from/to) into a concrete
 * {from, to} window plus a human label — the single source of truth every
 * report-scoped query and the report UI both read from, so the number
 * shown always matches the label ("Last 30 days") describing it.
 */
export function resolveDateRange(filters: ReportFilters): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (filters.from && filters.to) {
    return { from: startOfDay(new Date(filters.from)), to: endOfDay(new Date(filters.to)), label: `${filters.from} – ${filters.to}` };
  }
  const preset = (filters.preset as DateRangePreset) || "30d";
  switch (preset) {
    case "7d":
      return { from: startOfDay(new Date(now.getTime() - 7 * 86400000)), to: endOfDay(now), label: "Last 7 days" };
    case "90d":
      return { from: startOfDay(new Date(now.getTime() - 90 * 86400000)), to: endOfDay(now), label: "Last 90 days" };
    case "this_month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now), label: "This month" };
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from, to, label: "Last month" };
    }
    case "this_quarter": {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return { from: new Date(now.getFullYear(), qStartMonth, 1), to: endOfDay(now), label: "This quarter" };
    }
    case "30d":
    default:
      return { from: startOfDay(new Date(now.getTime() - 30 * 86400000)), to: endOfDay(now), label: "Last 30 days" };
  }
}

/** The equivalent-length window immediately before a resolved range, so a
 * report can say "vs. the previous period" instead of just a raw number. */
export function previousPeriod(range: { from: Date; to: Date }): { from: Date; to: Date } {
  const durationMs = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - durationMs);
  return { from, to };
}

/** Percent change from `previous` to `current`, rounded to 1 decimal —
 * null when there's nothing to compare against. */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Builds a query string from a filter set, dropping empty values — shared
 * by every page that reads/writes these filters as URL search params. */
export function filtersToQueryString(filters: ReportFilters): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  return params.toString();
}
