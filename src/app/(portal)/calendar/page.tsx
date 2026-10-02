import Link from "next/link";
import { X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { loadCalendarItems, monthGrid, plannedPostsInMonth, sameDay, type CalendarItem, type CalendarKind } from "@/lib/calendar-items";
import { approveContentPlanSuggestionAction, generateContentPlanSuggestionsAction, rejectContentPlanSuggestionAction } from "@/lib/actions/content-calendar-actions";
import { formatDay } from "@/lib/project-state";
import { PageHeader } from "@/components/ds/page-header";
import { PageGrid } from "@/components/ds/page-grid";
import { SegmentedNav } from "@/components/ds/segmented-control";
import { FilterChips } from "@/components/ds/filter-chips";
import { SectionCard, CardHeader, Card, CardRows, CardNote } from "@/components/ds/card";
import { Meter } from "@/components/ds/stats";
import { pillClass } from "@/components/ds/button";
import { monoLink } from "@/components/ds/pill-link";
import { AddPlanItemDialog } from "@/components/portal/add-plan-item-dialog";
import { InspirationExploreButton } from "@/components/portal/inspiration-explore-button";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { MonthGrid, KindLegend, ItemPill, KIND_PILL } from "@/components/portal/calendar/month-grid";
import { cn } from "@/lib/utils";

function monthParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const DAY = 86400000;
const SHOW: Record<string, CalendarKind> = { klingit: "klingit", plan: "plan", suggestions: "suggested" };

/**
 * Calendar (Calendar.dc.html): the month grid in a card (Klingit work in ink, your plan in pink, agent
 * suggestions dashed lime), or the same items as dated rows. Side column: the agent's suggestions, each
 * with Add, and plan coverage against the SOW minimum. Under 900px the month view shows the list.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; month?: string; show?: string }> }) {
  const { view, month: monthValue, show } = await searchParams;
  const isList = view === "list";
  const now = new Date();
  const month = monthValue && /^\d{4}-\d{2}$/.test(monthValue) ? new Date(Number(monthValue.slice(0, 4)), Number(monthValue.slice(5, 7)) - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const kind = show ? SHOW[show] : undefined;
  const href = (o: { view?: string | null; month?: string | null; show?: string | null }) => {
    const q = new URLSearchParams();
    const merged = { view: isList ? "list" : null, month: monthValue ?? null, show: kind ? show! : null, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/calendar${q.size ? `?${q}` : ""}`;
  };

  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const grid = monthGrid(month);
  const [all, pending, resolved, inspirations, planTargets, planned] = await Promise.all([
    loadCalendarItems(clientId, viewer.id, grid.start, grid.end),
    prisma.contentPlanSuggestion.findMany({ where: { clientId, status: "PENDING" }, orderBy: [{ proposedDate: "asc" }, { createdAt: "desc" }] }),
    prisma.contentPlanSuggestion.findMany({ where: { clientId, status: { in: ["APPROVED", "REJECTED"] } }, orderBy: { resolvedAt: "desc" }, take: 10 }),
    prisma.inspiration.findMany({ where: { clientId, targetDate: { not: null } } }),
    prisma.contentPlanTarget.findMany({ where: { clientId }, orderBy: { platform: "asc" } }),
    plannedPostsInMonth(clientId, month),
  ]);
  const items = kind ? all.filter((i) => i.kind === kind) : all;
  const monthItems = items.filter((i) => i.date.getMonth() === month.getMonth() && i.date.getFullYear() === month.getFullYear());

  // Ideas to get ahead of: inspiration start-by days still ahead.
  const ideas = inspirations
    .map((idea) => ({ idea, startBy: new Date(idea.targetDate!.getTime() - idea.leadTimeDays * DAY) }))
    .filter(({ startBy }) => startBy.getTime() >= now.getTime() - DAY)
    .sort((a, b) => a.startBy.getTime() - b.startBy.getTime());

  // The SOW minimum lives in the plan targets (weekly volume × 4, as the SOW states it per month).
  const target = planTargets.reduce((s, t) => s + t.weeklyVolume * 4, 0);
  const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(month);
  const thisMonth = month.getMonth() === now.getMonth() && month.getFullYear() === now.getFullYear();

  const list = <CalendarList items={monthItems} month={month} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={monthName}
        title="Calendar"
        actions={
          <>
            <AddPlanItemDialog />
            <AgentButton action={generateContentPlanSuggestionsAction} label="Suggest content" pendingLabel="Reading your plan…" variant="primary" />
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SegmentedNav
          label="Calendar view"
          items={[
            { label: "Month", href: href({ view: null }), active: !isList },
            { label: "List", href: href({ view: "list" }), active: isList },
          ]}
        />
        <FilterChips
          label="Show"
          items={[
            { label: "All", href: href({ show: null }), active: !kind },
            { label: "Klingit work", href: href({ show: "klingit" }), active: kind === "klingit" },
            { label: "Your plan", href: href({ show: "plan" }), active: kind === "plan" },
            { label: "Suggestions", href: href({ show: "suggestions" }), active: kind === "suggested" },
          ]}
        />
      </div>

      <PageGrid
        main={
          <Card className="overflow-hidden" aria-label={monthName}>
            <CardHeader
              title={monthName}
              action={
                <span className="flex items-center gap-1 font-brand-mono text-[12px]">
                  <Link href={href({ month: monthParam(prev) })} aria-label="Previous month" className="flex min-h-11 min-w-8 items-center justify-center text-brand-ink no-underline sm:min-h-0">
                    ‹
                  </Link>
                  <Link href={href({ month: null })} className={monoLink}>
                    TODAY
                  </Link>
                  <Link href={href({ month: monthParam(next) })} aria-label="Next month" className="flex min-h-11 min-w-8 items-center justify-center text-brand-ink no-underline sm:min-h-0">
                    ›
                  </Link>
                </span>
              }
            />
            {isList ? (
              list
            ) : (
              <>
                <div className="hidden min-[900px]:block">
                  <MonthGrid month={month} items={items} today={now} moreHref={() => href({ view: "list" })} />
                </div>
                {/* Phones and narrow windows: the month as a list. */}
                <div className="min-[900px]:hidden">{list}</div>
              </>
            )}
            <div className="border-t border-brand-line px-6 py-4">
              <KindLegend />
            </div>
          </Card>
        }
        side={
          <>
            <SectionCard
              id="suggested"
              title="Suggested by the agent"
              action={pending.length + ideas.length > 0 ? <span className="text-[12px] text-brand-ink-2">{pending.length + ideas.length} new</span> : undefined}
            >
              {pending.length === 0 && ideas.length === 0 ? (
                <CardNote>No suggestions right now. “Suggest content” asks the agent to read your plan and performance.</CardNote>
              ) : (
                <CardRows>
                  {pending.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-6 py-4">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[15px] leading-[1.4]">{s.title}</span>
                        <span className="text-[13px] leading-[1.45] text-brand-ink-2">
                          {[s.proposedDate ? formatDay(s.proposedDate) : null, s.reason ?? (s.rationale.length > 70 ? `${s.rationale.slice(0, 68)}…` : s.rationale)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <form action={approveContentPlanSuggestionAction}>
                        <input type="hidden" name="suggestionId" value={s.id} />
                        <button type="submit" className={pillClass("secondary", "sm")}>
                          Add
                        </button>
                      </form>
                      <form action={rejectContentPlanSuggestionAction}>
                        <input type="hidden" name="suggestionId" value={s.id} />
                        <button type="submit" aria-label={`Dismiss ${s.title}`} className="-mr-2 flex size-11 items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-chip sm:size-8">
                          <X className="size-4" />
                        </button>
                      </form>
                    </li>
                  ))}
                  {ideas.map(({ idea, startBy }) => (
                    <li key={idea.id} className="flex items-center gap-3 px-6 py-4">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[15px] leading-[1.4]">{idea.title}</span>
                        <span className="text-[13px] text-brand-ink-2">
                          Start by {formatDay(startBy)} · ready for {formatDay(idea.targetDate!)}
                        </span>
                      </span>
                      <InspirationExploreButton title={idea.title} description={idea.description} label="Brief now" />
                    </li>
                  ))}
                </CardRows>
              )}
              {resolved.length > 0 && (
                <details className="border-t border-brand-line">
                  <summary className="cursor-pointer px-6 py-3 font-brand-mono text-[12px] text-brand-ink">{resolved.length} HANDLED</summary>
                  <CardRows>
                    {resolved.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 px-6 py-3 text-[13px]">
                        <span className="min-w-0 flex-1 truncate">{s.title}</span>
                        {s.briefedProjectId ? (
                          <Link href={`/projects/${s.briefedProjectId}`} className="text-brand-ink underline underline-offset-4">
                            Brief
                          </Link>
                        ) : (
                          <span className="text-brand-ink-2">{s.status === "APPROVED" ? "Added" : "Dismissed"}</span>
                        )}
                      </li>
                    ))}
                  </CardRows>
                </details>
              )}
            </SectionCard>

            {target > 0 && (
              <SectionCard title="Plan coverage">
                <div className="flex flex-col gap-3 px-6 py-5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[28px] font-light leading-none tabular-nums">{planned}</span>
                    <span className="text-[15px]">
                      post{planned === 1 ? "" : "s"} planned {thisMonth ? "this month" : `in ${new Intl.DateTimeFormat("en-GB", { month: "long" }).format(month)}`}
                    </span>
                  </div>
                  <Meter value={planned} max={target} label={`${planned} of ${target} posts planned`} />
                  <span className="text-[13px] leading-[1.5] text-brand-ink-2">
                    Your SOW expects {target} a month.
                    {planned < target ? (pending.length > 0 ? " Add the suggestions to close the gap." : ` ${target - planned} to go.`) : " You're covered."}
                  </span>
                </div>
                <CardRows className="border-t border-brand-line">
                  {planTargets.map((t) => (
                    <li key={t.platform} className="flex items-baseline justify-between gap-3 px-6 py-3 text-[13px]">
                      <span>{t.platform}</span>
                      <span className="tabular-nums text-brand-ink-2">{t.weeklyVolume} a week</span>
                    </li>
                  ))}
                </CardRows>
              </SectionCard>
            )}
          </>
        }
      />
    </div>
  );
}

