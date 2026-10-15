import Link from "next/link";
import { AlertTriangle, ArrowRight, Image as ImageIcon, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { loadProjectStates } from "@/lib/project-state-loader";
import { formatDay } from "@/lib/project-state";
import { yourTurn, type CreditSummary, type TurnItem } from "@/lib/client-home";
import { slotUsage } from "@/lib/active-slots";
import { loadOutputLibrary, type LibraryItem } from "@/lib/output-library";
import { loadUsage } from "@/lib/usage";
import { listSkills, type SkillRow } from "@/lib/skills";
import { loadBrandHealth } from "@/lib/brand-health";
import { WORK_TZ } from "@/lib/working-hours";
import { CardHeader } from "@/components/ds/card";
import { Avatar } from "@/components/ds/avatar";
import { newOpportunities } from "@/lib/opportunities";
import { marketingPm } from "@/lib/contact-person";
import { poolNotes, poolOf, teamBalances } from "@/lib/team-ledger";
import { SourcePills } from "@/components/portal/plan/opportunity-bits";
import { monoLink } from "@/components/ds/pill-link";
import { AiCreditMeter } from "@/components/portal/skills/ai-credit-meter";
import { SkillIcon } from "@/components/portal/skills/skill-icon";
import { VideoThumb } from "@/components/review/video-thumb";
import { cn } from "@/lib/utils";
import { planTurns } from "@/lib/plan";
import { MessagePmButton } from "@/components/pm-panel/pm-panel-provider";
import { TopUpButton } from "@/components/portal/top-up/top-up-panel";
import { getSetting } from "@/lib/platform-settings";

/** "Needs you" shows at most this many rows; the rest are behind "See all". */
const TURN_ROWS = 5;
const OUTPUT_CARDS = 3;
const SKILL_ROWS = 3;

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** "By Sun 4 Oct" → "Due Sun 4 Oct". "Overdue" and "Due today" read as they are. */
function dueText(t: TurnItem) {
  return t.due?.label.replace(/^By /, "Due ") ?? null;
}

const LANES = [
  { stage: "draft", title: "Drafts" },
  { stage: "queued", title: "Queued" },
  { stage: "active", title: "Active" },
  { stage: "in_review", title: "In review" },
] as const;

const card = "overflow-hidden rounded-[12px] bg-white";
const n = (v: number) => Math.round(v).toLocaleString("en-GB");

/**
 * Home (nav v3, 01): what needs you, the Ongoing projects board in four numbers with the slots meter, the latest
 * in the Output library, this month's credits with the forecast, and the skills you run most. Counts and Needs you
 * come only from getProjectState; market alerts never count as something the client owes. Orange = your action.
 */
export default async function DashboardPage() {
  const viewer = await getPortalViewer();
  const now = new Date();
  const items = await loadProjectStates({ status: { not: "ARCHIVED" }, agentBuild: false, ...projectVisibilityWhere(viewer.id) }, viewer.clientId, { dueDate: "asc" });
  const [client, slots, library, usage, skills, health, fresh, pm, pools] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId }, select: { name: true } }),
    slotUsage(viewer.clientId),
    loadOutputLibrary(viewer.clientId, { sort: "newest", days: null }, now),
    loadUsage(viewer.clientId, now),
    listSkills(viewer.clientId, now),
    loadBrandHealth(viewer.clientId),
    newOpportunities(viewer.clientId, now, 1),
    marketingPm(viewer.clientId),
    teamBalances(viewer.clientId, now),
  ]);
  // Projects first, then plan items that need a brief this week (Phase R), soonest first within each.
  const turns = [...yourTurn(items, now), ...(await planTurns(viewer.clientId, now))];
  const live = items.filter(({ state }) => !state.archived);
  const count = (stage: string) => live.filter(({ state }) => state.clientStage === stage).length;
  // When the next slot frees: the soonest first draft (or due date) among projects in Active (as on the board).
  const nextFree = live
    .filter(({ state }) => state.clientStage === "active")
    .map(({ state }) => state.keyFacts.firstDraftEta ?? state.keyFacts.dueDate)
    .filter((d): d is Date => d instanceof Date && d.getTime() >= now.getTime() - 86400000)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  // Run a skill: the ones you use most this month, then your live custom skills, then the rest.
  const runnable = skills
    .filter((s) => s.live)
    .sort((a, b) => b.runsThisMonth - a.runsThisMonth || Number(b.custom) - Number(a.custom) || a.name.localeCompare(b.name))
    .slice(0, SKILL_ROWS);
  const dateEyebrow = `${new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, weekday: "long", day: "numeric", month: "long" }).format(now).replace(",", "")} · ${client.name}`.toUpperCase();

  return (
    <div className="@container/dash mx-auto flex max-w-[1120px] flex-col gap-6">
      <header aria-label="Welcome" className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="font-brand-mono text-[12px] text-brand-ink">{dateEyebrow}</span>
          <h1 className="m-0 text-[30px] font-light leading-[1.15] @min-[640px]/dash:text-[36px]">
            {greeting(now)}, {viewer.user.name.split(" ")[0]}
          </h1>
        </div>
        <Link href="/brief/new" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-brand-ink px-5 font-brand-mono text-[13px] text-white no-underline hover:bg-black">
          <Plus className="size-4" strokeWidth={1.75} />
          New project
        </Link>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 min-[1000px]:grid-cols-12">
        <div className="@container/col flex min-w-0 flex-col gap-6 min-[1000px]:col-span-8">
          <section aria-label="Needs you" className={card} data-list="your-turn" data-count={turns.length}>
            <CardHeader
              title="Needs you" meta={<span className="text-[14px] text-brand-ink-2">{turns.length}</span>}
            />
            {turns.length === 0 ? (
              <p className="m-0 px-6 py-5 text-[15px] text-brand-ink-2">Nothing needs you right now. Klingit is on everything.</p>
            ) : (
              <ol className="m-0 list-none p-0">
                {turns.slice(0, TURN_ROWS).map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-brand-line px-6 py-4 first:border-t-0">
                    <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand-orange" />
                    <div className="flex min-w-0 flex-1 basis-[calc(100%-40px)] flex-col gap-0.5 @min-[600px]/col:basis-0">
                      <span className="text-[16px] leading-[1.45]">{t.title}</span>
                      <span className="line-clamp-2 text-[14px] text-brand-ink-2 @min-[600px]/col:line-clamp-1" title={t.context}>
                        {t.context}
                      </span>
                    </div>
                    <span className={cn("flex-1 whitespace-nowrap font-brand-mono text-[12px] uppercase text-brand-ink @min-[600px]/col:w-[120px] @min-[600px]/col:flex-none @min-[600px]/col:text-right", t.due?.tone === "danger" && "font-semibold")}>{dueText(t)}</span>
                    <Link href={t.href} className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-brand-ink px-5 font-brand-mono text-[12px] text-white no-underline hover:bg-black">
                      Open
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {turns.length > TURN_ROWS && (
              <div className="border-t border-brand-line px-6 py-4">
                <Link href="/projects?show=you" className={monoLink}>
                  SEE ALL {turns.length}
                </Link>
              </div>
            )}
          </section>

          <section aria-label="Ongoing projects" className={card}>
            <CardHeader
              title="Ongoing projects"
              action={
                <Link href="/projects" className={monoLink}>
                  OPEN BOARD
                </Link>
              }
            />
            <ul className="m-0 grid list-none grid-cols-2 p-0 @min-[600px]/col:grid-cols-4">
              {LANES.map((l, i) => (
                <li key={l.stage} className={cn("flex flex-col gap-2 border-brand-line px-6 py-5", i > 0 && "@min-[600px]/col:border-l", i % 2 === 1 && "border-l", i > 1 && "border-t @min-[600px]/col:border-t-0")}>
                  <Link href="/projects" className="flex flex-col gap-2 text-brand-ink no-underline hover:underline">
                    <span className="text-[14px] text-brand-ink-2">{l.title}</span>
                    <span className="text-[30px] font-light leading-none tabular-nums">{count(l.stage)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-brand-line px-6 py-4">
              <span className="text-[14px]">Active slots</span>
              <span role="img" aria-label={`${slots.used} of ${slots.total} active slots in use`} className="flex h-2 min-w-[120px] flex-1 gap-1">
                {Array.from({ length: Math.max(slots.total, slots.used) }, (_, i) => (
                  <span key={i} className={cn("h-full flex-1 rounded-full", i < slots.used ? "bg-brand-ink" : "bg-brand-track")} />
                ))}
              </span>
              <span className="text-[14px] tabular-nums">
                {slots.used} of {slots.total} in use
              </span>
              <span className="text-[13px] text-brand-ink-2">{slots.free > 0 ? `${slots.free} free` : nextFree ? `next frees ~${formatDay(nextFree)}` : "all in use"}</span>
            </div>
          </section>

          <section aria-label="Latest in Output library" className={card}>
            <CardHeader
              title="Latest in Output library"
              action={
                <Link href="/library" className={monoLink}>
                  ALL OUTPUTS
                </Link>
              }
            />
            {library.items.length === 0 ? (
              <p className="m-0 px-6 py-5 text-[15px] text-brand-ink-2">Nothing delivered yet. Approved files and what your skills make land here.</p>
            ) : (
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-6 @min-[600px]/col:grid-cols-3">
                {library.items.slice(0, OUTPUT_CARDS).map((i) => (
                  <OutputCard key={i.key} item={i} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 min-[1000px]:col-span-4">
          {/* No Marketing PM yet: a neutral card; messages still reach Klingit, who connect the client with their PM. */}
          <section aria-label={pm ? "Your Marketing PM" : "Your Klingit team"} className={card}>
            <div className="flex items-center gap-3 px-6 py-4">
              <Avatar name={pm?.name ?? "Klingit"} size={40} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[12px] text-brand-ink-2">{pm ? "Your Marketing PM" : "Your Klingit team"}</span>
                <span className="truncate text-[16px]">{pm?.name ?? "Klingit"}</span>
              </span>
              <MessagePmButton className={monoLink}>MESSAGE</MessagePmButton>
            </div>
          </section>
          <Credits pools={pools} team={usage.team} ai={usage.ai} runOut={usage.ai.reachedDay && usage.ai.runsOutBeforeReset ? new Date(Date.UTC(usage.period.start.getUTCFullYear(), usage.period.start.getUTCMonth(), usage.ai.reachedDay)) : null} reset={usage.period.nextReset} warnAt={await getSetting("aiWarnAt")} />

          {fresh.count > 0 && (
            <section aria-label="New opportunities" className={card}>
              <CardHeader
                title={`${fresh.count} new opportunit${fresh.count === 1 ? "y" : "ies"}`}
                action={
                  <Link href="/planner/opportunities" className={monoLink}>
                    ALL
                  </Link>
                }
              />
              <Link href={`/planner/opportunities/${fresh.newest[0].id}`} className="flex flex-col gap-2 px-6 py-5 text-brand-ink no-underline hover:bg-[#FBF9F4]">
                <SourcePills sources={fresh.newest[0].sources} />
                <span className="text-[16px]">{fresh.newest[0].title}</span>
                {fresh.newest[0].whyNow && <span className="line-clamp-2 text-[13px] text-brand-ink-2">{fresh.newest[0].whyNow}</span>}
              </Link>
            </section>
          )}

          <section aria-label="Run a skill" className={card}>
            <CardHeader
              title="Run a skill"
              action={
                <Link href="/skills" className={monoLink}>
                  ALL SKILLS
                </Link>
              }
            />
            {runnable.length === 0 ? (
              <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">No skills switched on yet.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {runnable.map((s) => (
                  <SkillLine key={s.id} skill={s} />
                ))}
              </ul>
            )}
          </section>

          <Link href="/assets" className="flex items-center gap-2.5 px-2 text-[14px] text-brand-ink no-underline hover:underline">
            <ImageIcon className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="flex-1">
              Brand health <span className="tabular-nums">{health.score}</span> · {health.label}
            </span>
            <ArrowRight className="size-4" strokeWidth={1.75} />
          </Link>
        </aside>
      </div>
    </div>
  );
}

function OutputCard({ item: i }: { item: LibraryItem }) {
  const sub = i.metric?.label ?? (i.badge === "New" ? "New" : i.madeBy === "skill" ? "Made with a skill" : null);
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <Link href={i.href} className="relative block aspect-[16/11] overflow-hidden rounded-[8px] no-underline" style={{ backgroundColor: `color-mix(in srgb, ${i.thumb.color} 22%, white)` }}>
        {i.thumb.video ? (
          <VideoThumb src={i.thumb.video.src} poster={i.thumb.video.poster} />
        ) : i.thumb.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- access-checked file
          <img src={i.thumb.image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : i.thumb.text ? (
          <span className="absolute inset-0 p-4 text-[13px] leading-[1.45] text-brand-ink">
            <span className="line-clamp-4">{i.thumb.text}</span>
          </span>
        ) : null}
      </Link>
      <Link href={i.href} className="truncate text-[14px] text-brand-ink no-underline hover:underline" title={i.title}>
        {i.title}
      </Link>
      {sub && <span className="text-[13px] text-brand-ink-2">{sub}</span>}
    </li>
  );
}

function SkillLine({ skill: s }: { skill: SkillRow }) {
  return (
    <li className="border-t border-brand-line first:border-t-0">
      <Link href={`/skills/${s.id}`} className="flex items-center gap-3 px-6 py-3 text-brand-ink no-underline hover:bg-brand-chip">
        <SkillIcon category={s.category} custom={s.custom} size={30} />
        <span className="min-w-0 flex-1 truncate text-[15px]">{s.name}</span>
        {s.aiPerRun != null && <span className="text-[12px] text-brand-mute">≈ {n(s.aiPerRun)} AI</span>}
      </Link>
    </li>
  );
}

type UsageData = Awaited<ReturnType<typeof loadUsage>>;

/**
 * Credits this month: team credits (Klingit's time; approved estimates come from here, ones still waiting are held)
 * and AI credits (skills and assistants), with the same forecast as Usage. No allowance = no "left": never invented.
 */
type Pools = NonNullable<Awaited<ReturnType<typeof teamBalances>>>;

function Credits({ team, ai, runOut, pools, warnAt }: { team: CreditSummary & { usedThisMonth: number }; ai: UsageData["ai"]; runOut: Date | null; reset: Date; pools: Pools | null; warnAt: number }) {
  const month = team.month.slice(0, 3);
  const total = team.available;
  const pct = (v: number) => (total ? `${Math.min(100, (v / total) * 100)}%` : "0%");
  // The month's AI credits: the allowance plus any bundle credits still to use (= used + left).
  const aiTotal = ai.used + ai.left;
  const usedPct = ai.allowance > 0 ? Math.round((ai.used / ai.allowance) * 100) : 0;
  const warn = !ai.ownModel && ai.allowance > 0 && ai.used >= ai.allowance * warnAt;
  const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  return (
    <section aria-label="Credits" className={card}>
      <CardHeader title="Credits this month" action={<span className="font-brand-mono text-[12px] uppercase text-brand-ink">{ai.plan.name} plan</span>} />
      <div className="flex flex-col gap-5 px-6 py-5">
        {pools ? (
          // Phase S: on a contract, PM and creative credits are two balances, never pooled.
          (["pm", "creative"] as const)
            .filter((k) => pools[k].monthly > 0 || pools[k].left > 0)
            .map((k) => {
              const p = pools[k];
              const of = poolOf(p);
              return (
                <div key={k} className="flex flex-col gap-2">
                  <div className="flex items-baseline gap-3">
                    <span className="flex-1 text-[15px]">{k === "pm" ? "PM credits" : "Creative credits"}</span>
                    <span className="text-[13px] text-brand-ink-2">
                      <span className="text-[22px] tabular-nums text-brand-ink">{n(p.left)}</span> left of {n(of)}{p.monthly > 0 ? " a month" : ""}
                    </span>
                  </div>
                  <div role="img" aria-label={`${n(p.used)} of ${n(of)} used`} className="flex h-2 overflow-hidden rounded-full bg-brand-track">
                    <span className="h-full bg-brand-ink" style={{ width: `${of ? Math.max(0, Math.min(100, ((of - p.left) / of) * 100)) : 0}%` }} />
                  </div>
                  <span className="text-[12px] leading-[1.5] text-brand-ink-2">
                    {k === "pm" ? "Your Marketing PM's time" : "Klingit's creative team"} · 1 credit ≈ 1 hour
                    {poolNotes(p).map((x) => ` · ${x}`)}
                  </span>
                </div>
              );
            })
        ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <span className="flex-1 text-[15px]">Team credits</span>
            {total !== null && team.free !== null ? (
              <span className="text-[13px] text-brand-ink-2">
                <span className="text-[22px] tabular-nums text-brand-ink">{team.free}</span> left of {total}
              </span>
            ) : (
              <span className="text-[13px] text-brand-ink-2">
                <span className="text-[22px] tabular-nums text-brand-ink">{team.used}</span> used · {month}
              </span>
            )}
          </div>
          {total !== null && (
            <div role="img" aria-label={`${team.used} of ${total} team credits used`} className="flex h-2 overflow-hidden rounded-full bg-brand-track">
              <span className="h-full bg-brand-ink" style={{ width: pct(team.used) }} />
              <span className="h-full bg-[repeating-linear-gradient(135deg,var(--color-brand-outline)_0_3px,transparent_3px_6px)]" style={{ width: pct(team.awaiting) }} />
            </div>
          )}
          <span className="text-[12px] leading-[1.5] text-brand-ink-2">
            {total === null ? "No monthly allowance. Credits are billed as you approve estimates." : `Klingit team time, 1 credit = 1 hour · ${team.used} used${team.awaiting ? ` · ${team.awaiting} held` : ""}`}
          </span>
        </div>
        )}

        <div className="flex flex-col gap-2">
          {ai.ownModel ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className="flex-1 text-[15px]">AI</span>
                <span className="text-[13px] text-brand-ink-2">Your own model</span>
              </div>
              <span className="text-[12px] leading-[1.5] text-brand-ink-2">{n(ai.providerTokens)} tokens this month, billed by your provider.</span>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-3">
                <span className="flex-1 text-[15px]">AI credits</span>
                {aiTotal > 0 ? (
                  <span className="text-[13px] text-brand-ink-2">
                    <span className="text-[22px] tabular-nums text-brand-ink">{n(ai.left)}</span> left of {n(aiTotal)}
                  </span>
                ) : (
                  <span className="text-[13px] text-brand-ink-2">None on this plan</span>
                )}
              </div>
              {aiTotal > 0 && <AiCreditMeter used={ai.used} allowance={aiTotal} />}
              {warn ? (
                // Phase U: from the warn level (80%) on, how far along and when it runs out at this pace.
                <span className="text-[12px] leading-[1.5] text-brand-orange-text">
                  {usedPct}% used{runOut ? ` · at this pace you run out ${new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(runOut)}` : ""}
                </span>
              ) : (
                <span className="text-[12px] leading-[1.5] text-brand-ink-2">Skills you run · {n(ai.used)} used · assistants are included</span>
              )}
            </>
          )}
        </div>

        {warn && (
          <p className="m-0 flex items-center gap-3 rounded-[10px] bg-brand-peach-pale px-4 py-3 text-[13px] leading-[1.5]">
            <AlertTriangle className="size-4 shrink-0 text-brand-orange-text" strokeWidth={1.75} />
            <span className="flex-1">{ai.left <= 0 ? "Skills are paused: top up to keep them running" : "Top up now so skills keep running"}</span>
            <TopUpButton className="inline-flex h-9 items-center rounded-full bg-brand-orange px-4 font-brand-mono text-[12px] text-white">Top up</TopUpButton>
          </p>
        )}
        <span className="flex gap-4">
          <Link href="/settings/usage" className="self-start text-[13px] text-brand-ink underline">
            See usage
          </Link>
          <Link href="/settings/plan" className="self-start text-[13px] text-brand-ink underline">
            Your plan
          </Link>
        </span>
      </div>
    </section>
  );
}
