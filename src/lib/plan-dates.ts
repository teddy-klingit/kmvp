/**
 * Plan dates without the database (Phase R): shared by the server (plan.ts) and the Add to plan dialog, so the
 * brief-by date the dialog shows is the one that gets saved.
 */
const DAY = 86400000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** `n` working days (Mon–Fri) before `date`. */
export function subtractWorkingDays(date: Date, n: number) {
  let d = dayStart(date);
  let left = n;
  while (left > 0) {
    d = new Date(d.getTime() - DAY);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

/** `n` working days after `date` (the earliest live date Klingit can make, from today). */
export function addWorkingDays(date: Date, n: number) {
  let d = dayStart(date);
  let left = n;
  while (left > 0) {
    d = new Date(d.getTime() + DAY);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

export type LeadTime = { format: string; workingDays: number; teamCredits: number | null };

/** A weekend live date counts from the Friday before it: the work has to be ready on the last working day. */
export function lastWorkingDay(date: Date) {
  const d = dayStart(date);
  const back = d.getDay() === 6 ? 1 : d.getDay() === 0 ? 2 : 0;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}

/** Brief-by = live date − the longest lead time among its formats, in working days (no formats: a post's). */
export function briefByFor(date: Date, formats: string[], leadTimes: Pick<LeadTime, "format" | "workingDays">[]) {
  const known = leadTimes.filter((l) => formats.includes(l.format));
  const longest = [...known].sort((a, b) => b.workingDays - a.workingDays)[0] ?? leadTimes.find((l) => l.format === "Post") ?? { format: "Post", workingDays: 5 };
  return { briefBy: subtractWorkingDays(lastWorkingDay(date), longest.workingDays), days: longest.workingDays, format: longest.format };
}

/** A rough team-credit estimate for Klingit's help: the formats' estimates added up (placeholders). */
export function teamCreditsFor(formats: string[], leadTimes: Pick<LeadTime, "format" | "teamCredits">[]) {
  const sum = leadTimes.filter((l) => formats.includes(l.format)).reduce((a, l) => a + (l.teamCredits ?? 0), 0);
  return sum > 0 ? sum : null;
}

/** Days from today to a date (0 = today, negative = past). */
export const daysUntil = (d: Date, now = new Date()) => Math.round((dayStart(d).getTime() - dayStart(now).getTime()) / DAY);
