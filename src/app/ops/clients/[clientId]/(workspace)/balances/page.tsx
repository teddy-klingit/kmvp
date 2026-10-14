import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { Field, fieldClass } from "@/components/ops/form-field";
import { teamBalances } from "@/lib/team-ledger";
import { addServiceAction, adjustBalanceAction, endServiceAction } from "@/lib/actions/ops-contract-actions";

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
const TYPE: Record<string, string> = { ALLOWANCE: "Granted", PURCHASE: "Bought", CONSUMPTION: "Used", ADJUSTMENT: "Adjusted", EXPIRY: "Expired (over the rollover cap)", SERVICE: "Fixed service" };

/**
 * Client workspace → Balances (Phase S, S7.3): this month's PM and creative balances, every ledger row (grants, use,
 * rollover expiry, packs, services, adjustments), manual adjustments with a logged reason, and fixed monthly services.
 */
export default async function BalancesPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ clientId }, q] = await Promise.all([params, searchParams]);
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) notFound();
  const [balances, monthlyItems, rows] = await Promise.all([
    teamBalances(clientId),
    prisma.priceListItem.findMany({ where: { monthly: true, archivedAt: null, status: { not: "legacy" } }, orderBy: { sortOrder: "asc" } }),
    prisma.creditLedgerEntry.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 60, include: { project: { select: { name: true } } } }),
  ]);
  const day2 = day;
  const hidden = (
    <>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="back" value="balances" />
    </>
  );
  return (
    <>
      {(q.ok || q.error) && <p className={`m-0 rounded-[10px] px-4 py-3 text-[14px] ${q.error ? "bg-ds-watch-tint text-ds-watch-text" : "bg-white"}`}>{q.error ?? q.ok}</p>}
      {!balances && <SectionCard title="Balances"><CardNote>No contract yet: balances start with one (Contract tab).</CardNote></SectionCard>}
      {balances && (
        <SectionCard title="Balances this month" meta={<span className="text-[12px] text-brand-ink-2">PM and creative are never pooled · roll over up to 150% (placeholder)</span>}>
          <CardRows>
            {(["pm", "creative"] as const).map((pool) => {
              const b = balances[pool];
              return (
                <li key={pool} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-6 py-3 text-[14px]">
                  <span className="w-20 font-semibold">{pool === "pm" ? "PM" : "Creative"}</span>
                  <span>
                    <b className="tabular-nums">{b.left}</b> left of {b.monthly} a month
                  </span>
                  <span className="text-[13px] text-brand-ink-2">
                    carried {b.carried} · granted {b.granted} · bought {b.purchased} · used {b.used} · services {b.services} · expired {b.expired}
                  </span>
                </li>
              );
            })}
            {balances.services.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-6 py-3 text-[14px]">
                <span className="flex-1">
                  {s.name} · {s.creditsPerMonth} credits a month{s.outsidePack ? " · outside the pack (invoiced)" : " · from creative"} · until {day2(s.until)}
                </span>
                <form action={endServiceAction}>
                  {hidden}
                  <input type="hidden" name="serviceId" value={s.id} />
                  <button type="submit" className="text-[13px] underline underline-offset-2">
                    End
                  </button>
                </form>
              </li>
            ))}
            <li className="px-6 py-4">
              <form action={adjustBalanceAction} className="flex flex-wrap items-end gap-3">
                {hidden}
                <Field label="Adjust" htmlFor="pool">
                  <select id="pool" name="pool" className={fieldClass}>
                    <option value="creative">Creative</option>
                    <option value="pm">PM</option>
                  </select>
                </Field>
                <Field label="Credits (− to remove)" htmlFor="amount">
                  <input id="amount" name="amount" inputMode="decimal" className={`${fieldClass} w-28`} />
                </Field>
                <Field label="Reason (logged)" htmlFor="reason">
                  <input id="reason" name="reason" className={`${fieldClass} w-72`} />
                </Field>
                <Button type="submit" variant="secondary" size="sm">
                  Adjust
                </Button>
              </form>
            </li>
            <li className="px-6 py-4">
              <form action={addServiceAction} className="flex flex-wrap items-end gap-3">
                {hidden}
                <Field label="Fixed monthly service" htmlFor="svc">
                  <select id="svc" name="priceListItemId" className={fieldClass}>
                    {monthlyItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.displayName} · {i.creditCost ?? "?"} a month
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Months" htmlFor="svcMonths">
                  <select id="svcMonths" name="months" className={fieldClass} defaultValue="3">
                    {[3, 6, 12].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="From" htmlFor="svcStart">
                  <input id="svcStart" name="startDate" type="date" className={fieldClass} />
                </Field>
                <label className="flex items-center gap-2 pb-2 text-[13px]">
                  <input type="checkbox" name="outsidePack" className="size-4" /> Outside the pack (invoiced)
                </label>
                <Button type="submit" variant="secondary" size="sm">
                  Add service
                </Button>
              </form>
            </li>
          </CardRows>
        </SectionCard>
      )}

      <SectionCard title="Ledger" meta={<span className="text-[12px] text-brand-ink-2">Newest first · last 60 rows</span>}>
        {rows.length === 0 ? (
          <CardNote>No ledger rows yet.</CardNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-brand-ink-2">
                  {["When", "Balance", "What", "Credits", "Note"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium first:pl-6 last:pr-6">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-brand-line">
                    <td className="py-2 pl-6 pr-3 text-brand-ink-2">{day(r.createdAt)}</td>
                    <td className="px-3 py-2">{r.pool === "pm" ? "PM" : "Creative"}</td>
                    <td className="px-3 py-2">{TYPE[r.type] ?? r.type}</td>
                    <td className="px-3 py-2 tabular-nums">{r.amount > 0 ? `+${r.amount}` : r.amount}</td>
                    <td className="py-2 pl-3 pr-6 text-brand-ink-2">{[r.project?.name, r.note].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
