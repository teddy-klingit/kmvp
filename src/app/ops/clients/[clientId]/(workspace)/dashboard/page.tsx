import Link from "next/link";
import { AlertTriangle, Check } from "lucide-react";
import { getOpsViewer } from "@/lib/current-viewer";
import { loadToday } from "@/lib/today";
import { loadInline } from "@/lib/today-inline";
import { clientOverview } from "@/lib/client-overview";
import { hasAdmin } from "@/lib/role-tier";
import { internalStagePill } from "@/lib/ops-cockpit";
import { TaskRow } from "@/components/ops/today/task-row";
import { cn } from "@/lib/utils";

const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
const dayMonth = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
const METER = { ink: "bg-brand-ink", blue: "bg-[#5B6EB8]", purple: "bg-[#B455B6]" };

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
  const [inline, o] = await Promise.all([loadInline(today.tasks), clientOverview(clientId, today.projects, now, { money: Boolean(viewer && hasAdmin(viewer)) })]);
  const attention = today.projects.filter((p) => p.exceptions.length > 0);
  const quiet = today.projects.filter((p) => p.exceptions.length === 0);
  const shown = [...attention, ...quiet].slice(0, Math.max(5, attention.length));
  const more = today.projects.length - shown.length;
  const base = `/ops/clients/${clientId}`;

  return (
    <div className="grid grid-cols-1 gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card title={<>Waiting on you <span className="text-[13px] text-brand-ink-2">· {today.tasks.length}</span></>} link={{ label: "Same as in Today", href: `/ops?scope=all&client=${clientId}` }}>
          {today.tasks.length === 0 ? (
            <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">Nothing waiting on you for this client.</p>
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
            <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">Nothing dated coming up.</p>
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
            <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">No active projects.</p>
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
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Card title={`Balances · ${new Intl.DateTimeFormat("en-GB", { month: "long" }).format(now)}`} link={{ label: "Details", href: `${base}/balances` }}>
          <div className="flex flex-col gap-5 px-6 py-5">
            {o.oldPlan && <p className="m-0 text-[13px] text-brand-ink-2">On an old plan with one combined balance until it moves to a contract (Admin → Migration).</p>}
            {o.meters.map((m) => (
              <div key={m.label} className="flex flex-col gap-1.5">
                <span className="flex items-baseline gap-2">
                  <span className="flex-1 text-[14px]">{m.label}</span>
                  <span className="text-[22px] font-light tabular-nums">{Math.round(m.left).toLocaleString("en-GB")}</span>
                  <span className="text-[13px] text-brand-ink-2">of {Math.round(m.of).toLocaleString("en-GB")} left</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-brand-track">
                  <span className={cn("block h-full rounded-full", METER[m.tone])} style={{ width: `${m.of > 0 ? Math.max(0, Math.min(100, (m.left / m.of) * 100)) : 0}%` }} />
                </span>
                <span className={cn("text-[12px]", m.warn ? "text-brand-orange-text" : "text-brand-ink-2")}>{m.note}</span>
              </div>
            ))}
            {o.rollover && <p className="m-0 border-t border-brand-line pt-3 text-[12px] text-brand-ink-2">{o.rollover}</p>}
          </div>
        </Card>

        <Card title="Account health">
          <div className="flex flex-col gap-3 px-6 py-5">
            <span className="flex items-baseline gap-2">
              <span className="text-[32px] font-light">{o.health.word}</span>
              {o.health.fix > 0 && <span className="text-[13px] text-brand-ink-2">{o.health.fix} thing{o.health.fix === 1 ? "" : "s"} to fix</span>}
            </span>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
              {o.health.warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand-orange" strokeWidth={1.75} />
                  {w.replace(/^./, (c) => c.toUpperCase())}
                </li>
              ))}
              {o.health.ticks.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-[#5E6B2A]" strokeWidth={1.75} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="Contract" link={{ label: o.contract?.perMonth ? "Contract & billing" : "Contract", href: `${base}/contract` }}>
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
      </div>
    </div>
  );
}
