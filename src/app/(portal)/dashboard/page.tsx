import Link from "next/link";
import { ArrowRight, Image as ImageIcon, MessageSquareText, ReceiptText, Signal } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { loadProjectStates } from "@/lib/project-state-loader";
import { clientMilestones } from "@/lib/project-state";
import { creditSummary, deliveredThisMonth, inProgress, marketThisWeek, nextSevenDays, yourTurn, type TurnItem, type UpcomingItem } from "@/lib/client-home";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";
import { WORK_TZ } from "@/lib/working-hours";
import { Avatar, AvatarStack } from "@/components/ds/avatar";
import { BrandBriefInput } from "@/components/portal/home/home-brief-input";
import { cn } from "@/lib/utils";

/** Your turn shows at most this many cards; the rest are behind "See all". */
const TURN_CARDS = 2;
const PROJECT_CARDS = 6;

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function typeLabel(t: string) {
  return PROJECT_TYPE_LABEL[t]?.split(" / ")[0] ?? t;
}

type BrandTone = "grey" | "peach" | "lime" | "pink" | "orange";

/** Brand pill: radius 999, 12px. Tone picks the brand colour. */
function Pill({ tone = "grey", children, className }: { tone?: BrandTone; children: React.ReactNode; className?: string }) {
  const bg = { grey: "bg-brand-grey", peach: "bg-brand-peach", lime: "bg-brand-lime", pink: "bg-brand-pink", orange: "bg-brand-orange" }[tone];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[12px] text-brand-ink", bg, className)}>{children}</span>;
}

/** Pill button with a mono label and an arrow — the brand's call to action. */
function PillLink({
  href,
  tone = "ink",
  children,
  arrow = true,
  className,
}: {
  href: string;
  tone?: "ink" | "lime" | "orange" | "outline";
  children: React.ReactNode;
  arrow?: boolean;
  className?: string;
}) {
  const tones = {
    ink: "bg-brand-ink text-white hover:bg-black",
    lime: "bg-brand-lime text-brand-ink hover:brightness-95",
    orange: "bg-brand-orange text-brand-ink hover:brightness-95",
    outline: "border border-brand-outline bg-white text-brand-ink hover:border-brand-ink",
  }[tone];
  return (
    <Link href={href} className={cn("inline-flex min-h-11 items-center gap-2.5 rounded-full px-4 py-2.5 font-brand-mono text-[12px] no-underline min-[900px]:min-h-0", tones, className)}>
      {children}
      {arrow && <ArrowRight className="size-4" strokeWidth={1.75} />}
    </Link>
  );
}

/** Orange only when it's really late (overdue / due today); peach when it's close; grey otherwise. */
function dueTone(t: TurnItem, now: Date): BrandTone | null {
  if (!t.due) return null;
  if (t.due.tone === "danger") return "orange";
  return t.dueAt && t.dueAt.getTime() - now.getTime() < 4 * 86400000 ? "peach" : "grey";
}

const UPCOMING_TONE: Record<UpcomingItem["kind"], string> = {
  touchpoint: "bg-brand-grey",
  due_client: "bg-brand-peach",
  due_klingit: "bg-brand-lime",
  draft: "bg-brand-lime",
  estimate: "bg-brand-pink",
};

const STAGE_PILL: Record<string, BrandTone> = {
  Brief: "lime",
  Estimate: "pink",
  Production: "grey",
  Review: "peach",
  Delivered: "grey",
};

/**
 * Client home in the Klingit brand theme (ClientHome.dc.html). Counts and "Your turn" come only from
 * getProjectState — market alerts never count as something the client owes.
 */
