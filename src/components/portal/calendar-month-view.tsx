import Link from "next/link";
import { Sparkles } from "lucide-react";
import { PostDetailDialog } from "@/components/portal/post-detail-dialog";
import { PlatformIcon } from "@/components/portal/platform-icon";
import { avatarColorFor, cn } from "@/lib/utils";

type CalPost = {
  id: string;
  title: string;
  platform: string;
  status: string;
  contentType: string | null;
  scheduledDate: Date | null;
  publishedDate: Date | null;
  impressions: number | null;
  reach: number | null;
  engagements: number | null;
  engagementRate: number | null;
  videoViews: number | null;
  websiteClicks: number | null;
  saves: number | null;
  shares: number | null;
  comments: number | null;
  sourceSuggestionId: string | null;
};

export type CalSuggestion = {
  id: string;
  title: string;
  platform: string;
  proposedDate: Date;
  href: string;
};

/** A non-content calendar entry — a Klingit project deadline or something
 * the client logged themselves. Rendered as a plain solid-color bar (no
 * post-detail dialog, since there's no ContentPost behind it), colored by
 * `colorSeed` the same way the rest of the app colors avatars/badges. */
export type CalOtherItem = {
  id: string;
  title: string;
  date: Date;
  href?: string;
  colorSeed: string;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function dateOf(p: CalPost) {
  return p.status === "PUBLISHED" ? p.publishedDate : p.scheduledDate;
}

/** Full month grid — a genuine calendar view of the content plan, so posts
 * can be scanned by date at a glance instead of only as two flat lists. */
export function CalendarMonthView({
  month,
  posts,
  suggestions = [],
  otherItems = [],
  prevHref,
  nextHref,
}: {
  month: Date;
  posts: CalPost[];
  suggestions?: CalSuggestion[];
  otherItems?: CalOtherItem[];
  prevHref: string;
  nextHref: string;
}) {
  const first = startOfMonth(month);
  const firstWeekday = (first.getDay() + 6) % 7; // Monday-start
  const gridStart = addDays(first, -firstWeekday);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
        <div className="flex items-center gap-2">
          <Link href={prevHref} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            ‹ Prev
          </Link>
          <Link href={nextHref} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            Next ›
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-border">
        {WEEKDAYS.map((w) => (
          <div key={w} className="border-b border-border bg-muted px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {w}
          </div>
        ))}
        {days.map((day, i) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = sameDay(day, today);
          const dayPosts = posts.filter((p) => {
            const d = dateOf(p);
            return d && sameDay(d, day);
          });
          const daySuggestions = suggestions.filter((s) => sameDay(s.proposedDate, day));
          const dayOtherItems = otherItems.filter((it) => sameDay(it.date, day));
          return (
            <div
              key={i}
              className={cn(
                "flex min-h-[92px] flex-col gap-1 border-b border-r border-border p-1.5",
                (i + 1) % 7 === 0 && "border-r-0",
                i >= 35 && "border-b-0",
                !inMonth && "bg-muted/40"
              )}
            >
              <span
                className={cn(
                  "text-[11px]",
                  inMonth ? "text-muted-foreground" : "text-muted-foreground/50",
                  isToday && "flex size-5 items-center justify-center rounded-full bg-accent font-semibold text-ink"
                )}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-1">
                {dayOtherItems.slice(0, 2).map((it) => {
                  const bar = (
                    <span
                      className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium text-white"
                      style={{ backgroundColor: avatarColorFor(it.colorSeed) }}
                      title={it.title}
                    >
                      {it.title}
                    </span>
                  );
                  return it.href ? (
                    <Link key={it.id} href={it.href} className="transition-opacity hover:opacity-80">
                      {bar}
                    </Link>
                  ) : (
                    <div key={it.id}>{bar}</div>
                  );
                })}
                {dayPosts.slice(0, 3).map((p) => (
                  <PostDetailDialog key={p.id} post={p}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium transition-opacity hover:opacity-80",
                        p.status === "PUBLISHED" ? "bg-success-soft text-success-foreground" : "bg-accent-soft text-ink"
                      )}
                      title={p.title}
                    >
                      <PlatformIcon platform={p.platform} className="size-2.5 shrink-0" />
                      <span className="truncate">{p.title}</span>
                    </button>
                  </PostDetailDialog>
                ))}
                {dayPosts.length > 3 && <span className="text-[10px] text-muted-foreground">+{dayPosts.length - 3} more</span>}
                {daySuggestions.map((s) => (
                  <Link
                    key={s.id}
                    href={s.href}
                    className="flex w-full items-center gap-1 truncate rounded border border-dashed border-accent px-1 py-0.5 text-left text-[10px] font-medium text-ink transition-opacity hover:opacity-80"
                    title={`Suggested: ${s.title} — see Plan suggestions below`}
                  >
                    <Sparkles className="size-2.5 shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
