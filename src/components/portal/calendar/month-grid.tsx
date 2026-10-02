import Link from "next/link";
import { PostDetailDialog } from "@/components/portal/post-detail-dialog";
import { type CalendarItem, type CalendarKind, monthGrid, sameDay } from "@/lib/calendar-items";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MAX_PER_DAY = 3;

/** Ink = Klingit work, pink = your plan, dashed lime = suggested by the agent (Calendar.dc.html). */
export const KIND_PILL: Record<CalendarKind, string> = {
  klingit: "bg-brand-ink text-white",
  plan: "bg-brand-pink text-brand-ink",
  suggested: "border border-dashed border-brand-lime-strong bg-[#F1F7E1] text-brand-ink",
};

export function KindLegend() {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-brand-ink-2">
      {(
        [
          ["klingit", "Klingit work"],
          ["plan", "Your plan"],
          ["suggested", "Suggested by agent"],
        ] as [CalendarKind, string][]
      ).map(([k, l]) => (
        <span key={k} className="inline-flex items-center gap-2">
          <span aria-hidden className={cn("size-2.5 rounded-[3px]", KIND_PILL[k])} />
          {l}
        </span>
      ))}
    </div>
  );
}

export function ItemPill({ item, className }: { item: CalendarItem; className?: string }) {
  const cls = cn("block w-full truncate rounded-[6px] px-2 py-[3px] text-left text-[11px] leading-[1.4] no-underline", KIND_PILL[item.kind], className);
  if (item.post)
    return (
      <PostDetailDialog post={item.post}>
        <button type="button" className={cls} title={item.title}>
          {item.title}
        </button>
      </PostDetailDialog>
    );
  if (item.href)
    return (
      <Link href={item.href} className={cls} title={item.title}>
        {item.title}
      </Link>
    );
  return (
    <span className={cls} title={item.title}>
      {item.title}
    </span>
  );
}

/** The month grid inside its card: Monday first, days outside the month greyed, today in an orange circle. */
export function MonthGrid({ month, items, today, moreHref }: { month: Date; items: CalendarItem[]; today: Date; moreHref: (day: Date) => string }) {
  const { start, cells } = monthGrid(month);
  const days = Array.from({ length: cells }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return (
    <div role="grid" aria-label={new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(month)}>
      <div role="row" className="grid grid-cols-7 border-b border-brand-line">
        {WEEKDAYS.map((d) => (
          <span key={d} role="columnheader" className="px-2.5 py-3 font-brand-mono text-[11px] text-brand-ink-2">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = sameDay(d, today);
          const dayItems = items.filter((it) => sameDay(it.date, d));
          return (
            <div
              key={d.toISOString()}
              role="gridcell"
              aria-label={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(d)}
              className={cn("flex min-h-[104px] min-w-0 flex-col gap-1 p-2", i % 7 !== 0 && "border-l border-brand-line", i >= 7 && "border-t border-brand-line")}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center text-[13px]",
                  isToday ? "rounded-full bg-brand-orange text-brand-ink" : inMonth ? "text-brand-ink" : "text-brand-outline"
                )}
              >
                {d.getDate()}
              </span>
              {dayItems.slice(0, MAX_PER_DAY).map((it) => (
                <ItemPill key={it.id} item={it} />
              ))}
              {dayItems.length > MAX_PER_DAY && (
                <Link href={moreHref(d)} className="px-1 font-brand-mono text-[10px] text-brand-ink-2 underline underline-offset-2">
                  +{dayItems.length - MAX_PER_DAY} MORE
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
