import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NeedsYouChips } from "@/components/ops/needs-you-chips";
import { Card, CardHeader } from "@/components/ds/card";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { EmptyState } from "@/components/ds/empty-state";
import { loadOpsProjects, projectHealth, rankExceptions, type OpsException, type OpsProject } from "@/lib/ops-exceptions";
import { nextAutomatedStep } from "@/lib/autopilot";
import { INTERNAL_STAGE_PILL } from "@/lib/ops-cockpit";
import { formatDay } from "@/lib/project-state";
import { WORK_TZ } from "@/lib/working-hours";
import { CheckCircle2 } from "lucide-react";
import type { StaffMember, User } from "@/generated/prisma";

const EXCEPTION_TONE: Record<OpsException["tone"], { tile: string; pill: PillTone }> = {
  danger: { tile: "bg-ds-danger-tint text-ds-danger-text", pill: "danger" },
  turn: { tile: "bg-ds-turn-tint text-ds-turn-text", pill: "turn" },
  neutral: { tile: "bg-ds-subtle text-ds-text-body", pill: "neutral" },
};

const HEALTH_TONE = { success: "success", watch: "watch", danger: "danger" } as const;

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** When the next automated step happens, in words a PM can scan. */
function when(p: OpsProject) {
  const { project, state } = p;
  if (!project.autopilot && ["BRIEFING", "ESTIMATING", "STAFFING"].includes(project.status)) return "When you act";
  switch (state.stage) {
    case "briefing":
      return "When the client answers";
    case "estimating":
    case "staffing":
      return "Next check";
    case "awaiting_approval":
      return "On approval";
    case "production":
      return state.keyFacts.firstDraftEta ? formatDay(state.keyFacts.firstDraftEta) : "After staffing";
    default:
      return project.dueDate ? formatDay(project.dueDate) : "When the client replies";
  }
}

