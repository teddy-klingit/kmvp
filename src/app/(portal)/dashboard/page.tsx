import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { loadProjectStates } from "@/lib/project-state-loader";
import { creditSummary, marketThisWeek, nextSevenDays, projectRow, yourTurn, type CreditSummary, type TurnItem } from "@/lib/client-home";
import { ProjectRows } from "@/components/portal/project-rows";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";
import { WORK_TZ } from "@/lib/working-hours";
import { Avatar } from "@/components/ds/avatar";
import { CardHeader } from "@/components/ds/card";
import { monoLink } from "@/components/ds/pill-link";
import { cn } from "@/lib/utils";

/** "Do this next" shows at most this many rows; the rest are behind "See all". */
const TURN_ROWS = 5;
const PROJECT_ROWS = 6;
const UPCOMING_ROWS = 5;

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function typeLabel(t: string) {
  return PROJECT_TYPE_LABEL[t]?.split(" / ")[0] ?? t;
}

const weekday = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, weekday: "short" }).format(d);

/** Short, fixed-width button labels; the row's title already says what the action is. */
const ROW_CTA: Record<TurnItem["kind"], string | null> = { review: "Review", approve: "Review", brief: "Answer", signoff: "Sign off", other: null };

/** "By Sun 4 Oct" → "Due Sun 4 Oct". "Overdue" and "Due today" read as they are. */
function dueText(t: TurnItem) {
  return t.due?.label.replace(/^By /, "Due ") ?? null;
}

const card = "overflow-hidden rounded-[12px] bg-white";

/**
 * The calm client home (ClientHomeV2.dc.html): a photo banner with the 12-column grid overlapping its
 * bottom edge. Counts and "Do this next" come only from getProjectState; market alerts never count as
 * something the client owes. Orange means "your action" and appears nowhere else.
 */
