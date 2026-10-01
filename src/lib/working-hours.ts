/**
 * Klingit working hours: Mon–Fri 09:00–17:00 Europe/Stockholm. Public holidays are ignored (approved for the MVP).
 * Used for the "client waiting more than 4 working hours" exception.
 */
export const WORK_TZ = "Europe/Stockholm";
const DAY_START = 9;
const DAY_END = 17;
const HOUR = 3_600_000;

/** The wall-clock time in Stockholm, encoded as a UTC timestamp so plain date maths works across DST. */
function wallClock(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: WORK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

/** Working hours elapsed between two instants (0 if `to` is before `from`). */
export function workingHoursBetween(from: Date, to: Date) {
  let start = wallClock(from);
  const end = wallClock(to);
  if (end <= start) return 0;
  let ms = 0;
  while (start < end) {
    const day = new Date(start);
    const dayStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const open = dayStart + DAY_START * HOUR;
      const close = dayStart + DAY_END * HOUR;
      const a = Math.max(start, open);
      const b = Math.min(end, close);
      if (b > a) ms += b - a;
    }
    start = dayStart + 24 * HOUR;
  }
  return ms / HOUR;
}

/** "5h", "2d 3h" in working time — for "waiting …" labels. */
export function formatWorkingWait(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  const days = Math.floor(hours / (DAY_END - DAY_START));
  const rest = Math.round(hours - days * (DAY_END - DAY_START));
  if (days === 0) return `${Math.round(hours)}h`;
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`;
}
