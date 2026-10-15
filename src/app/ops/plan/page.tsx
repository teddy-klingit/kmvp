import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOpsPage } from "@/lib/authz";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { PillLink } from "@/components/ds/pill-link";
import { SectionCard } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { scopeFor } from "@/lib/staff-scope";
import { loadLeadTimes, teamCreditsFor } from "@/lib/plan";
import { nudgeDraft } from "@/lib/plan-nudge";
import { sendNudgeAction } from "@/lib/actions/ops-plan-nudge-actions";
import { SendNudge } from "@/components/ops/plan/send-nudge";
import { PlanGrid } from "@/components/portal/plan/plan-grid";
import { clientPill } from "@/components/ops/client-pill";
import { jsonArray, cn } from "@/lib/utils";

const DAY = 86400000;
const WEEKS = 6;
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
const dm = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
// Calendar-day arithmetic (never + n × 24 h), so weeks stay Monday to Sunday across the clock change.
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
type State = "Not started" | "Brief in progress" | "Briefed" | "Project running";
const STATE_TONE: Record<State, string> = { "Not started": "bg-[#FBE3DF] text-[#A8321F]", "Brief in progress": "bg-[#FDEBDD] text-brand-orange-text", Briefed: "bg-[#EEF2DF] text-[#5E6B2A]", "Project running": "bg-brand-page text-brand-ink-2" };

/**
 * Plan across clients (Phase T, design PMPlan): what my clients need Klingit for in the next 6 weeks, by week, past
 * weeks hidden. Not-yet-briefed items sit in their brief-by week; briefed ones in the week they go live. Each row:
 * client and item, live date and source, brief-by, brief state, credits from the Price List, one action. Mine / All
 * PMs, Needs Klingit / Everything, and the calendar. A duplicate (same client, title and date) shows once.
 */
