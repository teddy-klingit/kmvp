import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { WORK_TZ } from "@/lib/working-hours";
import { addWorkingDays, briefByFor, coverageThisMonth, daysUntil, loadLeadTimes, loadPlan, mondayOf, needsBrief, STATUS_LABEL, type Maker, type PlanStatus } from "@/lib/plan";
import { archivePlanItemAction, setPlanStatusAction, startPlanBriefAction } from "@/lib/actions/plan-item-actions";
import { pillClass } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { PlanGrid, MAKER_CHIP, type GridEntry } from "@/components/portal/plan/plan-grid";
import { AddToPlan } from "@/components/portal/plan/add-to-plan";
import { cn } from "@/lib/utils";

const DAY = 86400000;
const VIEWS = [
  { key: "month", label: "Month" },
  { key: "5w", label: "5 weeks" },
  { key: "list", label: "List" },
] as const;
const FILTERS = [
  { key: "all", label: "All" },
  { key: "client", label: "You make it" },
  { key: "klingit_help", label: "Klingit helps" },
  { key: "klingit_project", label: "Klingit projects" },
  { key: "moments", label: "Key moments" },
] as const;
const short = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(d);
const wday = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, weekday: "short", day: "numeric", month: "short" }).format(d);
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDay = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T10:00:00`) : null);

/**
 * Plan → Calendar (Phase R, design 04): 5 weeks by default (or a month, or a list), every item with its owner,
 * brief-due markers, campaign bars, key moments and gap warnings; on the side what needs a brief soon and this
 * month's coverage against the agreement. Drag an item to move it; Add to plan is idempotent.
 */
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ view?: string; show?: string; start?: string; item?: string; title?: string; date?: string; channels?: string; formats?: string; maker?: string; notes?: string }> }) {
  const q = await searchParams;
  const viewer = await getPortalViewer();
  const now = new Date();
  const view = VIEWS.find((v) => v.key === q.view)?.key ?? "5w";
  const show = FILTERS.find((f) => f.key === q.show)?.key ?? "all";
  // On a Sunday this week is over: start from tomorrow's.
  const anchor = parseDay(q.start) ?? (now.getDay() === 0 ? new Date(now.getTime() + DAY) : now);

  let from: Date, weeks: number, month: number | null;
  if (view === "month") {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    from = mondayOf(first);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    weeks = Math.ceil((last.getTime() - from.getTime()) / DAY / 7 + 1 / 7);
    month = anchor.getMonth();
  } else {
    from = mondayOf(anchor);
    weeks = view === "list" ? 8 : 5;
    month = null;
  }
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + weeks * 7);
  const [plan, soon, coverage, leadTimes, projects, detail] = await Promise.all([
    loadPlan(viewer.clientId, viewer, from, to, now),
    needsBrief(viewer.clientId, 21, now),
    coverageThisMonth(viewer.clientId, viewer, now),
    loadLeadTimes(),
    prisma.project.findMany({ where: { clientId: viewer.clientId, status: { notIn: ["ARCHIVED", "DELIVERED", "DRAFT"] }, agentBuild: false }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, name: true } }),
    q.item ? prisma.clientCalendarItem.findFirst({ where: { id: q.item, clientId: viewer.clientId, archivedAt: null } }) : null,
  ]);
  const keep = (extra: Record<string, string | null>) => {
    const s = new URLSearchParams(Object.entries({ view: q.view, show: q.show, start: q.start }).filter((e): e is [string, string] => Boolean(e[1])));
    for (const [k, v] of Object.entries(extra)) (v ? s.set(k, v) : s.delete(k));
    return `/plan${s.size ? `?${s}` : ""}`;
  };
  const visible = plan.entries.filter((e) => (show === "all" ? true : show === "moments" ? false : e.maker === (show as Maker)));
  const grid: GridEntry[] = visible.map((e) => ({ id: e.id, itemId: e.itemId, title: e.title, date: e.date.toISOString(), endDate: e.endDate?.toISOString() ?? null, maker: e.maker, briefBy: e.maker === "klingit_help" && !e.href && e.briefBy ? e.briefBy.toISOString() : null, href: e.itemId ? keep({ item: e.itemId }) : (e.href ?? "#"), draggable: e.draggable, late: Boolean(e.briefBy && daysUntil(e.briefBy, now) <= 0) }));
  const step = view === "month" ? { prev: new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1), next: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) } : { prev: new Date(from.getTime() - 7 * DAY), next: new Date(from.getTime() + 7 * DAY) };
  const lastDay = new Date(to.getTime() - DAY);
  const title = view === "month" ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(anchor) : `${short(from)} – ${short(lastDay)}`;
  const shortest = leadTimes.reduce((m, l) => Math.min(m, l.workingDays), 99);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="View" className="flex rounded-full bg-[var(--seg-track)] p-1">
          {VIEWS.map((v) => (
            <Link key={v.key} href={keep({ view: v.key === "5w" ? null : v.key })} aria-current={view === v.key ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-[14px] no-underline", view === v.key ? "bg-brand-ink text-white" : "text-brand-ink hover:bg-black/5")}>
              {v.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link key={f.key} href={keep({ show: f.key === "all" ? null : f.key })} aria-current={show === f.key ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[14px] no-underline", show === f.key ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white text-brand-ink hover:border-brand-ink")}>
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="Calendar" className="overflow-hidden rounded-[12px] bg-white">
            <div className="flex items-center gap-3 border-b border-brand-line px-5 py-4">
              <h2 className="m-0 flex-1 text-[20px] font-normal">{title}</h2>
              <Link href={keep({ start: isoDay(step.prev) })} aria-label="Earlier" className="px-2 text-brand-ink no-underline">
                ‹
              </Link>
              <Link href={keep({ start: null })} className="font-brand-mono text-[12px] text-brand-ink underline underline-offset-4">
                TODAY
              </Link>
              <Link href={keep({ start: isoDay(step.next) })} aria-label="Later" className="px-2 text-brand-ink no-underline">
                ›
              </Link>
            </div>
            {view === "list" ? (
              <ListView entries={visible} moments={show === "all" || show === "moments" ? plan.moments : []} keep={keep} now={now} />
            ) : (
              <PlanGrid start={from.toISOString()} weeks={weeks} month={month} entries={grid} moments={show === "all" || show === "moments" ? plan.moments.map((m) => ({ id: m.id, date: m.date.toISOString(), name: m.name })) : []} gaps={show === "all" || show === "client" ? plan.gaps.map((g) => ({ ...g, weekStart: g.weekStart.toISOString() })) : []} today={now.toISOString()} />
            )}
          </section>
          <p className="m-0 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-brand-ink-2">
            <Legend cls={MAKER_CHIP.client} text="You make it" />
            <Legend cls={MAKER_CHIP.klingit_help} text="Klingit's help needed" />
            <Legend cls={MAKER_CHIP.klingit_project} text="Klingit project" />
            <span className="flex items-center gap-1.5 text-brand-orange-text">⚠ Brief due</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[#B455B6]">Aa</span> Key moment
            </span>
            <span className="text-brand-mute">Drag an item to move it.</span>
          </p>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          {detail && <ItemCard item={detail} keep={keep} leadTimes={leadTimes} now={now} />}
          <section aria-label="Needs a brief soon" className="overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[18px] font-normal">Needs a brief soon</h2>
            {soon.length === 0 ? (
              <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">Nothing Klingit helps with needs a brief in the next three weeks.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {soon.slice(0, 4).map(({ item, daysLeft, late }) => {
                  const urgent = daysLeft <= 7;
                  const formats = jsonArray<string>(item.formats);
                  const channels = jsonArray<string>(item.channels);
                  return (
                    <li key={item.id} className={cn("flex flex-col gap-2 border-b border-brand-line px-6 py-4 last:border-b-0", urgent && "bg-brand-peach-pale")}>
                      <span className="flex items-baseline gap-2">
                        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", urgent ? "bg-brand-orange" : "bg-brand-outline")} />
                        <span className="flex-1 text-[15px]">{item.title}</span>
                        <span className="font-brand-mono text-[11px] text-brand-ink">{late ? "LATE" : daysLeft === 0 ? "TODAY" : `${daysLeft} DAY${daysLeft === 1 ? "" : "S"}`}</span>
                      </span>
                      <span className="text-[13px] text-brand-ink-2">{[formats.join(" + "), channels.join(" + "), `live ${wday(item.date)}`].filter(Boolean).join(" · ")}</span>
                      {late ? (
                        <span className="text-[13px]">
                          <b className="font-semibold">Late, talk to Klingit.</b> The earliest Klingit can make it is about {wday(addWorkingDays(now, briefByFor(item.date, formats, leadTimes).days))}: move the live date, or ask.
                        </span>
                      ) : null}
                      <span className="flex items-center gap-3">
                        <b className="flex-1 text-[14px] font-semibold">Brief by {wday(item.briefBy!)}</b>
                        <form action={startPlanBriefAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <button type="submit" className={pillClass(urgent ? "primary" : "secondary", "sm")}>
                            Start brief
                          </button>
                        </form>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="m-0 flex items-center gap-3 border-t border-brand-line px-6 py-3.5 text-[12px] text-brand-ink-2">
              <span className="flex-1">Brief-by = live date minus usual lead time per format ({shortest}–{leadTimes.reduce((m, l) => Math.max(m, l.workingDays), 0)} working days)</span>
              <PlaceholderTag>Lead times</PlaceholderTag>
            </p>
          </section>

          <section aria-label="Coverage this month" className="overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[18px] font-normal">Coverage this month</h2>
            {coverage.length === 0 ? (
              <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">No posting agreement with Klingit yet.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {coverage.map((c) => (
                  <li key={c.channel} className="flex items-center gap-4 border-b border-brand-line px-6 py-3.5 text-[14px]">
                    <span className="w-24 shrink-0">{c.channel}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-track">
                      <span className={cn("block h-full rounded-full", c.planned >= c.agreed ? "bg-[#8D9E47]" : "bg-brand-orange")} style={{ width: `${Math.min(100, (c.planned / Math.max(1, c.agreed)) * 100)}%` }} />
                    </span>
                    <span className="w-14 text-right tabular-nums">
                      {c.planned} of {c.agreed}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="m-0 px-6 py-3 text-[12px] text-brand-ink-2">Against your agreement with Klingit</p>
          </section>
        </aside>
      </div>
      <Suspense>
        <AddToPlan leadTimes={leadTimes.map((l) => ({ format: l.format, workingDays: l.workingDays, teamCredits: l.teamCredits }))} projects={projects}
          prefill={{
            title: q.title,
            date: parseDay(q.date) ? q.date : undefined,
            channels: q.channels?.split(",").filter(Boolean),
            formats: q.formats?.split(",").filter((f) => leadTimes.some((l) => l.format === f)),
            maker: (["client", "klingit_help", "klingit_project"] as const).find((m) => m === q.maker),
            notes: q.notes,
          }}
        />
      </Suspense>
    </>
  );
}

function Legend({ cls, text }: { cls: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={cn("inline-block size-3 rounded-[3px]", cls)} />
      {text}
    </span>
  );
}

function ListView({ entries, moments, keep, now }: { entries: Awaited<ReturnType<typeof loadPlan>>["entries"]; moments: Awaited<ReturnType<typeof loadPlan>>["moments"]; keep: (x: Record<string, string | null>) => string; now: Date }) {
  const rows = [...entries.map((e) => ({ at: e.date, e, m: null })), ...moments.map((m) => ({ at: m.date, e: null, m }))].sort((a, b) => a.at.getTime() - b.at.getTime());
  if (!rows.length) return <p className="m-0 px-5 py-5 text-[14px] text-brand-ink-2">Nothing planned in these weeks.</p>;
  return (
    <ul className="m-0 list-none p-0">
      {rows.map((r, i) =>
        r.e ? (
          <li key={r.e.id} className="flex flex-wrap items-center gap-3 border-b border-brand-line px-5 py-3 text-[14px]">
            <span className="w-28 shrink-0 text-brand-ink-2">{wday(r.e.date)}</span>
            <span aria-hidden className={cn("size-3 shrink-0 rounded-[3px]", MAKER_CHIP[r.e.maker])} />
            <Link href={r.e.itemId ? keep({ item: r.e.itemId }) : (r.e.href ?? "#")} className="min-w-0 flex-1 truncate text-brand-ink no-underline hover:underline">
              {r.e.title}
            </Link>
            <span className="text-[13px] text-brand-ink-2">{STATUS_LABEL[r.e.status as PlanStatus]}</span>
            {r.e.briefBy && r.e.maker === "klingit_help" && !r.e.href && <span className={cn("text-[13px]", daysUntil(r.e.briefBy, now) <= 7 ? "text-brand-orange-text" : "text-brand-ink-2")}>Brief by {wday(r.e.briefBy)}</span>}
          </li>
        ) : (
          <li key={`m-${r.m!.id}-${i}`} className="flex items-center gap-3 border-b border-brand-line px-5 py-2.5 text-[13px] text-[#B455B6]">
            <span className="w-28 shrink-0">{wday(r.m!.date)}</span>
            {r.m!.name} · {r.m!.markets.join(", ")}
          </li>
        )
      )}
    </ul>
  );
}

function ItemCard({ item, keep, leadTimes, now }: { item: NonNullable<Awaited<ReturnType<typeof prisma.clientCalendarItem.findFirst>>>; keep: (x: Record<string, string | null>) => string; leadTimes: { format: string; workingDays: number }[]; now: Date }) {
  const formats = jsonArray<string>(item.formats);
  const channels = jsonArray<string>(item.channels);
  const maker = item.maker as Maker;
  return (
    <section aria-label={item.title} className="flex flex-col gap-3 rounded-[12px] bg-white px-6 py-5">
      <span className="flex items-start gap-2">
        <span className={cn("mt-1 size-3 shrink-0 rounded-[3px]", MAKER_CHIP[maker])} />
        <span className="flex-1 text-[17px]">{item.title}</span>
        <Link href={keep({ item: null })} aria-label="Close" className="text-brand-ink-2 no-underline">
          ×
        </Link>
      </span>
      <span className="text-[13px] text-brand-ink-2">
        {[`Live ${wday(item.date)}${item.endDate ? ` – ${wday(item.endDate)}` : ""}`, channels.join(" + "), formats.join(" + ")].filter(Boolean).join(" · ")}
      </span>
      {maker === "klingit_help" && item.briefBy && !item.projectId && (
        <span className={cn("text-[14px]", daysUntil(item.briefBy, now) <= 7 && "text-brand-orange-text")}>
          Brief by {wday(item.briefBy)} · {briefByFor(item.date, formats, leadTimes).days} working days
        </span>
      )}
      {item.notes && <p className="m-0 text-[14px] leading-[1.5]">{item.notes}</p>}
      {item.publishedAssetId && (
        <Link href={`/library/${item.publishedAssetId}`} className="self-start text-[14px] text-brand-ink underline underline-offset-4">
          See it in the Output library
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {item.projectId ? (
          <Link href={`/projects/${item.projectId}`} className={pillClass("primary", "sm")}>
            Open project
          </Link>
        ) : (
          maker !== "klingit_project" && (
            <form action={startPlanBriefAction}>
              <input type="hidden" name="itemId" value={item.id} />
              <button type="submit" className={pillClass(maker === "klingit_help" ? "primary" : "secondary", "sm")}>
                {maker === "klingit_help" ? "Start brief" : "Ask Klingit to make it"}
              </button>
            </form>
          )
        )}
        {!item.projectId && (
          <form action={setPlanStatusAction} className="flex items-center gap-1">
            <input type="hidden" name="itemId" value={item.id} />
            <select name="status" defaultValue={item.status} aria-label="Status" className="h-8 rounded-full border border-brand-outline bg-white px-2 text-[13px]">
              {(["idea", "planned", "published"] as const).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <button type="submit" className="text-[13px] underline underline-offset-2">
              Set
            </button>
          </form>
        )}
        <form action={archivePlanItemAction}>
          <input type="hidden" name="itemId" value={item.id} />
          <button type="submit" className="text-[13px] text-ds-danger-text underline underline-offset-2">
            Remove
          </button>
        </form>
      </div>
    </section>
  );
}
