import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { FORECAST_METHOD, loadMyUsage, loadUsage } from "@/lib/usage";
import { slotUsage } from "@/lib/active-slots";
import { klingitChatHref } from "@/lib/client-home";
import { formatDay } from "@/lib/project-state";
import { CardNote, CardRows, SectionCard } from "@/components/ds/card";
import { Avatar } from "@/components/ds/avatar";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { ColumnChart } from "@/components/insights/charts";
import { AiCreditMeter } from "@/components/portal/skills/ai-credit-meter";
import { AiPerDay } from "@/components/portal/usage/ai-per-day";
import { Breakdown } from "@/components/portal/usage/breakdown";
import { TopUpButton } from "@/components/portal/top-up/top-up-panel";
import { AddSlotDialog } from "@/components/portal/add-slot-dialog";
import { cn } from "@/lib/utils";
import { quoteRequest } from "@/lib/requests";
import { poolNotes, poolOf, teamBalances } from "@/lib/team-ledger";
import { money } from "@/lib/invoicing";

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);

/**
 * Settings → Usage (nav v3, 08). Admins: team and AI credits for the month with forecasts, AI credits per day,
 * where both kinds of credits go, by team member, the plan, top-ups, billing and the monthly history. Members get
 * My usage: their own credits only. Who sees what is decided here, on the server.
 */
