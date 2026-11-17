import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { loadRevenue, parseModel, parsePeriod, sourceLabel, type CreditModel, type Revenue, type RevenuePeriod } from "@/lib/revenue";
import { entitlements } from "@/lib/entitlements";
import { SALES_SOURCES } from "@/lib/sales-sources";
import { uploadStoreSalesAction } from "@/lib/actions/revenue-actions";
import { cn } from "@/lib/utils";
import { SourceChip } from "@/components/insights/source-chip";
import { Card, KeyNumbers, ShortAnswer } from "@/components/insights/tab-parts";
import { loadSalesTab } from "@/lib/insights/sales-tab";
import { shortAnswer } from "@/lib/insights/short-answer";
import { count, money, signedPct, vsLabel } from "@/lib/insights/format";

/**
 * Insights → Revenue (Phase V, design InsightsRevenue): follow a click all the way to revenue. Every number is worked
 * out in code from the data layer (lib/revenue.ts), with its sources on chips; what can't be seen yet is said, never
 * filled in. No sales source connected: what this tab would show, and Connect.
 */


export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ range?: string; days?: string; credit?: string; by?: string; upload?: string }> }) {
  const q = await searchParams;
  const viewer = await getPortalViewer();
  const ent = await entitlements(viewer.clientId);
  // Phase X: the tab header's period (?range=, 30 days by default); ?days= still reads for old links.
  const days = parsePeriod(q.range ?? q.days ?? "30");
  const model: CreditModel = ent.has("attributionChoice") ? parseModel(q.credit) : "shared";
  const [r, st] = await Promise.all([loadRevenue(viewer.clientId, { days, model }), loadSalesTab(viewer.clientId, { days, model })]);
  const by = q.by === "campaign" || q.by === "market" ? q.by : "channel";
  const href = (p: Partial<{ range: RevenuePeriod; credit: CreditModel; by: string }>) => {
    const s = new URLSearchParams({ ...(days !== 30 ? { range: String(days) } : {}), ...(model !== "shared" ? { credit: model } : {}), ...(by !== "channel" ? { by } : {}) });
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined || (k === "range" && v === 30) || (k === "credit" && v === "shared") || (k === "by" && v === "channel")) s.delete(k);
      else s.set(k, String(v));
    }
    return `/insights/sales${s.size ? `?${s}` : ""}`;
  };

  if (!r.connected) return <Empty admin={isClientAdmin(viewer)} />;

  const label = days === 365 ? "12 months" : `${days} days`;
  const healthText = [r.health.orders !== null ? `${Math.round(r.health.orders * 100)}% of orders` : null, r.health.deals !== null ? `${Math.round(r.health.deals * 100)}% of deals` : null].filter(Boolean).join(" and ");
  const n = st.numbers;
  const c = st.customers;
  const cur = st.currency;
  const vs = vsLabel(days);
  const delta = (ch: number | null) => (ch === null ? null : { text: `${signedPct(ch)} ${vs}`, tone: ch >= 0 ? ("good" as const) : ("bad" as const) });
  const avgDiff = n.avgOrder.value !== null && n.avgOrder.previous !== null ? n.avgOrder.value - n.avgOrder.previous : null;

  // The short answer: every number in it is computed above.
  const answer = shortAnswer(
    `${viewer.clientId}:sales:${days}:${model}`,
    [
      `Marketing brought ${money(n.sales.value, cur)} in the last ${label}${n.won.value ? `: ${money(st.onlineSales, cur)} online (${count(n.orders.value, { exactUnder: 10_000 })} orders) and ${money(n.won.wonValue, cur)} from ${Math.round(n.won.value)} retail deal${Math.round(n.won.value) === 1 ? "" : "s"}` : ` from ${count(n.orders.value, { exactUnder: 10_000 })} online orders`}.`,
      c.fresh ? `${count(c.fresh, { exactUnder: 10_000 })} new customers came in${c.costToWin ? `, at ${money(c.costToWin, cur)} each` : ""}${c.costToWin && c.firstOrder && c.firstOrder >= c.costToWin ? ", and they pay that back on their first order" : ""}.` : null,
    ]
      .filter(Boolean)
      .join(" ")
  );
  const maxGroup = Math.max(1, ...st.from.map((g) => g.sales));
  const retailSteps = r.funnels.retail.steps;

  return (
    <div className="flex flex-col gap-6">
      <ShortAnswer text={answer} sources={[...new Set([...st.sources.sales, ...st.sources.spend])].map((x) => (x === "Google" ? "Google Ads" : x))} />
      {r.period.coverageFrom && <p className="m-0 text-[13px] text-brand-ink-2">Numbers from {fmtDay(r.period.coverageFrom)}: that&apos;s as far back as the connected sources go.</p>}

      <KeyNumbers
        color="#8D9E47"
        items={[
          { label: "Sales from marketing", value: money(n.sales.value, cur), change: delta(n.sales.change), spark: n.sales.spark },
          { label: "Online orders", value: count(n.orders.value, { exactUnder: 10_000 }), change: delta(n.orders.change), spark: n.orders.spark },
          { label: "Average order", value: n.avgOrder.value !== null ? money(n.avgOrder.value, cur) : "No orders yet", change: avgDiff !== null ? { text: `${avgDiff >= 0 ? "+" : "−"}${money(Math.abs(avgDiff), cur)} ${vs}`, tone: avgDiff >= 0 ? "good" : "bad" } : null, spark: n.avgOrder.spark },
          { label: "Retail deals won", value: r.funnels.retail.has ? String(Math.round(n.won.value)) : "No CRM yet", change: r.funnels.retail.has && n.won.wonValue ? { text: money(n.won.wonValue, cur), tone: "neutral" } : null, spark: n.won.spark },
        ]}
      />
      {r.store && <p className="m-0 -mt-2 text-[13px] text-brand-ink-2">In-store sales uploaded for the period: {money(r.store, cur)}. Not counted as marketing sales.</p>}

      <Card title="Where your sales came from" flush>
        <ul className="m-0 list-none px-6 py-4">
          {st.from.map((g) => (
            <li key={g.group} className="grid grid-cols-[120px_minmax(0,1fr)_64px_84px] items-center gap-4 py-1.5 text-[14px] min-[700px]:grid-cols-[150px_minmax(0,1fr)_72px_96px]">
              <span>{g.group}</span>
              <span aria-hidden className="h-2.5 rounded-full" style={{ width: `${Math.max(2, (g.sales / maxGroup) * 100)}%`, background: g.group === "Retail deals" ? "#8D9E47" : "#B455B6" }} />
              <span className="text-right tabular-nums">{money(g.sales, cur)}</span>
              <span className="text-right text-[13px] text-brand-ink-2 tabular-nums">{g.group === "Retail deals" ? `${Math.round(g.deals)} deal${Math.round(g.deals) === 1 ? "" : "s"}` : `${count(g.orders, { exactUnder: 10_000 })} orders`}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-brand-line px-6 py-3.5 text-[13px] text-brand-ink-2">
          <span className="min-w-0 flex-1 basis-[260px]">{CREDIT_LINE[model]}</span>
          <span>Credit goes to</span>
          <nav aria-label="Credit for a sale" className="flex rounded-full bg-[var(--seg-track)] p-1">
            {(["first", "last", "shared"] as const).map((m) =>
              ent.has("attributionChoice") ? (
                <Link key={m} href={href({ credit: m })} aria-current={m === model ? "true" : undefined} className={cn("rounded-full px-4 py-1.5 text-[14px] no-underline", m === model ? "bg-brand-ink text-white" : "text-brand-ink hover:bg-black/5")}>
                  {m[0].toUpperCase() + m.slice(1)}
                </Link>
              ) : (
                <span key={m} title={m === "shared" ? undefined : `On ${ent.needs("attributionChoice")}`} className={cn("rounded-full px-4 py-1.5 text-[14px]", m === "shared" ? "bg-brand-ink text-white" : "text-brand-ink-2 opacity-60")}>
                  {m[0].toUpperCase() + m.slice(1)}
                </span>
              )
            )}
          </nav>
          {!ent.has("attributionChoice") && <span className="font-brand-mono text-[10px] uppercase">Choice on {ent.needs("attributionChoice")}</span>}
        </div>
        {r.lastOnly.length > 0 && model !== "last" && <p className="m-0 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">{r.lastOnly.map(sourceLabel).join(", ")} only report last touch, so their numbers are last touch under every choice.</p>}
      </Card>

      <div className="grid grid-cols-1 items-start gap-6 min-[1000px]:grid-cols-2">
        <Card title="New and returning customers">
          {c.fresh ? (
            <div className="flex flex-col gap-4">
              <span aria-hidden className="flex h-2.5 overflow-hidden rounded-full">
                <span style={{ width: `${(c.fresh / Math.max(1, c.fresh + c.returning)) * 100}%`, background: "#8D9E47" }} />
                <span className="flex-1 bg-[#D7DFB0]" />
              </span>
              <div className="grid grid-cols-2 gap-4">
                <span className="flex flex-col gap-1">
                  <span className="text-[22px] font-light">{count(c.fresh, { exactUnder: 10_000 })} new</span>
                  <span className="text-[13px] text-brand-ink-2">{[c.costToWin ? `${money(c.costToWin, cur)} to win each one` : null, c.firstOrder ? `first order ${money(c.firstOrder, cur)}` : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-[22px] font-light">{count(c.returning, { exactUnder: 10_000 })} returning</span>
                  <span className="text-[13px] text-brand-ink-2">{[c.returningOrder ? `Spend ${money(c.returningOrder, cur)} per order` : null, c.returningFromEmail ? `${oneIn(c.returningFromEmail)} from email` : null].filter(Boolean).join(" · ")}</span>
                </span>
              </div>
              {c.firstYearValue && c.costToWin && <p className="m-0 text-[14px] leading-[1.5]">A new customer is worth {money(c.firstYearValue, cur)} in their first year. You earn back the {money(c.costToWin, cur)} to win them {c.firstOrder && c.firstOrder >= c.costToWin ? "on the first order" : "over the year"}.</p>}
            </div>
          ) : (
            <p className="m-0 text-[14px] text-brand-ink-2">Connect your shop to see new and returning customers.</p>
          )}
        </Card>

        <Card title={`Retail pipeline${r.funnels.retail.sources.length ? ` · ${r.funnels.retail.sources.map(sourceLabel).join(", ")}` : ""}`}>
          {r.funnels.retail.has ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
                {retailSteps.map((s, i) => (
                  <span key={s.label} className="flex flex-col gap-1 rounded-[10px] bg-[#EEF1FA] px-3.5 py-3">
                    <span className="text-[12px] text-brand-ink-2">{s.label === "Deals" ? "Proposal" : s.label}</span>
                    <span className="text-[22px] font-light tabular-nums">{Math.round(s.value)}</span>
                    <span className="text-[11px] text-brand-ink-2">{i === 0 ? `last ${label}` : i === retailSteps.length - 1 ? money(r.funnels.retail.revenue, cur) : s.kept !== null ? `${Math.round(s.kept)}%` : ""}</span>
                  </span>
                ))}
              </div>
              {r.mover && <p className="m-0 text-[14px] leading-[1.5]">Buyers who got {r.mover.title} closed {r.mover.times.toFixed(1)}× as often ({r.mover.won} of {r.mover.deals}).</p>}
            </div>
          ) : (
            <p className="m-0 text-[14px] text-brand-ink-2">Connect your CRM to follow leads to deals.</p>
          )}
        </Card>
      </div>

      {/* Klingit work and blind spots first; the full tables sit closed underneath. */}
      <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {ent.has("revenueWork") ? (
          <section aria-label="Klingit work that brought sales" className="overflow-hidden rounded-[12px] bg-white">
            <header className="flex items-center gap-3 border-b border-brand-line px-6 py-4">
              <h2 className="m-0 flex-1 text-[18px] font-normal">Klingit work that brought sales</h2>
              <Link href="/library" className="font-brand-mono text-[12px] uppercase text-brand-ink underline underline-offset-4">
                Output library
              </Link>
            </header>
            {r.work.length === 0 ? (
              <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">No sale is linked to a piece of work yet. Everything Klingit ships is tagged from now on, so it will be.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {r.work.map((w) => (
                  <li key={w.id} className="flex items-center gap-4 border-t border-brand-line px-6 py-3.5 first:border-t-0">
                    <span className="size-12 shrink-0 rounded-[8px]" style={{ background: w.color }} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      {w.href ? (
                        <Link href={w.href} className="truncate text-[15px] text-brand-ink no-underline hover:underline">
                          {w.title}
                        </Link>
                      ) : (
                        <span className="truncate text-[15px]">{w.title}</span>
                      )}
                      <span className="text-[12px] text-brand-ink-2">{w.channels.join(" · ")}</span>
                    </span>
                    <span className="w-28 text-right text-[13px] text-brand-ink-2">{w.orders ? `${w.orders.toLocaleString("en-GB")} orders` : `${w.won} deal${w.won === 1 ? "" : "s"} won`}</span>
                    <span className="w-16 text-right tabular-nums">{money(w.revenue, r.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="m-0 flex items-center gap-2 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">
              Linked through the UTM tags on everything Klingit ships <SourceChip source="Output library" />
            </p>
          </section>
        ) : (
          <Locked title="Klingit work that brought sales" plan={ent.needs("revenueWork")} />
        )}

        <section id="cant-see" aria-label="What we can't see yet" className="overflow-hidden rounded-[12px] bg-white">
          <h2 className="m-0 border-b border-brand-line px-6 py-4 text-[18px] font-normal">What we can&apos;t see yet</h2>
          {q.upload && <p className="m-0 border-b border-brand-line px-6 py-3 text-[13px]">{q.upload}</p>}
          {r.blind.length === 0 ? (
            <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">Nothing we know of: every connected source is syncing.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0 px-6 py-5">
              {r.blind.map((b) => (
                <li key={b.text} className="flex flex-col gap-2 text-[14px]">
                  <span className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-brand-orange-text" strokeWidth={2} />
                    <span className="flex-1">{b.text}</span>
                    {b.reconnect && (
                      <Link href={b.reconnect} className="shrink-0 rounded-full border border-[#CFC8B8] px-3 py-1 text-[12px] text-brand-ink no-underline">
                        Reconnect
                      </Link>
                    )}
                  </span>
                  {b.upload &&
                    (ent.has("offlineUpload") && isClientAdmin(viewer) ? (
                      <form action={uploadStoreSalesAction} className="ml-5 flex flex-wrap items-center gap-2 text-[12px]">
                        <input type="file" name="file" accept=".csv,text/csv" aria-label="Monthly store sales CSV" className="max-w-[220px] text-[12px]" />
                        <button type="submit" className="rounded-full bg-brand-ink px-3 py-1.5 font-brand-mono text-[11px] text-white">
                          Upload
                        </button>
                        <span className="w-full text-brand-ink-2">CSV: month,market,revenue,orders (e.g. 2026-09,SE,12500,140)</span>
                      </form>
                    ) : (
                      <span className="ml-5 text-[12px] text-brand-ink-2">Store sales upload is on {ent.needs("offlineUpload")}.</span>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <details className="rounded-2xl bg-white/60 px-6 py-4 [&[open]]:bg-transparent [&[open]]:px-0">
        <summary className="cursor-pointer list-none text-[16px] text-brand-ink">
          Sales by channel, campaign and market <span className="text-[13px] text-brand-ink-2">· and data health{healthText ? ` (${healthText} have a source)` : ""}</span>
        </summary>
        <div className="mt-4 flex flex-col gap-6">
      {ent.has("revenueTable") ? (
        <section aria-label="Revenue by channel" className="overflow-hidden rounded-[12px] bg-white">
          <header className="flex flex-wrap items-center gap-3 border-b border-brand-line px-6 py-4">
            <h2 className="m-0 flex-1 text-[18px] font-normal">By {by}</h2>
            {(["channel", "campaign", "market"] as const).map((b) => (
              <Link key={b} href={href({ by: b })} aria-current={b === by ? "true" : undefined} className={cn("rounded-full border px-3.5 py-1.5 text-[14px] no-underline", b === by ? "border-brand-ink bg-brand-ink text-white" : "border-[#DCD6C8] bg-white text-brand-ink")}>
                {b[0].toUpperCase() + b.slice(1)}
              </Link>
            ))}
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[14px]">
              <thead>
                <tr className="text-left font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-ink-2">
                  {[by === "market" ? "Market" : by === "campaign" ? "Campaign" : "Channel", "Spend", "Orders", "Retail deals", "Revenue", "Return", "Per customer"].map((h) => (
                    <th key={h} className="px-6 py-3 font-normal first:pl-6">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.tables[by].map((row) => (
                  <tr key={row.name} className="border-t border-brand-line">
                    <td className="px-6 py-3">{row.name}</td>
                    <td className="px-6 py-3 tabular-nums">{row.spend ? money(row.spend, r.currency) : "—"}</td>
                    <td className="px-6 py-3 tabular-nums">{row.orders ? Math.round(row.orders).toLocaleString("en-GB") : "—"}</td>
                    <td className="px-6 py-3 tabular-nums">{row.deals ? Math.round(row.deals) : "—"}</td>
                    <td className="px-6 py-3 tabular-nums">{money(row.revenue, r.currency)}</td>
                    <td className={cn("px-6 py-3 tabular-nums", row.return !== null && row.return < 1 && "text-brand-orange-text")}>{row.return !== null ? `${row.return.toFixed(1)}×` : "—"}</td>
                    <td className="px-6 py-3 tabular-nums">{row.perCustomer !== null ? money(row.perCustomer, r.currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {by === "market" && <p className="m-0 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">Ad platforms don&apos;t split spend by market, so this view shows sales only.</p>}
          {by === "campaign" && <p className="m-0 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">Campaigns join on utm_campaign; ad campaigns marked “not mapped” are joined by Klingit in campaign mapping.</p>}
        </section>
      ) : (
        <Locked title="By channel, campaign and market" plan={ent.needs("revenueTable")} />
      )}

      <DataHealth r={r} />
        </div>
      </details>
    </div>
  );
}

const fmtDay = (d: string | Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(typeof d === "string" ? new Date(`${d}T12:00:00`) : d);



function Locked({ title, plan }: { title: string; plan: string }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2 rounded-[12px] border border-dashed border-[#DCD6C8] px-6 py-5">
      <h2 className="m-0 text-[18px] font-normal">{title}</h2>
      <p className="m-0 text-[14px] text-brand-ink-2">
        On {plan} and up. <Link href="/settings/plan">See plans</Link>
      </p>
    </section>
  );
}

function DataHealth({ r }: { r: Revenue }) {
  const STATUS: Record<string, string> = { connected: "Syncing", needs_reconnect: "Needs reconnecting", error: "Failed last sync", setting_up: "Setting up", requested: "Requested", disconnected: "Disconnected", waitlist: "Coming soon" };
  return (
    <section id="data-health" aria-label="Data health" className="overflow-hidden rounded-[12px] bg-white">
      <h2 className="m-0 border-b border-brand-line px-6 py-4 text-[18px] font-normal">Data health</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-ink-2">
              {["Source", "State", "Last sync", "With a source", "Numbers in period"].map((h) => (
                <th key={h} className="px-6 py-3 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.sources.map((s) => (
              <tr key={s.source} className="border-t border-brand-line">
                <td className="px-6 py-3">
                  <SourceChip source={s.source} />
                </td>
                <td className={cn("px-6 py-3", ["needs_reconnect", "error"].includes(s.status) && "text-brand-orange-text")}>{STATUS[s.status] ?? s.status}{s.lastError && s.status !== "connected" ? ` · ${s.lastError}` : ""}</td>
                <td className="px-6 py-3 text-brand-ink-2">{s.lastSyncAt ? fmtDay(s.lastSyncAt) : "—"}</td>
                <td className="px-6 py-3 tabular-nums">{s.health !== null ? `${Math.round(s.health * 100)}%` : "—"}</td>
                <td className="px-6 py-3 tabular-nums">{s.numbers.toLocaleString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">Totals only: counts and amounts per day, channel and campaign. No names, emails or phone numbers are stored.</p>
    </section>
  );
}

function Empty({ admin }: { admin: boolean }) {
  return (
    <section aria-label="Revenue" className="flex flex-col gap-5 rounded-[12px] bg-white px-6 py-6">
      <div className="flex max-w-[640px] flex-col gap-2">
        <h2 className="m-0 text-[22px] font-light">Follow a click all the way to revenue</h2>
        <p className="m-0 text-[15px] leading-[1.55] text-brand-ink-2">
          Connect where your sales happen and this tab shows the revenue your marketing brought, the return on ad spend, the cost of a new customer and your open pipeline, the path from first click to order or deal, which channels, campaigns and markets sell, and which pieces of work brought revenue.
        </p>
        <p className="m-0 text-[13px] text-brand-ink-2">Read-only, totals only, and you can disconnect any time.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {SALES_SOURCES.filter((s) => !s.soon).map((s) =>
          admin ? (
            <Link key={s.key} href={`/settings/connections?connect=${s.key}`} className="rounded-full bg-brand-ink px-4 py-2 font-brand-mono text-[12px] text-white no-underline">
              Connect {s.name}
            </Link>
          ) : (
            <span key={s.key} className="rounded-full border border-[#DCD6C8] px-4 py-2 text-[13px] text-brand-ink-2">
              {s.name}
            </span>
          )
        )}
      </div>
      {!admin && <p className="m-0 text-[13px] text-brand-ink-2">Your account&apos;s admins can connect these.</p>}
    </section>
  );
}

const CREDIT_LINE: Record<CreditModel, string> = {
  shared: "Credit is shared across every channel a customer touched before buying.",
  first: "Credit goes to the channel that first brought the customer in.",
  last: "Credit goes to the last channel the customer touched before buying.",
};

/** 0.34 → "1 in 3". */
const oneIn = (share: number) => (share >= 0.5 ? `${Math.round(share * 100)}%` : `1 in ${Math.round(1 / share)}`);