export default async function DashboardPage() {
  const viewer = await getPortalViewer();
  const now = new Date();
  const items = await loadProjectStates({ status: { not: "ARCHIVED" }, ...projectVisibilityWhere(viewer.id) }, viewer.clientId, { dueDate: "asc" });
  const client = await prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId }, include: { accountLead: { include: { user: true } } } });
  const lead = client.accountLead?.user.name ?? null;

  const [credits, upcoming, market] = await Promise.all([creditSummary(viewer.clientId, now), nextSevenDays(viewer.clientId, items, now), marketThisWeek(viewer.clientId, now)]);
  const turns = yourTurn(items, now);
  // Drafts are still the client's own work: they show in Your turn, not as projects in progress.
  const progress = inProgress(items.filter(({ state }) => !state.draft), typeLabel, lead);
  const delivered = deliveredThisMonth(items, now);
  const shownTurns = turns.slice(0, TURN_CARDS);

  // What each Your-turn card previews: the assets waiting, the agent's question, or the estimate.
  const previewAssets = await prisma.asset.findMany({
    where: { projectId: { in: shownTurns.filter((t) => t.kind === "review" || t.kind === "signoff").map((t) => t.id) }, status: { in: ["IN_REVIEW", "APPROVED"] } },
    select: { projectId: true, thumbnailColor: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  const stateOf = (id: string) => items.find((i) => i.project.id === id)?.state;
  const topMarket = market[0];
  const otherMarket = market.slice(1);
  const messageProject = turns[0]?.id ?? progress[0]?.id ?? null;
  const dateEyebrow = new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, weekday: "long", day: "numeric", month: "long" }).format(now).toUpperCase().replace(",", "");
  const first = turns[0];

  return (
    <div className="mx-auto flex max-w-[1160px] flex-col gap-5">
      {/* Welcome banner */}
      <section
        aria-label="Welcome"
        className="relative flex min-h-[248px] items-stretch overflow-hidden rounded-[16px] bg-[#6B5A40] bg-cover bg-center"
        style={{ backgroundImage: "url(/brand/klingit-hero.webp)" }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(30,30,30,0.55)_0%,rgba(30,30,30,0.15)_60%,rgba(30,30,30,0)_100%)]" />
        <div className="relative flex flex-1 items-end justify-between gap-8 p-6 min-[900px]:px-10 min-[900px]:py-9">
          <div className="flex flex-col items-start gap-5">
            <span className="font-brand-mono text-[13px] text-brand-cream">{dateEyebrow}</span>
            <h1 className="m-0 text-[40px] font-light leading-[1.1] tracking-[0.01em] text-white min-[900px]:text-[48px]">
              {greeting(now)},
              <br />
              {viewer.user.name.split(" ")[0]}
            </h1>
            {first ? (
              <PillLink href={first.href} tone="orange" className="gap-3.5 px-[22px] py-3.5 text-[14px]">
                {turns.length} {turns.length === 1 ? "thing needs" : "things need"} you
              </PillLink>
            ) : (
              <PillLink href="#new-need" tone="orange" className="gap-3.5 px-[22px] py-3.5 text-[14px]">
                Nothing needs you · start something
              </PillLink>
            )}
          </div>
          {first && (
            <div className="hidden items-center min-[900px]:flex" aria-label="Up next">
              <span className="size-2.5 bg-brand-lime" />
              <span className="h-px w-14 bg-brand-lime" />
              <Link href={first.href} className="flex w-[280px] flex-col gap-3 rounded-[10px] bg-white p-4 text-brand-ink no-underline">
                <Pill tone="peach" className="self-start">
                  Up next
                </Pill>
                <span className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[6px] bg-brand-pink">
                    {first.kind === "brief" ? (
                      <MessageSquareText className="size-5" strokeWidth={1.75} />
                    ) : first.kind === "approve" ? (
                      <ReceiptText className="size-5" strokeWidth={1.75} />
                    ) : (
                      <ImageIcon className="size-5" strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px]">{first.title}</span>
                    <span className="truncate text-[12px] text-brand-ink-2">
                      {first.projectName}
                      {first.dueAt ? ` · by ${new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(first.dueAt)}` : ""}
                    </span>
                  </span>
                </span>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Four tiles */}
      <section aria-label="At a glance" className="grid grid-cols-2 gap-4 min-[900px]:grid-cols-4">
        <Tile href="#your-turn" bg="bg-brand-peach" dot="rounded-full bg-brand-orange" label="YOUR TURN" value={String(turns.length)} />
        <Tile href="#projects" bg="bg-white" dot="rounded-full bg-brand-ink" label="IN PROGRESS" value={String(progress.length)} />
        {credits.available !== null && credits.free !== null ? (
          <Tile href="/account/usage" bg="bg-brand-lime" dot="bg-brand-lime-strong" label="CREDITS LEFT" value={String(credits.free)} suffix={`/ ${credits.available}`} />
        ) : (
          <Tile href="/account/usage" bg="bg-brand-lime" dot="bg-brand-lime-strong" label="CREDITS USED" value={String(credits.used)} suffix="no allowance" />
        )}
        <Tile href="/projects" bg="bg-brand-pink" dot="rounded-full bg-brand-ink" label={`DELIVERED ${credits.month.slice(0, 3).toUpperCase()}`} value={String(delivered)} />
      </section>

      {/* Two columns from 1100px; one below. */}
      <div className="flex flex-col gap-5 min-[1100px]:grid min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] min-[1100px]:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <section id="your-turn" aria-label="Your turn" className="flex scroll-mt-4 flex-col gap-3" data-list="your-turn">
            <div className="flex items-baseline px-1 pt-1">
              <h2 className="m-0 flex-1 text-[22px] font-normal tracking-[0.01em]">Your turn</h2>
              {turns.length > TURN_CARDS && (
                <Link href="/projects" className="font-brand-mono text-[12px] text-brand-ink">
                  SEE ALL {turns.length}
                </Link>
              )}
            </div>
            {shownTurns.length === 0 ? (
              <div className="rounded-[12px] bg-white p-5 text-[15px] text-brand-ink-2">Nothing needs you. Klingit is on everything.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
                {shownTurns.map((t) => {
                  const st = stateOf(t.id);
                  const thumbs = previewAssets.filter((a) => a.projectId === t.id && (t.kind === "review" ? a.status === "IN_REVIEW" : true)).slice(0, 3);
                  const tone = dueTone(t, now);
                  return (
                    <article key={t.id} className="flex flex-col gap-[18px] rounded-[12px] bg-white p-5">
                      {(t.kind === "review" || t.kind === "signoff") && thumbs.length > 0 ? (
                        <div className="flex h-[72px] gap-2" aria-hidden>
                          {thumbs.map((a, i) => (
                            <span key={i} className="flex-1 rounded-[6px]" style={{ backgroundColor: `color-mix(in srgb, ${a.thumbnailColor} 14%, white)` }} />
                          ))}
                        </div>
                      ) : t.kind === "brief" && st?.brief.mode !== "intake" && st?.brief.next ? (
                        <div className="flex h-[72px] flex-col justify-center gap-1.5 rounded-[6px] bg-brand-grey px-3.5">
                          <span className="font-brand-mono text-[11px] text-brand-ink-2">BRIEF AGENT ASKS</span>
                          <span className="line-clamp-2 text-[14px]">{st.brief.next.question}</span>
                        </div>
                      ) : (
                        <div className="flex h-[72px] flex-col justify-center gap-1.5 rounded-[6px] bg-brand-grey px-3.5">
                          <span className="font-brand-mono text-[11px] text-brand-ink-2">{t.kind === "approve" ? "ESTIMATE" : "NEXT STEP"}</span>
                          <span className="line-clamp-2 text-[14px]">{t.kind === "approve" ? `${st?.keyFacts.credits ?? ""} credits · first draft 2 days after you approve` : t.detail}</span>
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <span className="text-[18px]">{t.title}</span>
                        <span className="line-clamp-2 text-[13px] text-brand-ink-2 min-[900px]:line-clamp-1">
                          {t.projectName} · {t.detail}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        {t.due && tone ? <Pill tone={tone}>{t.due.label}</Pill> : <span />}
                        <PillLink href={t.href} tone={t.kind === "brief" ? "lime" : "ink"}>
                          {t.cta}
                        </PillLink>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section id="projects" aria-label="Your projects" className="flex scroll-mt-4 flex-col gap-3">
            <div className="flex items-baseline px-1 pt-1">
              <h2 className="m-0 flex-1 text-[22px] font-normal tracking-[0.01em]">Your projects</h2>
              <Link href="/projects" className="font-brand-mono text-[12px] text-brand-ink">
                ALL PROJECTS
              </Link>
            </div>
            {progress.length === 0 ? (
              <div className="rounded-[12px] bg-white p-5 text-[15px] text-brand-ink-2">No projects in progress. Tell us what you need made.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2 min-[1100px]:grid-cols-3">
                {progress.slice(0, PROJECT_CARDS).map((p) => {
                  const st = stateOf(p.id)!;
                  const current = clientMilestones(st).find((m) => m.status === "current");
                  const step = p.steps.indexOf("current") + 1 || p.steps.filter((s) => s === "done").length;
                  const theirTurn = st.ballInCourt === "client";
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex flex-col gap-4 rounded-[12px] bg-white p-5 text-brand-ink no-underline hover:shadow-[0_2px_10px_rgba(30,30,30,0.06)]"
                    >
                      <div className="flex items-center justify-between">
                        <Pill tone={STAGE_PILL[current?.label ?? ""] ?? "grey"}>{st.paused ? "Paused" : (current?.label ?? "Delivered")}</Pill>
                        {p.team.length > 0 && <AvatarStack names={p.team} size={28} max={3} />}
                      </div>
                      <div className="flex min-h-16 flex-col gap-1">
                        <span className="text-[17px] leading-[1.3]">{p.name}</span>
                        <span className="text-[13px] text-brand-ink-2">{p.next}</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-brand-track">
                          <span className={cn("block h-full rounded-full", theirTurn ? "bg-brand-orange" : "bg-brand-ink")} style={{ width: `${(step / 5) * 100}%` }} />
                        </div>
                        <span className="font-brand-mono text-[11px] text-brand-ink-2">STEP {step} OF 5</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
            {progress.length > PROJECT_CARDS && (
              <Link href="/projects" className="self-start px-1 font-brand-mono text-[12px] text-brand-ink">
                +{progress.length - PROJECT_CARDS} MORE
              </Link>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <BrandBriefInput />

          <section aria-label="Next 7 days" className="flex flex-col gap-3.5 rounded-[12px] bg-white p-5">
            <span className="text-[18px]">Next 7 days</span>
            {upcoming.length === 0 ? (
              <span className="text-[14px] text-brand-ink-2">Nothing scheduled this week.</span>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-3 p-0">
                {upcoming.slice(0, 5).map((u) => {
                  const body = (
                    <>
                      <span className={cn("flex size-11 shrink-0 flex-col items-center justify-center rounded-[8px]", UPCOMING_TONE[u.kind])}>
                        <span className="font-brand-mono text-[10px] uppercase">{new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(u.at)}</span>
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
                        <Link href={u.href} className="flex items-center gap-3 text-brand-ink no-underline">
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section aria-label="This week in your market" className="flex flex-col gap-3.5 rounded-[12px] bg-brand-lime p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-[6px] bg-brand-pink">
                <Signal className="size-4" strokeWidth={1.75} />
              </span>
              <span className="font-brand-mono text-[12px]">THIS WEEK IN YOUR MARKET</span>
            </div>
            {topMarket ? (
              <>
                <span className="text-[18px] leading-[1.35]">{topMarket.title}</span>
                <span className="text-[13px] text-brand-ink-2">
                  {topMarket.short}
                  {otherMarket.length > 0 && ` Plus ${otherMarket.length} more update${otherMarket.length === 1 ? "" : "s"} in Insights.`}
                </span>
              </>
            ) : (
              <span className="text-[15px]">A quiet week: no performance drops or competitor launches.</span>
            )}
            <PillLink href="/insights" className="self-start">
              See insights
            </PillLink>
          </section>

          {lead && (
            <section aria-label="Account lead" className="flex items-center gap-3 rounded-[12px] bg-white px-5 py-4">
              <Avatar name={lead} size={40} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px]">{lead}</span>
                <span className="text-[12px] text-brand-ink-2">Your account lead</span>
              </div>
              {messageProject && (
                <PillLink href={`/projects/${messageProject}?channel=klingit`} tone="outline" arrow={false} className="px-3.5">
                  Message
                </PillLink>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ href, bg, dot, label, value, suffix }: { href: string; bg: string; dot: string; label: string; value: string; suffix?: string }) {
  return (
    <Link href={href} className={cn("flex flex-col gap-7 rounded-[12px] p-5 text-brand-ink no-underline", bg)}>
      <span className="flex items-center gap-2 whitespace-nowrap font-brand-mono text-[12px]">
        <span className={cn("size-2 shrink-0", dot)} />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex items-baseline gap-2">
        <span className="text-[56px] font-light leading-none tabular-nums">{value}</span>
        {suffix && <span className="text-[18px] font-light text-brand-ink-2">{suffix}</span>}
      </span>
    </Link>
  );
}