export default async function UsagePage() {
  const viewer = await getPortalViewer();
  if (!isClientAdmin(viewer)) return <MyUsage clientId={viewer.clientId} userId={viewer.userId} />;

  const [u, slots, plans, bundles, pendingTopUp, invoices, owner, chat] = await Promise.all([
    loadUsage(viewer.clientId),
    slotUsage(viewer.clientId),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, where: { tier: { not: "ENTERPRISE" } } }),
    Promise.all([1, 2, 4].map((count) => quoteRequest(viewer.clientId, "ai_topup", { count }).then((q) => ({ id: String(count), size: q.credits, price: q.price != null ? money(q.price, q.currency) : "—" })))),
    prisma.purchaseRequest.findFirst({ where: { clientId: viewer.clientId, kind: "ai_topup", status: "pending" } }),
    prisma.invoice.findMany({ where: { clientId: viewer.clientId, status: { not: "DRAFT" } }, orderBy: { issuedAt: "desc" }, take: 4 }),
    prisma.clientUser.findFirst({ where: { clientId: viewer.clientId, permission: "OWNER" }, include: { user: { select: { email: true } } } }),
    klingitChatHref(viewer.clientId),
  ]);
  const billing = await prisma.billingProfile.findUnique({ where: { clientId: viewer.clientId } });
  const pools = await teamBalances(viewer.clientId);
  const { ai, team } = u;
  const teamLeft = team.free ?? 0;
  const runOut = ai.reachedDay && ai.runsOutBeforeReset ? new Date(Date.UTC(u.period.start.getUTCFullYear(), u.period.start.getUTCMonth(), ai.reachedDay)) : null;
  const teamForecast = team.used + team.awaiting;

  return (
    <div className="flex flex-col gap-6">
      {/* Team and AI credits this month */}
      <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-2">
        {pools ? (
          // Phase S: on a contract, PM and creative are two balances, never pooled (the table below has the detail).
          <section aria-label="PM and creative credits" className="flex flex-col gap-4 rounded-[12px] bg-white px-6 py-5">
            <span className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 rounded-[3px] bg-brand-ink" />
              <span className="flex-1 text-[16px]">PM and creative credits</span>
              <span className="text-[12px] text-brand-mute">Klingit team time · 1 credit ≈ 1 hour</span>
            </span>
            {(["pm", "creative"] as const)
              .filter((k) => pools[k].monthly > 0 || pools[k].left > 0)
              .map((k) => {
                const p = pools[k];
                const of = poolOf(p);
                return (
                  <span key={k} className="flex flex-col gap-2">
                    <span className="flex items-baseline gap-2">
                      <span className="w-[72px] text-[14px]">{k === "pm" ? "PM" : "Creative"}</span>
                      <span className="text-[32px] font-light leading-none tabular-nums">{n(p.left)}</span>
                      <span className="text-[14px] text-brand-ink-2">left of {n(of)}{p.monthly > 0 ? " a month" : ""}</span>
                    </span>
                    <span className="flex h-2 overflow-hidden rounded-full bg-brand-line" role="img" aria-label={`${n(p.left)} of ${n(of)} left`}>
                      <span className="h-full bg-brand-ink" style={{ width: `${of ? Math.max(0, Math.min(100, ((of - p.left) / of) * 100)) : 0}%` }} />
                    </span>
                    {poolNotes(p).length > 0 && <span className="text-[12px] text-brand-ink-2">{poolNotes(p).join(" · ")}</span>}
                  </span>
                );
              })}
            {team.awaiting > 0 && (
              <p className="m-0 flex items-center gap-2 rounded-[10px] bg-brand-page px-4 py-2.5 text-[13px]">
                <span aria-hidden className="size-2 rounded-full bg-[#BDB6A8]" />
                {n(team.awaiting)} held for estimates waiting on you.
              </p>
            )}
          </section>
        ) : (
        <section aria-label="Team credits" className="flex flex-col gap-4 rounded-[12px] bg-white px-6 py-5">
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-brand-ink" />
            <span className="flex-1 text-[16px]">Team credits</span>
            <span className="text-[12px] text-brand-mute">Klingit team time · 1 credit = 1 hour</span>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-[44px] font-light leading-none tabular-nums">{n(teamLeft)}</span>
            <span className="text-[14px] text-brand-ink-2">left of {n(team.available ?? 0)}</span>
          </span>
          <span className="relative flex h-2 overflow-hidden rounded-full bg-brand-line" role="img" aria-label={`${team.used} used, ${team.awaiting} held, ${teamLeft} left`}>
            <span className="h-full bg-brand-ink" style={{ width: `${Math.min(100, (team.used / Math.max(1, team.available ?? 1)) * 100)}%` }} />
            <span className="h-full bg-[repeating-linear-gradient(135deg,#BDB6A8_0_3px,transparent_3px_6px)]" style={{ width: `${Math.min(100, (team.awaiting / Math.max(1, team.available ?? 1)) * 100)}%` }} />
          </span>
          <span className="flex gap-4 text-[12px] text-brand-ink-2">
            <span>■ Used {n(team.used)}</span>
            <span>▨ Held {n(team.awaiting)}</span>
            <span>□ Left {n(teamLeft)}</span>
          </span>
          <p className="m-0 flex items-center gap-2 rounded-[10px] bg-brand-page px-4 py-2.5 text-[13px]">
            <span aria-hidden className={cn("size-2 rounded-full", teamForecast <= (team.available ?? 0) ? "bg-[#8D9E47]" : "bg-brand-orange")} />
            Forecast: {n(teamForecast)} of {n(team.available ?? 0)} by {day(new Date(u.period.end.getTime() - 86400000))}, based on approved and waiting estimates. {teamForecast <= (team.available ?? 0) ? "On track." : "Over the plan."}
          </p>
        </section>
        )}

        <section aria-label="AI credits" className="flex flex-col gap-4 rounded-[12px] bg-white px-6 py-5">
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-[#B455B6]" />
            <span className="flex-1 text-[16px]">AI credits</span>
            <span className="text-[12px] text-brand-mute">LLM use by skills and assistants</span>
          </span>
          {ai.ownModel ? (
            <p className="m-0 text-[15px] leading-[1.5]">Your skills run on your own Claude, so they use 0 Klingit AI credits and your provider bills the tokens: {n(ai.providerTokens)} tokens this month.</p>
          ) : (
            <>
              <span className="flex items-baseline gap-2">
                <span className="text-[44px] font-light leading-none tabular-nums">{n(ai.left)}</span>
                <span className="text-[14px] text-brand-ink-2">
                  left of {n(ai.allowance)}
                  {ai.bundleLeft > 0 ? ` + ${n(ai.bundleLeft)} from bundles` : ""}
                </span>
              </span>
              <AiCreditMeter used={ai.used} allowance={ai.allowance} />
              <span className="flex gap-4 text-[12px] text-brand-ink-2">
                <span>■ Used {n(ai.used)}</span>
                <span>□ Left {n(ai.left)}</span>
              </span>
              {ai.runsOutBeforeReset ? (
                <p className="m-0 flex flex-wrap items-center gap-2 rounded-[10px] bg-brand-peach-pale px-4 py-2.5 text-[13px]" title={FORECAST_METHOD}>
                  <span aria-hidden className="size-2 rounded-full bg-brand-orange" />
                  <span className="flex-1">Forecast: runs out around {runOut ? <b className="font-semibold">{day(runOut)}</b> : "the end of the month"} at this pace.</span>
                  <Link href="#top-up" className="rounded-full bg-brand-ink px-3 py-1.5 font-brand-mono text-[11px] text-white no-underline">
                    Top up
                  </Link>
                </p>
              ) : (
                <p className="m-0 flex items-center gap-2 rounded-[10px] bg-brand-page px-4 py-2.5 text-[13px]" title={FORECAST_METHOD}>
                  <span aria-hidden className="size-2 rounded-full bg-[#8D9E47]" />
                  Forecast: {n(ai.projected)} of {n(ai.allowance)} by the reset on {day(u.period.nextReset)}. On track.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      {pools && (
        // Phase S: AI, PM and creative are three ledgers; fixed monthly services are their own lines.
        <section aria-label="Team credits by balance" className="overflow-hidden rounded-[12px] bg-white">
          <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[18px] font-normal">PM and creative credits this month</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-brand-ink-2">
                  {["", "A month", "Carried over", "Bought", "Used", "Fixed services", "Expired", "Left"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-right font-medium first:pl-6 first:text-left last:pr-6">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["pm", "creative"] as const).map((k) => {
                  const p = pools[k];
                  return (
                    <tr key={k} className="border-t border-brand-line tabular-nums">
                      <td className="py-3 pl-6 pr-3 text-left">{k === "pm" ? "PM" : "Creative"}</td>
                      {[p.monthly, p.carried, p.purchased, p.used, p.services, p.expired].map((v, i) => (
                        <td key={i} className="px-3 py-3 text-right">
                          {n(v)}
                        </td>
                      ))}
                      <td className="py-3 pl-3 pr-6 text-right font-semibold">{n(p.left)}</td>
                    </tr>
                  );
                })}
                {pools.services.map((svc) => (
                  <tr key={svc.id} className="border-t border-brand-line text-brand-ink-2">
                    <td className="py-3 pl-6 pr-3 text-left" colSpan={5}>
                      {svc.name} · fixed monthly service{svc.outsidePack ? " (billed on its own)" : ""}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{svc.outsidePack ? "—" : n(svc.creditsPerMonth)}</td>
                    <td className="py-3 pl-3 pr-6 text-right" colSpan={2}>
                      until {day(svc.until)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 px-6 py-4 text-[12px] text-brand-ink-2">PM and creative credits roll over up to 150% of the monthly amount; fixed services never roll over. AI credits are above.</p>
        </section>
      )}

      <AiPerDay
        perDay={ai.perDay}
        lastMonth={ai.lastMonth}
        months={ai.months}
        method={FORECAST_METHOD}
        footer={
          <p className="m-0 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-brand-ink-2">
            <span key="average">
              Average <b className="font-semibold text-brand-ink">{n(ai.average)}</b> a day
            </span>
            {ai.busiest && (
              <span key="busiest">
                Busiest: {day(new Date(Date.UTC(u.period.start.getUTCFullYear(), u.period.start.getUTCMonth(), ai.busiest.day)))}
                {ai.busiest.top ? ` (${ai.busiest.top.name} × ${ai.busiest.top.count})` : ""}
              </span>
            )}
            {ai.reachedDay && (
              <span key="reached">
                Allowance {n(ai.allowance)} reached ≈ <span className="text-brand-orange-text">{day(new Date(Date.UTC(u.period.start.getUTCFullYear(), u.period.start.getUTCMonth(), ai.reachedDay)))}</span>
              </span>
            )}
            <span key="reset" className="flex-1 text-right" title={FORECAST_METHOD}>
              Next reset {day(u.period.nextReset)} · forecast = average a day × days left
            </span>
          </p>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Breakdown
            title="Where AI credits go"
            meta={`${n(ai.usedThisMonth)} this month`}
            kind="ai"
            tabs={[
              { label: "By skill & assistant", rows: ai.bySource },
              { label: "By project", rows: ai.byProject },
              { label: "By format", rows: ai.byFormat },
              { label: "By person", rows: ai.byPerson },
            ]}
            footer={
              <span className="flex flex-wrap gap-4 text-[12px] text-brand-ink-2">
                <span>
                  <span className="mr-1 inline-block size-2 rounded-[2px] bg-[#B455B6]" />
                  Skills {n(ai.totals.skills)}
                </span>
                <span>
                  <span className="mr-1 inline-block size-2 rounded-[2px] bg-[#D9A7DA]" />
                  Assistants {n(ai.totals.assistants)}
                </span>
              </span>
            }
          />
          <Breakdown
            title="Where team credits go"
            meta={`${n(team.used)} used · ${n(team.awaiting)} held`}
            kind="team"
            tabs={[
              { label: "By project", rows: team.byProject },
              { label: "By format", rows: team.byFormat },
              { label: "By person", rows: team.byPerson },
            ]}
            footer={team.heldNote ? <span className="text-[13px] text-brand-ink-2">{team.heldNote} until you approve it.</span> : undefined}
          />
          <SectionCard title="By team member">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="text-[12px] text-brand-mute">
                  <th className="px-6 py-3 text-left font-normal">Person</th>
                  <th className="px-6 py-3 text-right font-normal">Team credits</th>
                  <th className="px-6 py-3 text-right font-normal">AI credits</th>
                </tr>
              </thead>
              <tbody>
                {u.members.map((m) => (
                  <tr key={m.id} className="border-t border-brand-line">
                    <td className="px-6 py-3">
                      <span className="flex items-center gap-3">
                        <Avatar name={m.name} size={26} />
                        {m.name} <span className="text-[12px] text-brand-mute">{m.role}</span>
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">{n(m.team)}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{n(m.ai)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <CardNote>Members only see their own row, under Settings → My usage.</CardNote>
          </SectionCard>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <SectionCard title="Plan" action={<span className="font-brand-mono text-[12px] uppercase text-brand-ink">Renews {day(u.period.nextReset)}</span>}>
            <div className="flex flex-col gap-2.5 px-5 py-5">
              {plans.map((p) => {
                const current = p.tier === viewer.client.planTier;
                return (
                  <div key={p.tier} className={cn("flex flex-col gap-0.5 rounded-[10px] border px-4 py-3", current ? "border-2 border-brand-ink" : "border-brand-line")}>
                    <span className="flex items-center gap-2">
                      <span className="flex-1 text-[14px] font-semibold">{p.name}</span>
                      {current && <span className="rounded-full bg-brand-lime-pale px-2 py-0.5 text-[11px]">Current</span>}
                    </span>
                    <span className="text-[13px] text-brand-ink-2">{p.ownModel ? "Your own AI model" : `${n(p.monthlyAiCredits)} AI credits / month`}</span>
                    {p.ownModel && <span className="text-[12px] leading-[1.45] text-brand-mute">Runs on your Claude / OpenAI account via Connections. Your provider bills the tokens; Klingit shows usage.</span>}
                    {current && !p.ownModel && (
                      <span className="text-[12px] text-brand-mute">
                        {p.monthlyTeamCredits} team credits · {p.activeSlots} active slots
                      </span>
                    )}
                  </div>
                );
              })}
              <span className="flex items-center justify-between pt-1">
                <Link href={chat} className="inline-flex h-8 items-center rounded-full border border-brand-outline px-3 font-brand-mono text-[11px] text-brand-ink no-underline">
                  Change plan
                </Link>
                <PlaceholderTag />
              </span>
            </div>
          </SectionCard>

          <section id="top-up" aria-label="Top up AI credits" className="scroll-mt-6 overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[18px] font-normal">Top up AI credits</h2>
            <div className="flex flex-col gap-3 px-6 py-5">
              <p className="m-0 text-[14px] leading-[1.5] text-brand-ink-2">1,000 credits and up, added right away and on your next invoice. Top-ups don&apos;t expire at the end of the month; they&apos;re used after your monthly credits.</p>
              {pendingTopUp && <p className="m-0 text-[14px]">{`${n(Number((pendingTopUp.payload as { credits?: number }).credits ?? 0))} AI credits requested ${formatDay(pendingTopUp.createdAt)}: waiting for Klingit to approve.`}</p>}
              <TopUpButton className="self-start inline-flex h-10 items-center rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white">Top up AI credits</TopUpButton>
            </div>
          </section>

          <SectionCard id="billing" title="Billing" action={invoices.length ? <span className="font-brand-mono text-[12px] uppercase text-brand-ink">{invoices.length} recent</span> : undefined}>
            {invoices.length === 0 ? (
              <CardNote>No invoices yet.</CardNote>
            ) : (
              <CardRows>
                {invoices.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-6 py-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[14px]">
                        {money(i.amount, i.currency)}
                        {i.vatAmount ? <span className="text-brand-ink-2"> incl. VAT</span> : null}
                        {i.status === "OVERDUE" && <span className="text-brand-orange-text"> · overdue</span>}
                      </span>
                      <span className="text-[12px] text-brand-mute">
                        {i.number}
                        {i.issuedAt ? ` · ${formatDay(i.issuedAt)}` : ""}
                        {i.dueAt && i.status !== "PAID" ? ` · due ${formatDay(i.dueAt)}` : ""} · {i.status.toLowerCase()}
                      </span>
                    </span>
                    <Link href={`/settings/usage/invoices/${i.id}`} className="font-brand-mono text-[11px] text-brand-ink underline underline-offset-2">
                      PDF
                    </Link>
                  </li>
                ))}
              </CardRows>
            )}
            <p className="m-0 border-t border-brand-line px-6 py-4 text-[13px] leading-[1.5] text-brand-ink-2">
              Paid by invoice{billing?.paymentTermsDays ? `, ${billing.paymentTermsDays} days` : ""} · to {billing?.invoiceEmail ?? owner?.user.email ?? "your account owner"} ·{" "}
              <Link href="/settings/billing" className="text-brand-ink underline underline-offset-2">
                Billing details
              </Link>
            </p>
          </SectionCard>
        </aside>
      </div>

      <section aria-label="Monthly history" className="overflow-hidden rounded-[12px] bg-white">
        <div className="flex items-center border-b border-brand-line px-6 py-5">
          <h2 className="m-0 flex-1 text-[18px] font-normal">Monthly history</h2>
          <span className="font-brand-mono text-[12px] uppercase text-brand-ink">Last 6 months</span>
        </div>
        <div className="grid grid-cols-1 gap-8 px-6 py-5 min-[900px]:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-[15px]">Team credits</span>
            <span className="text-[13px] text-brand-mute">Allowance {n(team.allowance ?? 0)} a month</span>
            <ColumnChart data={team.months.map((m) => ({ x: m.label, values: [m.used] }))} series={[{ name: "Team credits", color: "#1E1E1E" }]} height={170} xEvery={1} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[15px]">AI credits</span>
            <span className="text-[13px] text-brand-mute">Allowance {n(ai.allowance)} a month</span>
            <ColumnChart data={u.aiMonths6.map((m) => ({ x: m.label, values: [m.used] }))} series={[{ name: "AI credits", color: "#B455B6" }]} height={170} xEvery={1} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-brand-line px-6 py-4 text-[14px]">
          <span className="flex-1 min-[700px]:flex-none">Active slots</span>
          <span className="flex gap-1.5" aria-hidden>
            {Array.from({ length: Math.max(slots.total, slots.used) }, (_, i) => (
              <span key={i} className={cn("h-2 w-10 rounded-full", i < slots.used ? "bg-brand-ink" : "border border-dashed border-brand-mute")} />
            ))}
          </span>
          <span>
            {slots.used} of {slots.total} in use
          </span>
          <span className="flex-1" />
          <AddSlotDialog planName={viewer.client.planTier.charAt(0) + viewer.client.planTier.slice(1).toLowerCase()} slots={slots.total} contactHref={chat} />
        </div>
      </section>
    </div>
  );
}

/** My usage (members): their own team and AI credits this month, nothing about anyone else. */
async function MyUsage({ clientId, userId }: { clientId: string; userId: string }) {
  const me = await loadMyUsage(clientId, userId);
  return (
    <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-2">
      <SectionCard title="Your team credits" action={<span className="font-brand-mono text-[12px] uppercase text-brand-ink">{me.label}</span>}>
        <div className="flex flex-col gap-3 px-6 py-5">
          <span className="text-[40px] font-light leading-none tabular-nums">{n(me.team)}</span>
          <span className="text-[14px] text-brand-ink-2">from estimates you approved this month</span>
          {me.teamByProject.map((r) => (
            <span key={r.key} className="flex justify-between text-[14px]">
              <span>{r.label}</span>
              <span className="tabular-nums">{n(r.value)}</span>
            </span>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Your AI credits" action={<span className="font-brand-mono text-[12px] uppercase text-brand-ink">{me.label}</span>}>
        <div className="flex flex-col gap-3 px-6 py-5">
          <span className="text-[40px] font-light leading-none tabular-nums">{n(me.ai)}</span>
          <span className="text-[14px] text-brand-ink-2">{me.aiTokens ? `${n(me.aiTokens)} tokens on your own model, billed by your provider` : "from the skills you ran and assistants you asked"}</span>
          {me.bySource.map((r) => (
            <span key={r.key} className="flex justify-between text-[14px]">
              <span>{r.label}</span>
              <span className="tabular-nums">{n(r.value)}</span>
            </span>
          ))}
        </div>
      </SectionCard>
      <p className="m-0 text-[13px] text-brand-ink-2 min-[1000px]:col-span-2">The whole account&apos;s usage is visible to your admins.</p>
    </div>
  );
}
