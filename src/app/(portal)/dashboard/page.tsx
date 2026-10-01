import Link from "next/link";
import { ArrowRight, CircleCheck, FolderKanban, Images, Megaphone, MessageSquareText, Newspaper, ReceiptText, TrendingDown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { loadProjectStates } from "@/lib/project-state-loader";
import { creditSummary, inProgress, marketThisWeek, nextSevenDays, yourTurn, type TurnItem } from "@/lib/client-home";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";
import { WORK_TZ } from "@/lib/working-hours";
import { Card, CardHeader } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { Avatar, AvatarStack } from "@/components/ds/avatar";
import { EmptyState } from "@/components/ds/empty-state";
import { HomeBriefInput } from "@/components/portal/home/home-brief-input";
import { cn } from "@/lib/utils";

const YOUR_TURN_MAX = 5;

const TURN_ICON: Record<TurnItem["kind"], typeof Images> = {
  review: Images,
  approve: ReceiptText,
  brief: MessageSquareText,
  signoff: CircleCheck,
  other: ArrowRight,
};

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function typeLabel(t: string) {
  return PROJECT_TYPE_LABEL[t]?.split(" / ")[0] ?? t;
}

/**
 * Client home (ClientHome.dc.html). Counts and "Your turn" come only from getProjectState —
 * market alerts and notifications never count as something the client owes.
 */
export default async function DashboardPage() {
  const viewer = await getPortalViewer();
  const now = new Date();
  const items = await loadProjectStates({ status: { not: "ARCHIVED" }, ...projectVisibilityWhere(viewer.id) }, viewer.clientId, { dueDate: "asc" });
  const client = await prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId }, include: { accountLead: { include: { user: true } } } });
  const lead = client.accountLead?.user.name ?? null;

  const [credits, upcoming, market] = await Promise.all([creditSummary(viewer.clientId, now), nextSevenDays(viewer.clientId, items, now), marketThisWeek(viewer.clientId, now)]);
  const turns = yourTurn(items, now);
  const progress = inProgress(items, typeLabel, lead);
  // Message goes to the conversation of the project that needs them most, else the latest active one.
  const messageProject = turns[0]?.id ?? progress[0]?.id ?? null;

  const summary = [
    plural(turns.length, "thing") + ` need${turns.length === 1 ? "s" : ""} you`,
    `${plural(progress.length, "project")} in progress`,
    ...(credits.free !== null ? [`${plural(credits.free, "credit")} left this month`] : []),
  ].join(" · ");

  const sections = {
    turn: (
      <Card aria-label="Your turn" className="overflow-hidden" data-list="your-turn">
        <CardHeader
          title="Your turn"
          meta={turns.length > 0 ? <StatusPill tone="turn">{turns.length}</StatusPill> : undefined}
          action={turns.length > 0 ? <span className="text-[12px] text-ds-text-2">Projects wait on these</span> : undefined}
        />
        {turns.length === 0 ? (
          <EmptyState icon={CircleCheck} title="Nothing needs you" description="Klingit is on everything. You'll see it here when something needs your input." />
        ) : (
          <ul className="m-0 list-none p-0">
            {turns.slice(0, YOUR_TURN_MAX).map((t, i) => {
              const Icon = TURN_ICON[t.kind];
              return (
                <li key={t.id} className={cn("flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:gap-4", i > 0 && "border-t border-ds-divider")}>
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-ds-turn-tint text-ds-turn-strong">
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold text-ds-text">{t.title}</span>
                        {t.due && <StatusPill tone={t.due.tone}>{t.due.label}</StatusPill>}
                      </div>
                      <span className="line-clamp-2 text-[14px] text-ds-text-2 sm:line-clamp-1" title={t.context}>{t.context}</span>
                    </div>
                  </div>
                  <Button asChild variant={i === 0 ? "primary" : "secondary"} size="md">
                    <Link href={t.href}>{t.cta}</Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {turns.length > YOUR_TURN_MAX && (
          <div className="border-t border-ds-divider px-6 py-3 text-[13px] text-ds-text-2">
            +{turns.length - YOUR_TURN_MAX} more on{" "}
            <Link href="/projects" className="font-medium text-ds-text">
              Projects
            </Link>
          </div>
        )}
      </Card>
    ),
    progress: (
      <Card aria-label="In progress" className="overflow-hidden">
        <CardHeader
          title="In progress"
          meta={<StatusPill>{progress.length}</StatusPill>}
          action={
            <Link href="/projects" className="text-[13px] font-medium text-ds-text no-underline hover:underline">
              All projects
            </Link>
          }
        />
        {progress.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No projects yet" description="Tell us what you need above and Klingit takes it from there." />
        ) : (
          <ul className="m-0 list-none p-0">
            {progress.map((p, i) => (
              <li key={p.id} className={cn(i > 0 && "border-t border-ds-divider")}>
                <Link
                  href={`/projects/${p.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-6 py-4 text-ds-text no-underline hover:bg-ds-subtle-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_96px] sm:gap-x-6"
                >
                  <div className="col-start-1 row-start-1 flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[14px] font-semibold">{p.name}</span>
                    <span className="text-[12px] text-ds-text-2">{p.meta}</span>
                  </div>
                  <div className="col-span-2 flex flex-col gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                    <div className="grid grid-cols-5 gap-1" role="img" aria-label={`Step ${p.steps.indexOf("current") + 1} of 5`}>
                      {p.steps.map((s, j) => (
                        <span key={j} className={cn("h-1 rounded-full", s === "done" ? "bg-ds-text" : s === "current" ? "bg-ds-turn" : "bg-ds-border")} />
                      ))}
                    </div>
                    <span className="text-[12px] text-ds-text-body">{p.next}</span>
                  </div>
                  <div className="col-start-2 row-start-1 flex justify-end sm:col-start-3">{p.team.length > 0 && <AvatarStack names={p.team} size={28} max={3} />}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    market: (
      <Card aria-label="This week in your market" className="overflow-hidden">
        <CardHeader
          title="This week in your market"
          action={
            <Link href="/insights" className="text-[13px] font-medium text-ds-text no-underline hover:underline">
              Open Insights
            </Link>
          }
        />
        {market.length === 0 ? (
          <EmptyState icon={Newspaper} title="Quiet week" description="No performance drops or competitor launches in the last 7 days." />
        ) : (
          <ul className="m-0 list-none p-0">
            {market.map((m, i) => {
              const Icon = m.key === "performance" ? TrendingDown : m.key === "competitor" ? Megaphone : Newspaper;
              return (
                <li key={m.key} className={cn("flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:gap-4", i > 0 && "border-t border-ds-divider")}>
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[10px]", m.key === "performance" ? "bg-ds-danger-tint text-ds-danger-text" : "bg-ds-subtle text-ds-text-body")}>
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[14px] font-semibold text-ds-text">{m.title}</span>
                      <span className="line-clamp-2 text-[14px] text-ds-text-2">{m.detail}</span>
                    </div>
                  </div>
                  <Button asChild variant={m.action.primary ? "secondary" : "ghost"} size="md">
                    <Link href={m.action.href}>{m.action.label}</Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    ),
    credits: (
      <Card aria-label="Credits" className="flex flex-col gap-3.5 px-6 py-5">
        <div className="flex items-center">
          <h2 className="m-0 flex-1 text-[15px] font-semibold text-ds-text">Credits · {credits.month}</h2>
          <Link href="/account/billing" className="text-[13px] font-medium text-ds-text no-underline hover:underline">
            Details
          </Link>
        </div>
        {credits.available !== null && credits.free !== null ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-semibold tabular-nums tracking-[-0.02em] text-ds-text">{credits.free}</span>
              <span className="text-[14px] text-ds-text-2">of {credits.available} left</span>
            </div>
            <div
              role="img"
              aria-label={`${credits.used + credits.awaiting} of ${credits.available} credits used or committed`}
              className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-ds-divider"
            >
              <span className="bg-ds-text" style={{ width: `${Math.min(100, (credits.used / credits.available) * 100)}%` }} />
              <span className="bg-ds-credit-pending" style={{ width: `${Math.min(100, (credits.awaiting / credits.available) * 100)}%` }} />
            </div>
            <div className="flex flex-wrap gap-4 text-[12px] text-ds-text-body">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-[2px] bg-ds-text" />
                Used {credits.used}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-[2px] bg-ds-credit-pending" />
                Awaiting approval {credits.awaiting}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-[2px] border border-ds-control-border bg-ds-divider" />
                Free {credits.free}
              </span>
            </div>
            {credits.used + credits.awaiting > credits.available && (
              <p className="m-0 text-[12px] text-ds-watch-text">
                {credits.used + credits.awaiting - credits.available} credits over this month&apos;s allowance if you approve everything.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-semibold tabular-nums tracking-[-0.02em] text-ds-text">{credits.used}</span>
              <span className="text-[14px] text-ds-text-2">used this month</span>
            </div>
            <p className="m-0 text-[13px] text-ds-text-2">There&apos;s no monthly allowance on your account, so there&apos;s nothing to count down from.</p>
          </>
        )}
      </Card>
    ),
    upcoming: (
      <Card aria-label="Next 7 days" className="overflow-hidden">
        <CardHeader title="Next 7 days" />
        {upcoming.length === 0 ? (
          <p className="m-0 px-6 py-4 text-[14px] text-ds-text-2">Nothing scheduled for the next 7 days.</p>
        ) : (
          <ol className="m-0 list-none py-2">
            {upcoming.map((u) => {
              const body = (
                <>
                  <div className="flex w-10 shrink-0 flex-col items-center rounded-[8px] bg-ds-bg py-1">
                    <span className="text-[11px] font-semibold uppercase text-ds-text-2">{new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(u.at)}</span>
                    <span className="text-[15px] font-semibold tabular-nums text-ds-text">{u.at.getDate()}</span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[14px] font-medium text-ds-text">{u.title}</span>
                    <span className="text-[12px] text-ds-text-2">{u.sub}</span>
                  </div>
                </>
              );
              return (
                <li key={u.id}>
                  {u.href ? (
                    <Link href={u.href} className="flex items-start gap-3.5 px-6 py-2.5 text-ds-text no-underline hover:bg-ds-subtle-2">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3.5 px-6 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    ),
    lead: lead ? (
      <Card aria-label="Account team" className="flex items-center gap-3 px-6 py-5">
        <Avatar name={lead} size={40} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-semibold text-ds-text">{lead}</span>
          <span className="text-[12px] text-ds-text-2">Your account lead</span>
        </div>
        {messageProject && (
          <Button asChild variant="secondary" size="md">
            <Link href={`/projects/${messageProject}?channel=klingit`}>Message</Link>
          </Button>
        )}
      </Card>
    ) : null,
  };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="m-0 text-[24px] font-semibold tracking-[-0.015em] text-ds-text">
            {greeting(now)}, {viewer.user.name.split(" ")[0]}
          </h1>
          <span className="text-[14px] text-ds-text-2">{summary}</span>
        </div>
        <form action="/projects" className="w-full sm:w-auto">
          <label htmlFor="home-search" className="sr-only">
            Search
          </label>
          <input
            id="home-search"
            type="search"
            name="q"
            placeholder="Search projects and assets"
            className="h-11 w-full rounded-[8px] border border-ds-control-border bg-white px-3 text-[14px] outline-none placeholder:text-ds-text-3 focus:border-ds-text-3 sm:h-[38px] sm:w-[260px]"
          />
        </form>
      </header>

      <HomeBriefInput />

      {/* Desktop: two columns. Phones: one column in the order Your turn, In progress, Credits, Next 7 days, Market, Account lead. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <div className="order-1">{sections.turn}</div>
          <div className="order-2">{sections.progress}</div>
          <div className="order-5">{sections.market}</div>
        </div>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <div className="order-3">{sections.credits}</div>
          <div className="order-4">{sections.upcoming}</div>
          {sections.lead && <div className="order-6">{sections.lead}</div>}
        </div>
      </div>
    </div>
  );
}