export default async function DashboardPage() {
  const viewer = await getPortalViewer();
  const now = new Date();
  const items = await loadProjectStates({ status: { not: "ARCHIVED" }, ...projectVisibilityWhere(viewer.id) }, viewer.clientId, { dueDate: "asc" });
  const client = await prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId }, include: { accountLead: { include: { user: true } } } });
  const lead = client.accountLead?.user.name ?? null;

  const [credits, upcoming, market] = await Promise.all([creditSummary(viewer.clientId, now), nextSevenDays(viewer.clientId, items, now), marketThisWeek(viewer.clientId, now)]);
  const turns = yourTurn(items, now);
  // Drafts are still the client's own work: they show in Do this next, not as projects.
  const progress = items.filter(({ state }) => !state.draft && state.stage !== "closed" && !state.archived).map((i) => projectRow(i, typeLabel, lead, now));
  const late = progress.filter((p) => p.status.late).length;
  const messageProject = turns[0]?.id ?? progress[0]?.id ?? null;
  const dateEyebrow = new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, weekday: "long", day: "numeric", month: "long" }).format(now).toUpperCase().replace(",", "");

  const summary =
    turns.length === 0
      ? "Nothing needs you right now. Klingit is on everything."
      : `${turns.length} ${turns.length === 1 ? "thing needs" : "things need"} you. ${
          late > 0 ? `${late} draft${late === 1 ? " is" : "s are"} running late; Klingit is on it.` : "Everything else is on track."
        }`;

  return (
    <div className="@container/dash mx-auto flex max-w-[1120px] flex-col">
      {/* Photo banner. The grid below overlaps its bottom 64px (96px pull-up less the 32px section gap). */}
      <header
        aria-label="Welcome"
        className="relative -mb-16 flex flex-col items-start gap-5 overflow-hidden rounded-[16px] bg-[#6B5A40] bg-cover bg-center px-6 pb-[92px] pt-6 @min-[640px]/dash:h-[220px] @min-[640px]/dash:flex-row @min-[640px]/dash:gap-6 @min-[640px]/dash:px-9 @min-[640px]/dash:py-8"
        style={{ backgroundImage: "url(/brand/klingit-hero.webp)" }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(30,30,30,0.45),rgba(30,30,30,0.05))]" />
        <div className="relative flex flex-1 flex-col gap-2 text-white">
          <span className="font-brand-mono text-[12px] text-brand-cream">{dateEyebrow}</span>
          <h1 className="m-0 text-[30px] font-light leading-[1.15] text-white @min-[640px]/dash:text-[36px]">
            {greeting(now)}, {viewer.user.name.split(" ")[0]}
          </h1>
          <p className="m-0 text-[16px] text-brand-cream">{summary}</p>
        </div>
        <Link
          href="/brief/new"
          className="relative inline-flex h-11 shrink-0 items-center gap-2.5 rounded-full bg-brand-cream px-5 font-brand-mono text-[13px] text-brand-ink no-underline hover:bg-white"
        >
          <Plus className="size-4" strokeWidth={1.75} />
          New project
        </Link>
      </header>

      <div className="relative grid grid-cols-1 items-start gap-6 px-4 min-[1000px]:grid-cols-12">
        <div className="@container/col flex min-w-0 flex-col gap-6 min-[1000px]:col-span-8">
          <section aria-label="Do this next" className={card} data-list="your-turn">
            <CardHeader title="Do this next" action={
              <span className="text-[12px] text-brand-ink-2">{turns.length} open</span>
            } />
            {turns.length === 0 ? (
              <p className="m-0 px-6 py-5 text-[15px] text-brand-ink-2">Nothing needs you. Klingit is on everything.</p>
            ) : (
              <ol className="m-0 list-none p-0">
                {turns.slice(0, TURN_ROWS).map((t, i) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-brand-line px-6 py-5 first:border-t-0">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-orange font-brand-mono text-[13px] text-brand-ink">{i + 1}</span>
                    <div className="flex min-w-0 flex-1 basis-[calc(100%-48px)] flex-col gap-0.5 @min-[600px]/col:basis-0">
                      <span className="text-[17px] leading-[1.45]">{t.title}</span>
                      <span className="line-clamp-2 text-[14px] text-brand-ink-2 @min-[600px]/col:line-clamp-1" title={t.context}>
                        {t.context}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "flex-1 whitespace-nowrap text-[13px] text-brand-ink @min-[600px]/col:w-[110px] @min-[600px]/col:flex-none @min-[600px]/col:text-right",
                        t.due?.tone === "danger" && "font-semibold"
                      )}
                    >
                      {dueText(t)}
                    </span>
                    <Link
                      href={t.href}
                      className="inline-flex h-10 w-[132px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-brand-ink font-brand-mono text-[12px] text-white no-underline hover:bg-black"
                    >
                      {ROW_CTA[t.kind] ?? t.cta}
                      <ArrowRight className="size-3.5" strokeWidth={1.75} />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {turns.length > TURN_ROWS && (
              <div className="border-t border-brand-line px-6 py-4">
                <Link href="/projects" className={monoLink}>
                  SEE ALL {turns.length}
                </Link>
              </div>
            )}
          </section>

          <section aria-label="Your projects" className={card}>
            <CardHeader
              title="Your projects"
              action={
                <Link href="/projects" className={monoLink}>
                  ALL PROJECTS
                </Link>
              }
            />
            {progress.length === 0 ? (
              <p className="m-0 px-6 py-5 text-[15px] text-brand-ink-2">No projects yet. Start one with “New project”.</p>
            ) : (
              <ProjectRows rows={progress.slice(0, PROJECT_ROWS)} />
            )}
            {progress.length > PROJECT_ROWS && (
              <div className="border-t border-brand-line px-6 py-4">
                <Link href="/projects" className={monoLink}>
                  +{progress.length - PROJECT_ROWS} MORE
                </Link>
              </div>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 min-[1000px]:col-span-4">
          <section aria-label="Next 7 days" className={card}>
            <CardHeader title="Next 7 days" />
            {upcoming.length === 0 ? (
              <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">Nothing scheduled this week.</p>
            ) : (
              <ol className="m-0 list-none py-2 pl-0">
                {upcoming.slice(0, UPCOMING_ROWS).map((u) => {
                  const body = (
                    <>
                      <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-[8px] bg-brand-chip">
                        <span className="text-[11px] text-brand-ink-2">{weekday(u.at)}</span>
                        <span className="text-[16px] leading-[1.1]">{u.at.getDate()}</span>
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[14px]">{u.title}</span>
                        <span className="text-[12px] text-brand-ink-2">{u.sub}</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={u.id}>
                      {u.href ? (
                        <Link href={u.href} className="flex items-center gap-3.5 px-6 py-3 text-brand-ink no-underline hover:bg-brand-chip">
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3.5 px-6 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <Credits credits={credits} />

          {lead && (
            <section aria-label="Account lead" className="flex items-center gap-3 rounded-[12px] bg-white px-6 py-4">
              <Avatar name={lead} size={40} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px]">{lead}</span>
                <span className="text-[12px] text-brand-ink-2">Your account lead</span>
              </div>
              {messageProject && (
                <Link
                  href={`/projects/${messageProject}?channel=klingit`}
                  className="inline-flex h-9 shrink-0 items-center rounded-full border border-brand-outline bg-white px-3.5 font-brand-mono text-[12px] text-brand-ink no-underline hover:border-brand-ink"
                >
                  Message
                </Link>
              )}
            </section>
          )}

          <Link href="/insights" className="flex items-center gap-2.5 px-2 text-[14px] text-brand-ink no-underline hover:underline">
            <span className="size-2 shrink-0 bg-brand-lime-strong" />
            <span className="flex-1">
              {market.length === 0 ? "No market changes this week" : `${market.length} market insight${market.length === 1 ? "" : "s"} this week`}
            </span>
            <ArrowRight className="size-4" strokeWidth={1.75} />
          </Link>
        </aside>
      </div>
    </div>
  );
}

/** "40 of 40 left · Oct". Approved estimates are taken from the allowance; ones still waiting are held back. No allowance = no "left". */
function Credits({ credits }: { credits: CreditSummary }) {
  const month = credits.month.slice(0, 3);
  const total = credits.available;
  const pct = (n: number) => (total ? `${Math.min(100, (n / total) * 100)}%` : "0%");
  const note =
    total === null
      ? "No monthly allowance. Credits are billed as you approve estimates."
      : credits.used === 0 && credits.awaiting === 0
        ? "Nothing used yet this month. Estimates you approve are taken from here."
        : `${credits.used} used${credits.awaiting ? `, ${credits.awaiting} held for estimates you haven't approved yet` : ""}. Estimates you approve are taken from here.`;
  return (
    <section aria-label="Credits" className="flex flex-col gap-3 rounded-[12px] bg-white px-6 py-5">
      <div className="flex items-baseline gap-3">
        <h2 className="m-0 flex-1 text-[18px] font-normal leading-[1.45]">Credits</h2>
        {total !== null && credits.free !== null ? (
          <span className="text-[14px]">
            <span className="tabular-nums">{credits.free}</span>
            <span className="text-brand-ink-2">
              {" "}
              of {total} left · {month}
            </span>
          </span>
        ) : (
          <span className="text-[14px]">
            <span className="tabular-nums">{credits.used}</span>
            <span className="text-brand-ink-2"> used · {month}</span>
          </span>
        )}
      </div>
      {total !== null && (
        <div role="img" aria-label={`${credits.used} of ${total} credits used`} className="flex h-1 overflow-hidden rounded-full bg-brand-track">
          <span className="h-full bg-brand-ink" style={{ width: pct(credits.used) }} />
          <span className="h-full bg-brand-outline" style={{ width: pct(credits.awaiting) }} />
        </div>
      )}
      <span className="text-[12px] leading-[1.5] text-brand-ink-2">{note}</span>
    </section>
  );
}
