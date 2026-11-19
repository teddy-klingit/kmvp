import Link from "next/link";
import { AlertTriangle, Check } from "lucide-react";
import { getOpsViewer } from "@/lib/current-viewer";
import { loadToday } from "@/lib/today";
import { loadInline } from "@/lib/today-inline";
import { clientOverview } from "@/lib/client-overview";
import { balanceSummary } from "@/lib/client-credits";
import { onboarding } from "@/lib/client-onboarding";
import { checkIns, getProfile, pinnedNotes, readsFor } from "@/lib/client-notes";
import { prisma } from "@/lib/prisma";
import { ProfileRows } from "@/components/ops/client/profile-rows";
import { BalanceMeter, STAFF_TAG } from "@/components/ops/client/client-cards";
import { internalStagePill } from "@/lib/ops-cockpit";
import { TaskRow } from "@/components/ops/today/task-row";
import { cn } from "@/lib/utils";

const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
const dayMonth = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);

function Card({ title, link, children }: { title: React.ReactNode; link?: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[12px] bg-white">
      <header className="flex items-baseline gap-2 border-b border-brand-line px-6 py-4">
        <h2 className="m-0 flex-1 text-[18px] font-normal">{title}</h2>
        {link && (
          <Link href={link.href} className="font-brand-mono text-[12px] uppercase tracking-[0.04em] text-brand-ink">
            {link.label}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * Client → Overview (Phase T, design PMClient). Main: Waiting on you (the same tasks as Today, acting in place),
 * What's next, Projects that need attention. Side: three balances, account health as a word, the contract.
 */
export default async function ClientOverviewPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const viewer = await getOpsViewer();
  const now = new Date();
  const today = await loadToday({ mine: false, clientIds: [clientId] }, now, viewer);
  // Phase T2: no prices or invoices anywhere on the client page, admins included (they're in Admin).
  const [inline, o, balances, ob, pinned, ci, profile, reads, people, client] = await Promise.all([
    loadInline(today.tasks),
    clientOverview(clientId, today.projects, now, { money: false }),
    balanceSummary(clientId, now),
    onboarding(clientId, now),
    pinnedNotes(clientId),
    checkIns(clientId, now),
    getProfile(clientId),
    readsFor([clientId]),
    prisma.clientUser.findMany({ where: { clientId }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true } }),
  ]);
  // Account health takes the PM's read as one of its inputs.
  const read = reads.get(clientId);
  const health = { ...o.health, warnings: [...o.health.warnings], ticks: [...o.health.ticks] };
  if (read?.read === "at_risk") {
    health.warnings.unshift(`Your read: at risk${read.reason ? ` · ${read.reason}` : ""}`);
    health.word = "At risk";
  } else if (read?.read === "happy") health.ticks.unshift("Your read: happy");
  health.fix = health.warnings.length;
  const attention = today.projects.filter((p) => p.exceptions.length > 0);
  const quiet = today.projects.filter((p) => p.exceptions.length === 0);
  const shown = [...attention, ...quiet].slice(0, Math.max(5, attention.length));
  const more = today.projects.length - shown.length;
  const base = `/ops/clients/${clientId}`;

  return (
    <div className="grid grid-cols-1 gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        {ob.onboarding && (
          <>
            <Card title={<span className="flex flex-col gap-1"><span>Getting {client.name} started</span><span className="text-[13px] text-brand-ink-2">{ob.done} of {ob.total} done{ob.startsIn ? ` · contract starts in ${ob.startsIn} day${ob.startsIn === 1 ? "" : "s"}` : ""}</span></span>}>
              <span aria-hidden className="mx-6 mt-4 block h-1.5 overflow-hidden rounded-full bg-[#EFEBE2]">
                <span className="block h-full rounded-full bg-[#8D9E47]" style={{ width: `${(ob.done / ob.total) * 100}%` }} />
              </span>
              <ol className="m-0 mt-2 list-none p-0">
                {ob.steps.map((st) => (
                  <li key={st.key} className="flex items-center gap-4 border-t border-brand-line px-6 py-4 first:border-t-0">
                    <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border", st.done ? "border-[#8D9E47] bg-[#8D9E47] text-white" : "border-brand-outline")}>
                      {st.done && <Check className="size-3.5" strokeWidth={2.5} />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("text-[15px]", st.done && "text-brand-ink-2 line-through")}>{st.title}</span>
                      <span className="text-[13px] text-brand-ink-2">{st.detail}</span>
                    </span>
                    {st.action && (
                      <Link href={st.action.href} className={cn("inline-flex h-9 shrink-0 items-center rounded-full px-4 font-brand-mono text-[12px] no-underline", st.key === "kickoff" ? "bg-brand-ink text-white" : "border border-brand-ink text-brand-ink hover:bg-brand-ink hover:text-white")}>
                        {st.action.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
            <Card title="Client profile" link={{ label: "Edit profile", href: `${base}/notes?edit=profile#profile` }}>
              <ProfileRows profile={profile} editHref={`${base}/notes?edit=profile#profile`} />
            </Card>
          </>
        )}
        {!ob.onboarding && (
        <>
        <Card title={<>Waiting on you <span className="text-[13px] text-brand-ink-2">· {today.tasks.length}</span></>} link={{ label: "Same as in Today", href: `/ops?scope=all&client=${clientId}` }}>
          {today.tasks.length === 0 ? (
            <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">
              Nothing waiting on you right now. Log what you heard on your last call in{" "}
              <Link href={`${base}/notes#compose`} className="text-brand-ink underline underline-offset-4">
                Notes
              </Link>
              , or check what&apos;s coming in the Planner.
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {today.tasks.map((t) => (
                <TaskRow key={t.key} task={t} inline={inline[t.key]} compact />
              ))}
            </ul>
          )}
        </Card>

        <Card title="What's next" link={{ label: "Open Planner", href: `${base}/planner` }}>
          {o.next.length === 0 ? (
            <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">
              Nothing dated yet. Add their key dates to the{" "}
              <Link href={`${base}/notes?edit=profile#profile`} className="text-brand-ink underline underline-offset-4">
                profile
              </Link>{" "}
              (they go into the Planner), then plan the next month with them.
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {o.next.map((e) => (
                <li key={`${e.what}-${e.subject}-${e.at.toISOString()}`} className="flex items-center gap-4 border-t border-brand-line px-6 py-3 text-[14px] first:border-t-0">
                  <span className={cn("w-24 shrink-0", e.soon && "text-brand-orange-text")}>{dayLabel(e.at)}</span>
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", e.soon ? "bg-brand-orange" : "bg-brand-ink")} />
                  <span className="min-w-0 flex-1">
                    {e.what} · {e.subject}
                  </span>
                  <span className="text-[13px] text-brand-ink-2">{e.waitsFor}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={<>Projects <span className="text-[13px] text-brand-ink-2">· {today.projects.length} active</span></>} link={{ label: "All projects", href: `${base}/projects` }}>
          {today.projects.length === 0 ? (
            <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">
              No active projects. Start one with{" "}
              <Link href={`/ops/projects/new?clientId=${clientId}`} className="text-brand-ink underline underline-offset-4">
                + New project
              </Link>
              , or turn one of their opportunities into a brief.
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {shown.map((p) => {
                const pill = p.exceptions.length ? p.exceptions[0].kindLabel : internalStagePill(p.state);
                const creator = p.project.team?.members.find((m) => ["ART_DIRECTOR", "COPYWRITER", "MOTION_DESIGNER"].includes(m.staffMember.title))?.staffMember.user.name ?? "–";
                const date = p.state.keyFacts.firstDraftEta ?? p.project.dueDate;
                return (
                  <li key={p.project.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-brand-line px-6 py-3 text-[14px] first:border-t-0 sm:grid-cols-[minmax(0,1fr)_150px_70px_80px]">
                    <Link href={`/ops/projects/${p.project.id}`} className="truncate text-brand-ink no-underline hover:underline">
                      {p.project.name}
                    </Link>
                    <span className={cn("justify-self-start rounded-full px-2.5 py-0.5 text-[12px]", p.exceptions.length ? "bg-[#FDEBDD] text-brand-orange-text" : "bg-brand-page text-brand-ink-2")}>{pill}</span>
                    <span className="text-[13px] text-brand-ink-2">{date ? dayMonth(date) : ""}</span>
                    <span className="text-[13px] text-brand-ink-2">{creator}</span>
                  </li>
                );
              })}
              {more > 0 && <li className="border-t border-brand-line px-6 py-3 text-[13px] text-brand-ink-2">+ {more} more running on their own</li>}
            </ul>
          )}
        </Card>
        </>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Card title={balances.some((b) => b.state === "pending") ? "Credits" : `Balances · ${new Intl.DateTimeFormat("en-GB", { month: "long" }).format(now)}`} link={{ label: "Credits", href: `${base}/credits` }}>
          <div className="flex flex-col gap-5 px-6 py-5">
            {balances.map((b) => (
              <BalanceMeter key={b.key} b={b} />
            ))}
            {o.rollover && balances.some((b) => b.state === "live" && b.key !== "ai") && <p className="m-0 border-t border-brand-line pt-3 text-[12px] text-brand-ink-2">{o.rollover}</p>}
          </div>
        </Card>

        {ob.onboarding && (
          <Card title="Next check-in">
            <div className="flex flex-col gap-3 px-6 py-5">
              <span className="text-[20px] font-light">{ci.next ? `${ci.next.kind.replace(/^./, (c) => c.toUpperCase())} · ${dayLabel(ci.next.at)}` : `${ob.steps.find((x) => x.key === "kickoff")?.done ? "Monthly review" : "Kick-off"} · not booked`}</span>
              <span className="text-[13px] text-brand-ink-2">After that: a monthly review. A check-in puts a task on your Today the day before.</span>
              {!ci.next && (
                <Link href={`${base}/notes#relationship`} className="inline-flex h-10 items-center justify-center rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white no-underline">
                  Book {ob.steps.find((x) => x.key === "kickoff")?.done ? "the review" : "kick-off"}
                </Link>
              )}
            </div>
          </Card>
        )}

        <Card title={<>Pinned notes {STAFF_TAG}</>} link={{ label: "All notes", href: `${base}/notes` }}>
          <div className="flex flex-col gap-3 px-6 py-5">
            {pinned.length ? (
              pinned.map((n) => (
                <Link key={n.id} href={`${base}/notes#note-${n.id}`} className="flex flex-col gap-1 rounded-r-lg border-l-[3px] border-[#E8B931] bg-[#FDF7E4] px-4 py-3 text-brand-ink no-underline">
                  <span className="text-[14px] leading-snug">{[n.title, n.body].filter(Boolean).join(". ").slice(0, 180)}</span>
                  <span className="text-[12px] text-brand-ink-2">
                    {n.author} · {dayMonth(n.createdAt)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="m-0 text-[13px] text-brand-ink-2">
                Nothing pinned. Pin what everyone on {client.name} should know in{" "}
                <Link href={`${base}/notes`} className="text-brand-ink underline underline-offset-4">
                  Notes
                </Link>
                .
              </p>
            )}
            {!ob.onboarding && <span className="text-[12px] text-brand-ink-2">Next check-in: {ci.next ? `${dayLabel(ci.next.at)} · ${ci.next.kind}` : "not booked"}</span>}
          </div>
        </Card>

        {ob.onboarding && (
          <Card title="People">
            <ul className="m-0 flex list-none flex-col gap-3 px-6 py-5 text-[13px]">
              {people.map((u) => (
                <li key={u.id} className="flex flex-col">
                  <span className="text-[14px]">
                    {u.user.name}
                    {u.jobTitle ? ` · ${u.jobTitle}` : ""}
                  </span>
                  <span className="text-brand-ink-2">{[u.permission === "OWNER" ? "Admin · approves estimates" : u.permission === "APPROVER" ? "Approves work" : "Can view", u.permission === "OWNER" ? profile?.preferences.contact : null].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
              <li className="text-brand-ink-2">Anyone else who should see strategy or approve work? Ask {ob.first} to invite them.</li>
              <li className="border-t border-brand-line pt-3 text-brand-ink-2">Klingit: you as Marketing PM · creatives are picked per project.</li>
            </ul>
          </Card>
        )}

        {!ob.onboarding && (
        <Card title="Account health">
          <div className="flex flex-col gap-3 px-6 py-5">
            <span className="flex items-baseline gap-2">
              <span className="text-[32px] font-light">{health.word}</span>
              {health.fix > 0 && <span className="text-[13px] text-brand-ink-2">{health.fix} thing{health.fix === 1 ? "" : "s"} to fix</span>}
            </span>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
              {health.warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand-orange" strokeWidth={1.75} />
                  {w.replace(/^./, (c) => c.toUpperCase())}
                </li>
              ))}
              {health.ticks.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-[#5E6B2A]" strokeWidth={1.75} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </Card>

        )}
        {!ob.onboarding && (
        <Card title="Contract" link={{ label: "Credits", href: `${base}/credits` }}>
          {o.contract ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-6 py-5 text-[13px]">
              {[
                ["Per month", o.contract.perMonth],
                ["Pack", o.contract.pack],
                ["Term", o.contract.term],
                ["Notice by", o.contract.notice],
                ["Renews", o.contract.renews],
                ["Next invoice", o.contract.nextInvoice],
              ]
                .filter((r): r is [string, string] => Boolean(r[1]))
                .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-brand-ink-2">{k}</dt>
                  <dd className="m-0 text-right tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="m-0 px-6 py-5 text-[13px] text-brand-ink-2">No contract yet: still on an old plan.</p>
          )}
        </Card>
        )}
      </div>
    </div>
  );
}
