/**
 * Where each Klarna demo project's due date sits relative to today. The seed uses these, and
 * scripts/refresh-demo-dates.ts re-anchors an existing database to them (shifting every date of
 * the project by the same amount), so demo items never read "overdue since 24 Aug".
 */
export const DEMO_DUE_IN_DAYS: Record<string, number> = {
  "Q3 App install campaign": 6,
  "Summer social pack": 3,
  "Autumn brand refresh": 24,
};

export const DAY_MS = 86400000;
export const daysFromToday = (n: number, today = new Date()) => new Date(today.getTime() + n * DAY_MS);