export async function NeedsYouHome({ viewer, inboxCount }: { viewer: StaffMember & { user: User }; inboxCount: number }) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfDay);
  endOfWeek.setDate(endOfWeek.getDate() + ((7 - endOfWeek.getDay()) % 7) + 1);

  const [projects, runsToday, overriddenToday] = await Promise.all([
    loadOpsProjects({}, now),
    prisma.agentRun.count({ where: { createdAt: { gte: startOfDay }, projectId: { not: null } } }),
    prisma.agentRun.count({ where: { createdAt: { gte: startOfDay }, projectId: { not: null }, overridden: true } }),
  ]);
  const needs = rankExceptions(projects);
  const running = projects.filter((p) => p.exceptions.length === 0);
  const draftsThisWeek = projects.filter((p) => {
    const eta = p.state.keyFacts.firstDraftEta;
    return p.state.stage === "production" && eta && eta >= startOfDay && eta < endOfWeek;
  }).length;

  const first = viewer.user.name.split(" ")[0];
  const tiles = [
    { label: "Needs you", value: String(needs.length), turn: needs.length > 0 },
    { label: "Running automatically", value: String(running.length) },
    { label: "First drafts due this week", value: String(draftsThisWeek) },
    { label: "Agent decisions today", value: String(runsToday), extra: overriddenToday > 0 ? `· ${overriddenToday} overridden` : undefined },
  ];

  return (
    <div className="px-4 pb-12 pt-5 min-[900px]:pb-14 min-[900px]:pl-4 min-[900px]:pr-10 min-[900px]:pt-10">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6">
        <header className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-[min(100%,280px)] flex-1 flex-col gap-2">
            <span className="font-brand-mono text-[12px] uppercase text-brand-ink-2">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(now).replace(",", "")}</span>
            <h1 className="m-0 text-[30px] font-light leading-[1.15] tracking-[0.01em] text-ds-text min-[700px]:text-[36px]">
              {greeting(now)}, {first}
            </h1>
            <span className="text-[14px] text-ds-text-2">
              {needs.length === 0 ? "Nothing needs you right now." : `${plural(needs.length, "thing")} need${needs.length === 1 ? "s" : ""} you.`}{" "}
              {plural(running.length, "project")} {running.length === 1 ? "is" : "are"} running on {running.length === 1 ? "its" : "their"} own.
            </span>
          </div>
          <form action="/ops/projects" className="w-full sm:w-auto">
            <label htmlFor="ops-search" className="sr-only">
              Search
            </label>
            <input
              id="ops-search"
              type="search"
              name="q"
              placeholder="Search projects, clients, people"
              className="h-11 w-full rounded-full border border-brand-rule bg-white px-[18px] text-[14px] outline-none placeholder:text-brand-ink-2 focus:border-brand-ink sm:w-[300px]"
            />
          </form>
        </header>

        <NeedsYouChips active="needs" needs={needs.length} inbox={inboxCount} />

        <section aria-label="Summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((t) => (
            <Card key={t.label} as="div" className="flex flex-col gap-1 px-5 py-4">
              <span className="text-[12px] text-ds-text-2">{t.label}</span>
              <span className={`text-[28px] font-light tabular-nums leading-[1.15] ${t.turn ? "text-ds-turn-strong" : "text-ds-text"}`}>
                {t.value}
                {t.extra && <span className="ml-1 text-[13px] font-medium text-ds-text-2">{t.extra}</span>}
              </span>
            </Card>
          ))}
        </section>

        <Card aria-label="Needs you" className="overflow-hidden">
          <CardHeader
            title="Needs you"
            meta={needs.length > 0 ? <StatusPill tone="turn">{needs.length} open</StatusPill> : undefined}
            action={<span className="text-[12px] text-ds-text-2">Sorted by urgency</span>}
          />
          {needs.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="All clear" description="Every project is running on its own. You'll see exceptions here." />
          ) : (
            <ul className="m-0 list-none p-0">
              {needs.map((n, i) => {
                const tone = EXCEPTION_TONE[n.tone];
                return (
                  <li key={n.id} className={`flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:gap-4 ${i > 0 ? "border-t border-ds-divider" : ""}`}>
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-[10px] text-[12px] font-semibold ${tone.tile}`}>{n.kindShort}</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold text-ds-text">{n.title}</span>
                        <StatusPill tone={tone.pill}>{n.kindLabel}</StatusPill>
                      </div>
                      <span className="text-[14px] text-ds-text-2">{n.detail}</span>
                      <span className="text-[12px] text-ds-text-3">
                        {n.clientName} · {n.projectName} · waiting {n.waiting}
                      </span>
                    </div>
                    <Button asChild variant="primary" size="md">
                      <Link href={n.action.href}>{n.action.label}</Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card aria-label="Running automatically" className="overflow-hidden">
          <CardHeader
            title="Running automatically"
            meta={<StatusPill>{running.length}</StatusPill>}
            action={<span className="hidden text-[12px] text-ds-text-2 sm:inline">You&apos;ll only hear about these if something goes off track</span>}
          />
          {running.length === 0 ? (
            <EmptyState title="Nothing running on its own yet" description="Projects without exceptions show up here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] text-ds-text-2">
                    <th scope="col" className="px-6 py-2.5 font-medium">Project</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Stage</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Next automated step</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">When</th>
                    <th scope="col" className="px-6 py-2.5 text-right font-medium">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {running.map((p) => {
                    const health = projectHealth(p);
                    return (
                      <tr key={p.project.id} className="border-t border-ds-divider">
                        <td className="px-6 py-3.5">
                          <div className="flex flex-col">
                            <Link href={`/ops/projects/${p.project.id}`} className="font-medium text-ds-text no-underline hover:underline">
                              {p.project.name}
                            </Link>
                            <span className="text-[12px] text-ds-text-2">{p.project.client.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <StatusPill>{INTERNAL_STAGE_PILL[p.state.stage]}</StatusPill>
                        </td>
                        <td className="px-3 py-3.5 text-ds-text-body">
                          {nextAutomatedStep({ status: p.project.status, autopilot: p.project.autopilot, estimateStatus: p.project.estimate?.status ?? null })}
                        </td>
                        <td className="px-3 py-3.5 tabular-nums text-ds-text-2">{when(p)}</td>
                        <td className="px-6 py-3.5 text-right">
                          <StatusPill tone={HEALTH_TONE[health.tone]}>{health.label}</StatusPill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