export default async function OpsPlanPage({ searchParams }: { searchParams: Promise<{ scope?: string; show?: string; view?: string; item?: string; sent?: string }> }) {
  const viewer = await requireOpsPage(["ADMIN", "PM"]);
  const q = await searchParams;
  const scope = await scopeFor(viewer, q.scope);
  const everything = q.show === "all";
  const now = new Date();
  const start = mondayOf(now);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const end = addDays(start, WEEKS * 7);
  const inScope = scope.clientIds ? { clientId: { in: scope.clientIds } } : {};
  const [rows, leadTimes] = await Promise.all([
    prisma.clientCalendarItem.findMany({
      where: { ...inScope, archivedAt: null, OR: [{ date: { gte: start, lt: end } }, { briefBy: { gte: start, lt: end } }] },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    }),
    loadLeadTimes(),
  ]);
  const projects = new Map((await prisma.project.findMany({ where: { id: { in: rows.flatMap((r) => (r.projectId ? [r.projectId] : [])) } }, select: { id: true, status: true, creditsQuoted: true } })).map((p) => [p.id, p]));
  const raw = rows.map((r) => ({ ...r, project: r.projectId ? (projects.get(r.projectId) ?? null) : null }));
  // A duplicate plan item (same client, title and live date) shows once; the copies are listed for staff (Phase T).
  const seen = new Map<string, (typeof raw)[number]>();
  const dupes: string[] = [];
  for (const i of raw) {
    const k = `${i.clientId}|${i.title.trim().toLowerCase()}|${iso(i.date)}`;
    if (seen.has(k)) dupes.push(`${i.client.name} ${i.title.match(/reel/i) ? "Reel" : i.title}`);
    else seen.set(k, i);
  }
  const all = [...seen.values()];
  const needs = (i: (typeof all)[number]) => i.maker !== "client" || Boolean(i.opportunityId);
  const items = everything ? all : all.filter(needs);
  const stateOf = (i: (typeof all)[number]): State => (!i.project ? (i.status === "briefed" ? "Briefed" : "Not started") : ["DRAFT", "BRIEFING"].includes(i.project.status) ? "Brief in progress" : ["ESTIMATING", "STAFFING"].includes(i.project.status) ? "Briefed" : "Project running");
  const credits = (i: (typeof all)[number]) => (i.project?.creditsQuoted != null ? { n: i.project.creditsQuoted, approx: false } : (() => { const c = teamCreditsFor(jsonArray<string>(i.formats), leadTimes); return c != null ? { n: c, approx: true } : null; })());
  const weekOf = (i: (typeof all)[number]) => mondayOf(stateOf(i) === "Not started" || stateOf(i) === "Brief in progress" ? (i.briefBy ?? i.date) : i.date);

  // The strip on top.
  const due14 = items.filter((i) => i.briefBy && i.briefBy >= new Date(now.getTime() - DAY) && i.briefBy.getTime() - now.getTime() <= 14 * DAY && ["Not started", "Brief in progress"].includes(stateOf(i)));
  const urgent = due14.filter((i) => i.briefBy!.getTime() - now.getTime() <= 2 * DAY).sort((a, b) => a.briefBy!.getTime() - b.briefBy!.getTime())[0];
  const notStarted = items.filter((i) => stateOf(i) === "Not started" && i.maker === "klingit_help");
  const planned = new Map<string, number>();
  for (const i of items.filter(needs)) {
    const c = credits(i);
    if (c) planned.set(i.client.name, (planned.get(i.client.name) ?? 0) + c.n);
  }
  const plannedTotal = [...planned.values()].reduce((a, b) => a + b, 0);

  const href = (p: Record<string, string | null>) => {
    const s = new URLSearchParams(Object.entries({ scope: scope.mine ? "mine" : "all", show: everything ? "all" : null, view: q.view ?? null, ...p }).filter((e): e is [string, string] => Boolean(e[1])));
    return `/ops/plan?${s}`;
  };
  const chip = (on: boolean) => cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] no-underline", on ? "border-brand-ink bg-brand-ink text-white" : "border-[#DCD6C8] bg-white text-brand-ink hover:border-brand-ink");
  const nudge = q.item ? all.find((i) => i.id === q.item) : null;
  const firstWeekLabel = (w: number, d: Date) => (w === 0 ? "This week · " : w === 1 ? "Next week · " : "") + `${dm(d)} – ${dm(addDays(d, 6))}`;

  return (
    <OpsPage>
      <PageHeader
        eyebrow={`What ${scope.mine ? "your" : "all"} clients need Klingit for · next ${WEEKS} weeks`}
        title="Plan"
        actions={
          <PillLink href={href({ view: q.view === "calendar" ? null : "calendar" })} variant="secondary">
            {q.view === "calendar" ? "List view" : "Calendar view"}
          </PillLink>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ scope: "mine" })} className={chip(scope.mine)}>
          Mine
        </Link>
        <Link href={href({ scope: "all" })} className={chip(!scope.mine)}>
          All PMs
        </Link>
        <span aria-hidden className="mx-1 h-6 w-px bg-brand-line" />
        <Link href={href({ show: null })} className={chip(!everything)}>
          Needs Klingit
        </Link>
        <Link href={href({ show: "all" })} className={chip(everything)}>
          Everything
        </Link>
        <span className="ml-auto text-[12px] text-brand-ink-2">Past weeks are hidden{dupes.length ? ` · ${dupes.length} duplicate${dupes.length === 1 ? "" : "s"} shown once (${dupes.join(", ")})` : ""}</span>
      </div>
      {q.sent && <p className="m-0 rounded-[10px] bg-white px-4 py-3 text-[14px]">Reminder sent.</p>}

      {nudge && (
        <SectionCard title={`Nudge ${nudge.client.name}`}>
          <form action={sendNudgeAction} className="flex flex-col gap-3 px-6 py-5">
            <input type="hidden" name="itemId" value={nudge.id} />
            <textarea name="text" rows={3} defaultValue={nudgeDraft(nudge)} className="rounded-[10px] border border-brand-outline px-3 py-2 text-[14px]" />
            <span className="flex gap-2">
              <Button type="submit" variant="primary" size="sm">
                Send reminder
              </Button>
              <Link href="/ops/plan" className="self-center text-[13px]">
                Cancel
              </Link>
            </span>
          </form>
        </SectionCard>
      )}

      <section aria-label="Summary" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { n: String(due14.length), line: "briefs due in the next 14 days", note: urgent ? `${urgent.title} is due ${urgent.briefBy! < tomorrow ? "today" : urgent.briefBy! < new Date(tomorrow.getTime() + DAY) ? "tomorrow" : day(urgent.briefBy!)}` : "None within 2 days", red: Boolean(urgent) },
          { n: String(notStarted.length), line: "not started by the client", note: notStarted.length ? "Nudges are drafted for you" : "Every brief is under way", red: false },
          { n: `≈ ${Math.round(plannedTotal)}`, line: "creative credits planned", note: [...planned.entries()].map(([c, n]) => `${c} ${Math.round(n)}`).join(" · ") || "Nothing planned yet", red: false },
        ].map((c) => (
          <div key={c.line} className="flex flex-col gap-1 rounded-[12px] bg-white px-5 py-5">
            <span className={cn("text-[28px] font-light", c.red ? "text-[#C2410C]" : "text-brand-ink")}>{c.n}</span>
            <span className="text-[14px]">{c.line}</span>
            <span className="text-[12px] text-brand-ink-2">{c.note}</span>
          </div>
        ))}
      </section>

      {q.view === "calendar" ? (
        <section className="overflow-hidden rounded-[12px] bg-white">
          <PlanGrid
            start={start.toISOString()}
            weeks={WEEKS}
            month={null}
            today={now.toISOString()}
            moments={[]}
            gaps={[]}
            entries={items.map((i) => ({ id: i.id, itemId: null, title: `${i.client.name} · ${i.title}`, date: i.date.toISOString(), endDate: i.endDate?.toISOString() ?? null, maker: i.maker as "client" | "klingit_help" | "klingit_project", briefBy: i.briefBy?.toISOString() ?? null, href: i.project ? `/ops/projects/${i.project.id}` : `/ops/clients/${i.clientId}/plan`, draggable: false, late: Boolean(i.briefBy && i.briefBy < now && !i.project) }))}
          />
        </section>
      ) : (
        Array.from({ length: WEEKS }, (_, w) => {
          const ws = addDays(start, w * 7);
          const list = items.filter((i) => weekOf(i).getTime() === ws.getTime());
          const own = all.filter((i) => !needs(i) && mondayOf(i.date).getTime() === ws.getTime()).length;
          return (
            <section key={ws.toISOString()} aria-label={firstWeekLabel(w, ws)} className="overflow-hidden rounded-[12px] bg-white">
              <h2 className="m-0 border-b border-brand-line px-6 py-4 font-brand-mono text-[12px] font-normal uppercase tracking-[0.06em]">{firstWeekLabel(w, ws)}</h2>
              {list.length === 0 ? (
                <p className="m-0 px-6 py-4 text-[14px] text-brand-ink-2">
                  Nothing that needs Klingit.{own ? ` ${own} item${own === 1 ? "" : "s"} the clients make themselves.` : ""}
                </p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {list.map((i) => {
                    const st = stateOf(i);
                    const c = credits(i);
                    const soon = i.briefBy && ["Not started", "Brief in progress"].includes(st) && i.briefBy.getTime() - now.getTime() <= 2 * DAY;
                    return (
                      <li key={i.id} className={cn("grid grid-cols-1 items-center gap-x-4 gap-y-2 border-t border-brand-line px-6 py-4 first:border-t-0 md:grid-cols-[minmax(0,1fr)_150px_140px_70px_130px]", soon && "border-l-[3px] border-l-brand-orange bg-[#FFF9F5]")}>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className={cn("rounded-full px-2 py-0.5 text-[12px]", clientPill(i.clientId))}>{i.client.name}</span>
                            <span className="text-[15px]">{i.title}</span>
                          </span>
                          <span className="text-[12px] text-brand-ink-2">
                            Live {i.endDate ? `${dm(i.date)}–${dm(i.endDate)}` : day(i.date)}
                            {i.opportunityId ? ` · from an opportunity${i.route ? `, route ${i.route}` : ""}` : i.maker === "klingit_project" ? " · Klingit project" : i.maker === "client" ? " · the client makes it" : ""}
                          </span>
                        </span>
                        <span className={cn("justify-self-start rounded-[6px] px-2 py-0.5 text-[12px]", soon ? "bg-[#FDEBDD] text-brand-orange-text" : "bg-brand-page text-brand-ink-2")}>
                          {st === "Not started" || st === "Brief in progress" ? (i.briefBy ? `Brief by ${day(i.briefBy)}` : "No brief-by date") : `Briefed${i.project ? "" : ""}`}
                        </span>
                        <span className={cn("justify-self-start rounded-[6px] px-2 py-0.5 text-[12px]", STATE_TONE[st])}>{st}</span>
                        <span className="text-[13px] tabular-nums text-brand-ink-2">{c ? `${c.approx ? "≈ " : ""}${Math.round(c.n)} cr` : "–"}</span>
                        <span className="justify-self-start md:justify-self-end">
                          {st === "Not started" && i.maker !== "client" ? (
                            <SendNudge itemId={i.id} draft={nudgeDraft(i)} label={`Nudge about ${i.title} (${i.client.name})`} clientId={i.clientId} primary={Boolean(soon)} />
                          ) : st === "Brief in progress" && i.project ? (
                            <PillLink href={`/ops/projects/${i.project.id}#brief`} variant="secondary">
                              Open brief
                            </PillLink>
                          ) : i.project ? (
                            <PillLink href={`/ops/projects/${i.project.id}`} variant="secondary">
                              Open project
                            </PillLink>
                          ) : (
                            <PillLink href={`/ops/clients/${i.clientId}/plan`} variant="secondary">
                              Open plan
                            </PillLink>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })
      )}
      <p className="m-0 text-[12px] text-brand-ink-2">Credits are estimates from the Price List (placeholders), or the project&apos;s estimate once there is one.</p>
    </OpsPage>
  );
}
