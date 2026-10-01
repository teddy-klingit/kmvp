/** Monday-first month grid — returns full weeks (Date[7]) covering the month,
 * including the leading/trailing days from adjacent months needed to fill
 * each week row. */
export function getMonthGridWeeks(year: number, month: number): Date[][] {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  const leadingOffset = (firstOfMonth.getDay() + 6) % 7; // 0=Mon..6=Sun
  const trailingOffset = 6 - ((lastOfMonth.getDay() + 6) % 7);

  const gridStart = new Date(year, month, 1 - leadingOffset);
  const gridEnd = new Date(year, month, lastOfMonth.getDate() + trailingOffset);

  const weeks: Date[][] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
