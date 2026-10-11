"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { movePlanItemAction } from "@/lib/actions/plan-item-actions";
import { cn } from "@/lib/utils";

export type GridEntry = { id: string; itemId: string | null; title: string; date: string; endDate: string | null; maker: "client" | "klingit_help" | "klingit_project"; briefBy: string | null; href: string; draggable: boolean; late: boolean };
export type GridMoment = { id: string; date: string; name: string };
export type GridGap = { weekStart: string; week: number; channel: string; planned: number; agreed: number };

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY = 86400000;
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(s);
const same = (a: Date, b: Date) => key(a) === key(b);

/** You make it: white with an outline · Klingit helps: peach with an orange edge · Klingit project: ink. */
export const MAKER_CHIP: Record<GridEntry["maker"], string> = {
  client: "border border-brand-outline bg-white text-brand-ink",
  klingit_help: "border-l-[3px] border-brand-orange bg-brand-peach-pale text-brand-ink",
  klingit_project: "bg-brand-ink text-white",
};

/**
 * Plan → Calendar grid (design 04): weeks from Monday, key moments in the day header, campaigns as bars across
 * their dates, a "Brief due" marker on each brief-by day, hatched weeks with a gap warning, and drag to reschedule
 * (the server works out the new brief-by).
 */
export function PlanGrid({ start, weeks, month, entries, moments, gaps, today }: { start: string; weeks: number; month: number | null; entries: GridEntry[]; moments: GridMoment[]; gaps: GridGap[]; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const first = parse(start);
  const now = parse(today);
  const drop = (day: Date, e: React.DragEvent) => {
    const id = e.dataTransfer.getData("text/plan-item");
    if (!id) return;
    e.preventDefault();
    startTransition(async () => {
      await movePlanItemAction(id, key(day));
      router.refresh();
    });
  };

  return (
    <div role="grid" aria-busy={pending} className={cn(pending && "opacity-70")}>
      <div role="row" className="grid grid-cols-7 border-b border-brand-line">
        {WEEKDAYS.map((d) => (
          <span key={d} role="columnheader" className="px-2.5 py-3 font-brand-mono text-[11px] text-brand-ink-2">
            {d}
          </span>
        ))}
      </div>
      {Array.from({ length: weeks }, (_, w) => {
        const days = Array.from({ length: 7 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + w * 7 + i));
        const wStart = days[0];
        const wEnd = new Date(wStart.getTime() + 7 * DAY);
        const gap = gaps.filter((g) => same(parse(g.weekStart), wStart));
        const bars = entries.filter((e) => e.endDate && parse(e.endDate).getTime() - parse(e.date).getTime() >= DAY && parse(e.date) < wEnd && parse(e.endDate) >= wStart);
        return (
          <div key={w} role="row" className={cn("relative grid grid-cols-7 border-b border-brand-line last:border-b-0", gap.length && "bg-[repeating-linear-gradient(135deg,rgba(255,93,2,0.06)_0_8px,transparent_8px_16px)]")}>
            {days.map((d) => {
              const outside = month != null && d.getMonth() !== month;
              const moment = moments.filter((m) => same(parse(m.date), d));
              const dayEntries = entries.filter((e) => !(e.endDate && parse(e.endDate).getTime() - parse(e.date).getTime() >= DAY) && same(parse(e.date), d));
              const due = entries.filter((e) => e.briefBy && same(parse(e.briefBy), d));
              return (
                <div
                  key={key(d)}
                  role="gridcell"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => drop(d, e)}
                  aria-label={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(d)}
                  className={cn("flex min-h-[112px] flex-col gap-1.5 border-r border-brand-line px-2 pb-2 pt-2 last:border-r-0", bars.length && "pt-2")}
                >
                  <span className="flex items-baseline gap-1.5">
                    <span className={cn("text-[14px]", outside && "text-brand-mute", same(d, now) && "flex size-7 items-center justify-center rounded-full bg-brand-orange text-white")}>{d.getDate() === 1 && !same(d, now) ? `${d.getDate()} ${new Intl.DateTimeFormat("en-GB", { month: "short" }).format(d)}` : d.getDate()}</span>
                    {moment.length > 0 && (
                      <span className="min-w-0 truncate text-[11px] text-[#B455B6]" title={moment.map((m) => m.name).join(" · ")}>
                        {moment[0].name}
                        {moment.length > 1 && ` +${moment.length - 1}`}
                      </span>
                    )}
                  </span>
                  {bars.length > 0 && <span aria-hidden className="h-6" />}
                  {due.map((e) => (
                    <Link key={`due-${e.id}`} href={e.href} className={cn("flex items-start gap-1 rounded-[6px] border px-1.5 py-1 text-[11px] leading-[1.3] no-underline", e.late ? "border-brand-orange bg-brand-orange text-white" : "border-brand-orange text-brand-orange-text")}>
                      <AlertTriangle className="mt-px size-3 shrink-0" strokeWidth={2} />
                      <span className="line-clamp-3">Brief due · {e.title}</span>
                    </Link>
                  ))}
                  {dayEntries.map((e) => (
                    <Link
                      key={e.id}
                      href={e.href}
                      draggable={e.draggable}
                      onDragStart={(ev) => e.itemId && ev.dataTransfer.setData("text/plan-item", e.itemId)}
                      title={e.title}
                      className={cn("line-clamp-2 rounded-[6px] px-1.5 py-1 text-[11px] leading-[1.3] no-underline", MAKER_CHIP[e.maker], e.draggable && "cursor-grab")}
                    >
                      {e.title}
                    </Link>
                  ))}
                </div>
              );
            })}
            {bars.map((b, i) => {
              const s = Math.max(0, Math.round((parse(b.date).getTime() - wStart.getTime()) / DAY));
              const end = Math.min(6, Math.round((parse(b.endDate!).getTime() - wStart.getTime()) / DAY));
              return (
                <Link key={b.id} href={b.href} title={b.title} className={cn("absolute h-6 truncate rounded-[6px] px-2 text-[11px] leading-6 no-underline", MAKER_CHIP[b.maker])} style={{ top: 34 + i * 28, left: `calc(${(s / 7) * 100}% + 6px)`, width: `calc(${((end - s + 1) / 7) * 100}% - 12px)` }}>
                  {b.title}
                  {b.maker === "klingit_project" && s === Math.max(0, Math.round((parse(b.date).getTime() - wStart.getTime()) / DAY)) && parse(b.date) >= wStart ? " · Klingit project" : ""}
                </Link>
              );
            })}
            {gap.length > 0 && (
              <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5 text-[12px] text-brand-orange-text">
                <AlertTriangle className="size-3.5" strokeWidth={2} />
                Week {gap[0].week}: {gap.map((g) => (g.planned === 0 ? `no ${g.channel} post planned` : `${g.planned} of ${g.agreed} ${g.channel} posts planned`)).join(" · ")}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