/** The month as dated rows: one row per day that has something, with the same colours as the grid. */
function CalendarList({ items, month }: { items: CalendarItem[]; month: Date }) {
  const days = [...new Map(items.map((i) => [new Date(i.date.getFullYear(), i.date.getMonth(), i.date.getDate()).getTime(), i.date])).values()];
  if (days.length === 0) return <CardNote>Nothing in {new Intl.DateTimeFormat("en-GB", { month: "long" }).format(month)} for this filter.</CardNote>;
  return (
    <CardRows>
      {days.map((d) => (
        <li key={d.toISOString()} className="flex gap-4 px-6 py-4">
          <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-[8px] bg-brand-chip">
            <span className="text-[11px] text-brand-ink-2">{new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(d)}</span>
            <span className="text-[16px] leading-[1.1]">{d.getDate()}</span>
          </span>
          <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-2.5 p-0">
            {items
              .filter((i) => sameDay(i.date, d))
              .map((i) => (
                <li key={i.id} className="flex min-w-0 items-start gap-2.5">
                  <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-[3px]", KIND_PILL[i.kind])} />
                  <span className="flex min-w-0 flex-col">
                    {i.post || i.href ? (
                      <ItemPill item={i} className="!whitespace-normal !rounded-none !border-0 !bg-transparent !p-0 !text-[14px] !text-brand-ink underline-offset-4 hover:underline" />
                    ) : (
                      <span className="text-[14px]">{i.title}</span>
                    )}
                    <span className="text-[12px] text-brand-ink-2">{i.sub}</span>
                  </span>
                </li>
              ))}
          </ul>
        </li>
      ))}
    </CardRows>
  );
}
