import Link from "next/link";
import type { StaffMember, User } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { loadToday } from "@/lib/today";
import { loadInline } from "@/lib/today-inline";
import type { Scope } from "@/lib/staff-scope";
import { untickTaskAction } from "@/lib/actions/today-actions";
import { cn } from "@/lib/utils";
import { TaskRow } from "@/components/ops/today/task-row";

/**
 * Today (Phase T, design PMToday): one row = one decision, grouped by project. Do now (late or due today), This
 * week, Keep an eye on, and what's done today. Mine / All PMs and client chips filter it.
 */

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Stockholm" }).format(now));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
export function duration(min: number) {
  if (min < 60) return `about ${min} min`;
  const h = Math.floor(min / 60);
  const m = Math.round((min % 60) / 5) * 5;
  return `about ${h} h${m ? ` ${m} min` : ""}`;
}

export async function TodayHome({ viewer, scope, client, kind, children }: { viewer: StaffMember & { user: User }; scope: Scope; client?: string; kind?: string; children?: React.ReactNode }) {
  const now = new Date();
  const today = await loadToday(scope, now, viewer);
  const clientIds = [...new Set(today.tasks.map((t) => t.clientId))];
  const scopeClients = await prisma.client.findMany({ where: { id: { in: scope.clientIds ?? clientIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  // ?client= narrows to one client; a kind (e.g. /ops/requests) narrows to one kind of decision.
  const tasks = today.tasks.filter((t) => (!client || t.clientId === client) && (!kind || t.kind === kind));
  const inline = await loadInline(tasks);
  const now_ = tasks.filter((t) => t.section === "now");
  const week = tasks.filter((t) => t.section === "week");
  const minutes = tasks.reduce((n, t) => n + t.minutes, 0);
  const doneCount = today.done.length;
  const total = doneCount + today.tasks.length;
  const href = (p: { scope?: string; client?: string | null }) => {
    const q = new URLSearchParams();
    const s = p.scope ?? (scope.mine ? "mine" : "all");
    q.set("scope", s);
    const c = p.client === undefined ? client : p.client;
    if (c) q.set("client", c);
    return `${kind ? "/ops/requests" : "/ops"}?${q}`;
  };
  const chip = (active: boolean) => cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] no-underline", active ? "border-brand-ink bg-brand-ink text-white" : "border-[#DCD6C8] bg-white text-brand-ink hover:border-brand-ink");
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(now).replace(",", "");

  return (
    <div className="px-4 pb-12 pt-5 min-[900px]:pb-14 min-[900px]:pl-4 min-[900px]:pr-10 min-[900px]:pt-10">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6">
        <header className="flex flex-wrap items-end gap-6">
          <div className="flex min-w-[min(100%,280px)] flex-1 flex-col gap-2">
            <span className="font-brand-mono text-[12px] uppercase text-brand-ink-2">
              {date} · {scope.mine ? `your clients: ${scopeClients.map((c) => c.name).join(", ") || "none yet"}` : "all PMs' clients"}
            </span>
            <h1 className="m-0 text-[30px] font-light leading-[1.15] tracking-[0.01em] min-[700px]:text-[36px]">
              {kind === "REQUEST" ? "Requests" : `${greeting(now)}, ${viewer.user.name.split(" ")[0]}`}
            </h1>
            <span className="text-[15px] text-brand-ink-2">
              {tasks.length === 0 ? "Nothing to do right now." : `${tasks.length} thing${tasks.length === 1 ? "" : "s"} to do, ${duration(minutes)}. ${now_.length} of them today.`}
            </span>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-[240px]" aria-label={`Done today ${doneCount} of ${total}`}>
            <span className="flex justify-between text-[13px]">
              <span>Done today</span>
              <span className="tabular-nums">
                {doneCount} of {total}
              </span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-brand-track">
              <span className="block h-full rounded-full bg-[#8D9E47]" style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
            </span>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={href({ scope: "mine", client: null })} className={chip(scope.mine)}>
            Mine
          </Link>
          <Link href={href({ scope: "all", client: null })} className={chip(!scope.mine)}>
            All PMs
          </Link>
          <span aria-hidden className="mx-1 h-6 w-px bg-brand-line" />
          <Link href={href({ client: null })} className={chip(!client)}>
            All clients
          </Link>
          {scopeClients.map((c) => (
            <Link key={c.id} href={href({ client: c.id })} className={chip(client === c.id)}>
              {c.name}
            </Link>
          ))}
          <span className="ml-auto hidden text-[12px] text-brand-ink-2 lg:inline">Grouped by project · one row = one decision</span>
        </div>

        {[
          { title: "Do now", note: "Late or due today", list: now_ },
          { title: "This week", note: "", list: week },
        ].map((s) => (
          <section key={s.title} aria-label={s.title} className="overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 flex items-baseline gap-2 border-b border-brand-line px-5 py-4 text-[18px] font-normal sm:px-6">
              {s.title}
              <span className="text-[13px] text-brand-ink-2">
                {s.note ? `${s.note} · ` : ""}
                {s.list.length}
              </span>
            </h2>
            {s.list.length === 0 ? (
              <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">{s.title === "Do now" ? "Nothing late or due today." : "Nothing else this week."}</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {s.list.map((t) => (
                  <TaskRow key={t.key} task={t} inline={inline[t.key]} />
                ))}
              </ul>
            )}
          </section>
        ))}

        {children}

        <section aria-label="Keep an eye on" className="flex flex-col gap-4 rounded-[12px] bg-white px-5 py-5 sm:px-6">
          <h2 className="m-0 flex items-baseline gap-2 text-[18px] font-normal">
            Keep an eye on <span className="text-[13px] text-brand-ink-2">Nothing to do yet. You&apos;ll get a task if something changes.</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {today.keepAnEye.map((k) => {
              const body = (
                <>
                  <span className="text-[22px] font-light">{k.title}</span>
                  <span className="text-[14px]">{k.line}</span>
                  <span className="text-[12px] text-brand-ink-2">{k.note}</span>
                </>
              );
              return k.href ? (
                <Link key={k.title + k.line} href={k.href} className="flex flex-col gap-1 rounded-[10px] bg-brand-page px-4 py-4 text-brand-ink no-underline">
                  {body}
                </Link>
              ) : (
                <div key={k.title + k.line} className="flex flex-col gap-1 rounded-[10px] bg-brand-page px-4 py-4">
                  {body}
                </div>
              );
            })}
          </div>
        </section>

        {doneCount > 0 && (
          <details className="text-[13px] text-brand-ink-2">
            <summary className="cursor-pointer list-none">
              <span className="text-[#5E6B2A]">✓</span> {doneCount} done today: {today.done.map((d) => d.label.replace(/ \([^)]*\)$/, "").replace(/^./, (c) => c.toLowerCase())).join(", ")}. <span className="underline">Show</span>
            </summary>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {today.done.map((d) => (
                <li key={d.id} className="flex items-center gap-3">
                  <span>{d.label}</span>
                  {d.how === "ticked" && (
                    <form action={untickTaskAction}>
                      <input type="hidden" name="key" value={d.taskKey} />
                      <button type="submit" className="text-[12px] underline">
                        Undo
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
