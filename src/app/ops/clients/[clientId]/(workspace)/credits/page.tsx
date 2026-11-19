import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOpsPage } from "@/lib/authz";
import { creditsTab, parseCreditsPeriod, type BalanceKey } from "@/lib/client-credits";
import { addToNextReviewAction } from "@/lib/actions/client-note-actions";
import { BALANCE_COLOR, BalanceMeter, MonthBars, OpsCard } from "@/components/ops/client/client-cards";
import { MessagePmButton } from "@/components/pm-panel/pm-panel-provider";
import { cn } from "@/lib/utils";

const SHOWN = 12;
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
const POOL_LABEL: Record<BalanceKey, string> = { pm: "PM", creative: "Creative", ai: "AI" };
const POOL_PILL: Record<BalanceKey, string> = { pm: "bg-[#E9ECF7] text-[#3E4E8C]", creative: "bg-[#EFEBE2] text-brand-ink", ai: "bg-[#F8DCF9] text-[#8E3A90]" };

/**
 * Client page → Credits (Phase T2, design PMClientCredits): the three balances with 6 months of use, the monthly
 * grant and this month's forecast, what the credits went to, every credit movement, simple advice, and the contract
 * without prices. Pack changes are agreed with the client and set up by an admin.
 */
export default async function CreditsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ period?: string; pool?: string; added?: string }> }) {
  await requireOpsPage(["ADMIN", "PM"]);
  const [{ clientId }, q] = await Promise.all([params, searchParams]);
  if (!(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) notFound();
  const period = parseCreditsPeriod(q.period);
  const pool = q.pool === "pm" || q.pool === "creative" || q.pool === "ai" ? q.pool : null;
  const t = await creditsTab(clientId, { period });
  const base = `/ops/clients/${clientId}/credits`;
  const href = (p: { period?: string; pool?: string | null }) => {
    const sp = new URLSearchParams({ ...(period !== "6m" ? { period } : {}), ...(pool ? { pool } : {}) });
    for (const [k, v] of Object.entries(p)) {
      if (v === null || v === undefined || (k === "period" && v === "6m")) sp.delete(k);
      else sp.set(k, v);
    }
    return `${base}${sp.size ? `?${sp}` : ""}`;
  };
  const moves = pool ? t.moves.filter((m) => m.balance === pool) : t.moves;
  const forecastMonth = t.monthLabel;
  const adviceText = t.advice.filter((a) => a.tone === "warn").map((a) => [a.text, a.strong].filter(Boolean).join(" ")).join(" ");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Period" className="flex flex-wrap gap-2">
          {(
            [
              ["month", forecastMonth],
              ["6m", "Last 6 months"],
              ["contract", "Contract to date"],
            ] as const
          ).map(([k, label]) => (
            <Link key={k} href={href({ period: k })} aria-current={period === k ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full border px-4 text-[13px] no-underline", period === k ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white text-brand-ink hover:border-brand-ink")}>
              {label}
            </Link>
          ))}
        </nav>
        <span className="text-[12px] text-brand-ink-2">Bars: used per month · dashed line: monthly grant · hatched: forecast for {forecastMonth}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-3">
        {t.balances.map((b) => (
          <section key={b.key} className={cn("flex flex-col gap-5 rounded-[12px] bg-white px-6 py-5", b.state === "none" && "opacity-70")}>
            <BalanceMeter b={b} big />
            {b.state !== "none" && t.bars[b.key].some((x) => x.used > 0) && <MonthBars bars={t.bars[b.key]} grant={t.grant[b.key]} color={BALANCE_COLOR[b.key]} />}
            {t.topUses[b.key].length > 0 ? (
              <ul className="m-0 flex list-none flex-col p-0 text-[13px]">
                {t.topUses[b.key].map((u) => (
                  <li key={u.label} className="flex justify-between gap-3 border-t border-brand-line py-2 first:border-t-0">
                    <span className="min-w-0 truncate">{u.label}</span>
                    <span className="shrink-0 tabular-nums">{u.value.toLocaleString("en-GB")}{u.suffix ? ` ${u.suffix}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[13px] text-brand-ink-2">{b.state === "pending" ? "Nothing used yet: the first grant comes when the contract starts." : b.state === "none" ? "Add a team pack on the contract to use these." : "Nothing used in this period yet."}</p>
            )}
          </section>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <OpsCard
          title={
            <span className="flex flex-wrap items-center gap-3">
              Every credit movement
              <span className="ml-auto flex gap-1.5">
                {([null, "pm", "creative", "ai"] as const).map((p) => (
                  <Link key={p ?? "all"} href={href({ pool: p })} aria-current={pool === p ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-full border px-3 text-[13px] no-underline", pool === p ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline text-brand-ink hover:border-brand-ink")}>
                    {p ? POOL_LABEL[p] : "All"}
                  </Link>
                ))}
              </span>
            </span>
          }
        >
          {moves.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-[13px]">
                <tbody>
                  {moves.slice(0, SHOWN).map((m, i) => (
                    <tr key={i} className="border-t border-brand-line first:border-t-0">
                      <td className="whitespace-nowrap py-3 pl-6 pr-3 text-brand-ink-2">{day(m.at)}</td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-block w-[84px] rounded-md px-2 py-0.5 text-[12px]", POOL_PILL[m.balance])}>{POOL_LABEL[m.balance]}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums">{m.amount}</td>
                      <td className="px-3 py-3">{m.what}</td>
                      <td className="py-3 pl-3 pr-6 text-right text-brand-ink-2">{m.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {moves.length > SHOWN && (
                <details className="border-t border-brand-line">
                  <summary className="cursor-pointer list-none px-6 py-3 font-brand-mono text-[12px] uppercase text-brand-ink underline underline-offset-4">All {moves.length}</summary>
                  <table className="w-full min-w-[620px] border-collapse text-[13px]">
                    <tbody>
                      {moves.slice(SHOWN).map((m, i) => (
                        <tr key={i} className="border-t border-brand-line">
                          <td className="whitespace-nowrap py-3 pl-6 pr-3 text-brand-ink-2">{day(m.at)}</td>
                          <td className="px-3 py-3">
                            <span className={cn("inline-block w-[84px] rounded-md px-2 py-0.5 text-[12px]", POOL_PILL[m.balance])}>{POOL_LABEL[m.balance]}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 tabular-nums">{m.amount}</td>
                          <td className="px-3 py-3">{m.what}</td>
                          <td className="py-3 pl-3 pr-6 text-right text-brand-ink-2">{m.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          ) : (
            <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">No credit movements in this period yet. Grants, project use and skill runs show here as they happen.</p>
          )}
        </OpsCard>

        <div className="flex min-w-0 flex-col gap-6">
          <OpsCard title="What to do about it">
            <div className="flex flex-col gap-3 px-6 py-5 text-[14px] leading-[1.5]">
              {q.added && <p className="m-0 rounded-lg bg-[#EEF4DA] px-3 py-2 text-[13px]">Added to the next review, in the account log.</p>}
              {t.advice.length ? (
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {t.advice.map((a) => (
                    <li key={a.text} className="flex gap-2.5">
                      {a.tone === "warn" ? <AlertTriangle className="mt-1 size-3.5 shrink-0 text-brand-orange" strokeWidth={2} /> : <Check className="mt-1 size-3.5 shrink-0 text-[#6E7D2F]" strokeWidth={2} />}
                      <span>
                        {a.text} {a.strong && <b className="font-semibold">{a.strong}</b>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-brand-ink-2">Nothing to change: every balance fits how they work.</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {adviceText && (
                  <form action={addToNextReviewAction}>
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="text" value={adviceText} />
                    <button type="submit" className="inline-flex h-9 items-center rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white">
                      Add to next review
                    </button>
                  </form>
                )}
                <MessagePmButton clientId={clientId} dot={false} className="inline-flex h-9 items-center rounded-full border border-brand-outline bg-white px-4 font-brand-mono text-[12px] text-brand-ink hover:border-brand-ink">
                  Draft a note to {t.contact}
                </MessagePmButton>
              </div>
              <p className="m-0 text-[12px] text-brand-ink-2">Pack changes are agreed with the client and set up by an admin. Prices are not shown here.</p>
            </div>
          </OpsCard>

          <OpsCard title="Contract">
            {t.contract ? (
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-6 py-5 text-[13px]">
                {[
                  ["Pack", t.contract.pack],
                  ["Term", t.contract.term],
                  ["Notice by", t.contract.notice],
                  ["Renewal", t.contract.renewal],
                  ["Rollover", t.contract.rollover],
                  ["Fixed monthly services", t.contract.services],
                ]
                  .filter((r): r is [string, string] => Boolean(r[1]))
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-brand-ink-2">{k}</dt>
                      <dd className="m-0 text-right">{v}</dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <p className="m-0 px-6 py-5 text-[13px] text-brand-ink-2">No contract yet: still on an old plan. An admin moves it to a contract in Admin → Migration.</p>
            )}
          </OpsCard>
        </div>
      </div>
    </div>
  );
}
