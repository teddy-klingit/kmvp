import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { loadRevenue, parseModel, parsePeriod, sourceLabel, type CreditModel, type Revenue, type RevenuePeriod } from "@/lib/revenue";
import { entitlements } from "@/lib/entitlements";
import { SALES_SOURCES } from "@/lib/sales-sources";
import { uploadStoreSalesAction } from "@/lib/actions/revenue-actions";
import { cn } from "@/lib/utils";
import { Chips, SourceChip } from "@/components/insights/source-chip";

/**
 * Insights → Revenue (Phase V, design InsightsRevenue): follow a click all the way to revenue. Every number is worked
 * out in code from the data layer (lib/revenue.ts), with its sources on chips; what can't be seen yet is said, never
 * filled in. No sales source connected: what this tab would show, and Connect.
 */

const symbol = (c: string) => (c === "EUR" ? "€" : c === "USD" ? "$" : c === "GBP" ? "£" : "");
function money(n: number, currency: string, exact = false) {
  const s = symbol(currency);
  // €412k, €41.2k, €3.1k (as in the design); exact for per-customer amounts.
  const a = Math.abs(n);
  const v = exact || a < 1000 ? Math.round(n).toLocaleString("en-GB") : a >= 100000 ? `${Math.round(n / 1000).toLocaleString("en-GB")}k` : `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return s ? `${s}${v}` : `${v} ${currency}`;
}
const count = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 10000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString("en-GB"));
const keptPct = (v: number) => `${v < 10 ? v.toFixed(1) : v.toFixed(1)}%`;

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ days?: string; credit?: string; by?: string; upload?: string }> }) {
  const q = await searchParams;
  const viewer = await getPortalViewer();
  const ent = await entitlements(viewer.clientId);
  const days = parsePeriod(q.days);
  const model: CreditModel = ent.has("attributionChoice") ? parseModel(q.credit) : "shared";
  const r = await loadRevenue(viewer.clientId, { days, model });
  const by = q.by === "campaign" || q.by === "market" ? q.by : "channel";
  const href = (p: Partial<{ days: RevenuePeriod; credit: CreditModel; by: string }>) => {
    const s = new URLSearchParams({ ...(days !== 90 ? { days: String(days) } : {}), ...(model !== "shared" ? { credit: model } : {}), ...(by !== "channel" ? { by } : {}) });
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined || (k === "days" && v === 90) || (k === "credit" && v === "shared") || (k === "by" && v === "channel")) s.delete(k);
      else s.set(k, String(v));
    }
    return `/insights/revenue${s.size ? `?${s}` : ""}`;
  };

  if (!r.connected) return <Empty admin={isClientAdmin(viewer)} />;

  const label = days === 365 ? "12 months" : `${days} days`;
  const healthText = [r.health.orders !== null ? `${Math.round(r.health.orders * 100)}% of orders` : null, r.health.deals !== null ? `${Math.round(r.health.deals * 100)}% of deals` : null].filter(Boolean).join(" and ");
  const t = r.tiles;
  const change = t.revenue.change;

  return (
    <div className="flex flex-col gap-6">
      {/* Based on: every source behind this tab, and how much of the sales have a source. */}
      <section aria-label="Based on" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] bg-white px-5 py-3">
        <span className="font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-ink-2">Based on</span>
        <Chips sources={r.based} />
        <span className="ml-auto flex items-center gap-2 text-[12px] text-brand-ink-2">
          {healthText && (
            <>
              <span aria-hidden className="size-2 rounded-full bg-[#8D9E47]" />
              {healthText} have a source
            </>
          )}
          <a href="#data-health" className="font-brand-mono text-[11px] uppercase text-brand-ink underline underline-offset-4">
            Data health
          </a>
        </span>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Period" className="flex rounded-full bg-brand-chip p-1">
          {([30, 90, 365] as const).map((d) => (
            <Link key={d} href={href({ days: d })} aria-current={d === days ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-[14px] no-underline", d === days ? "bg-brand-ink text-white" : "text-brand-ink")}>
              {d === 365 ? "12 months" : `${d} days`}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <span className="text-brand-ink-2">Credit for a sale goes to</span>
          {(["first", "last", "shared"] as const).map((m) =>
            ent.has("attributionChoice") ? (
              <Link key={m} href={href({ credit: m })} aria-current={m === model ? "true" : undefined} className={cn("rounded-full border px-3.5 py-1.5 no-underline", m === model ? "border-brand-ink bg-brand-ink text-white" : "border-[#DCD6C8] bg-white text-brand-ink")}>
                {m === "first" ? "First touch" : m === "last" ? "Last touch" : "Shared"}
              </Link>
            ) : (
              <span key={m} className={cn("rounded-full border px-3.5 py-1.5", m === "shared" ? "border-brand-ink bg-brand-ink text-white" : "border-[#DCD6C8] text-brand-ink-2 opacity-60")} title={m === "shared" ? undefined : `On ${ent.needs("attributionChoice")}`}>
                {m === "first" ? "First touch" : m === "last" ? "Last touch" : "Shared"}
              </span>
            )
          )}
          {!ent.has("attributionChoice") && <span className="font-brand-mono text-[10px] uppercase text-brand-ink-2">Choice on {ent.needs("attributionChoice")}</span>}
        </div>
      </div>
      {r.period.coverageFrom && <p className="m-0 text-[13px] text-brand-ink-2">Numbers from {fmtDay(r.period.coverageFrom)}: that&apos;s as far back as the connected sources go.</p>}
      {r.lastOnly.length > 0 && model !== "last" && <p className="m-0 text-[13px] text-brand-ink-2">{r.lastOnly.map(sourceLabel).join(", ")} only report last touch, so their numbers are last touch under every choice.</p>}

      {/* Tiles */}
      <section aria-label="Totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Revenue from marketing" value={money(t.revenue.value, r.currency)} note={change !== null ? `${change >= 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}% vs previous ${label}` : `No previous ${label} to compare yet`} sources={t.revenue.sources} />
        <Tile label="Return on ad spend" value={t.roas.value !== null ? `${t.roas.value.toFixed(1)}×` : "No ad spend"} note={`Real revenue ÷ ${money(t.roas.spend, r.currency)} ad spend`} sources={t.roas.sources} />
        <Tile label="Cost per new customer" value={t.perCustomer.online !== null ? money(t.perCustomer.online, r.currency, true) : t.perCustomer.retail !== null ? money(t.perCustomer.retail, r.currency, true) : "Not enough data"} note={[t.perCustomer.online !== null ? "Online" : null, t.perCustomer.retail !== null ? `retail deals: ${money(t.perCustomer.retail, r.currency, true)}` : null].filter(Boolean).join(" · ")} sources={t.perCustomer.sources} />
        <Tile label="Open pipeline" value={t.pipeline.openValue !== null ? money(t.pipeline.openValue, r.currency) : "No CRM yet"} note={t.pipeline.openValue !== null ? `${t.pipeline.openDeals ?? 0} open deals · ${Math.round(t.pipeline.won)} won in ${label}` : "Connect a CRM to see open deals"} sources={t.pipeline.sources} />
      </section>
      {r.store && <p className="m-0 -mt-2 text-[13px] text-brand-ink-2">In-store sales uploaded for the period: {money(r.store, r.currency)}. Not counted as marketing revenue.</p>}

      {/* From first click to revenue */}
      <section aria-label="From first click to revenue" className="overflow-hidden rounded-[12px] bg-white">
        <h2 className="m-0 border-b border-brand-line px-6 py-4 text-[18px] font-normal">From first click to revenue · last {label}</h2>
        <div className="grid grid-cols-1 gap-8 px-6 py-5 min-[900px]:grid-cols-2">
          <Funnel title="Online shop" f={r.funnels.online} tone="bg-[#B455B6]" currency={r.currency} empty="Connect your shop to see orders." />
          <Funnel title="Retail & wholesale" f={r.funnels.retail} tone="bg-[#5A6FB0]" currency={r.currency} empty="Connect your CRM to see leads and deals." />
        </div>
        <div className="flex flex-col gap-1 border-t border-brand-line px-6 py-3.5 text-[13px]">
          <span className="text-[12px] text-brand-ink-2">% = share of the stage before · bars on a log scale so small stages stay visible</span>
          {r.biggestDrop ? (
            <span>
              Biggest drop:{" "}
              <b className="font-semibold">
                {r.biggestDrop.from.toLowerCase()} → {r.biggestDrop.to.toLowerCase()} {r.biggestDrop.path === "retail" ? "in retail" : "online"} ({Math.round(r.biggestDrop.kept)}%)
              </b>
              , against a usual {r.biggestDrop.usual}%.
              {r.mover && (
                <>
                  {" "}
                  Deals that got <b className="font-semibold">{r.mover.title}</b> closed {r.mover.times.toFixed(1)}× as often ({r.mover.won} of {r.mover.deals}, against {Math.round(r.mover.overall * 100)}% overall).
                </>
              )}
            </span>
          ) : (
            <span>No step is below its usual rate.</span>
          )}
        </div>
      </section>

      {/* By channel / campaign / market */}
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
                    <td className="px-6 py-3 tabular-nums">{row.perCustomer !== null ? money(row.perCustomer, r.currency, true) : "—"}</td>
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

      <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {ent.has("revenueWork") ? (
          <section aria-label="Work that brought revenue" className="overflow-hidden rounded-[12px] bg-white">
            <header className="flex items-center gap-3 border-b border-brand-line px-6 py-4">
              <h2 className="m-0 flex-1 text-[18px] font-normal">Work that brought revenue</h2>
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
          <Locked title="Work that brought revenue" plan={ent.needs("revenueWork")} />
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

      <DataHealth r={r} />
    </div>
  );
}

const fmtDay = (d: string | Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(typeof d === "string" ? new Date(`${d}T12:00:00`) : d);

function Tile({ label, value, note, sources }: { label: string; value: string; note: string; sources: string[] }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] bg-white px-5 py-5">
      <span className="text-[13px] text-brand-ink-2">{label}</span>
      <span className="text-[32px] font-light leading-[1.1] tabular-nums">{value}</span>
      <span className="text-[12px] text-brand-ink-2">{note}</span>
      <span className="mt-1.5">
        <Chips sources={sources} />
      </span>
    </div>
  );
}

function Funnel({ title, f, tone, currency, empty }: { title: string; f: Revenue["funnels"]["online"]; tone: string; currency: string; empty: string }) {
  const max = Math.max(...f.steps.map((s) => s.value), 1);
  const width = (v: number) => (v > 0 ? Math.max(4, (Math.log10(v + 1) / Math.log10(max + 1)) * 100) : 0);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 flex-1 text-[16px] font-normal">{title}</h3>
        <Chips sources={f.sources} />
      </div>
      {!f.has ? (
        <p className="m-0 text-[14px] text-brand-ink-2">{empty}</p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {f.steps.map((s) => (
              <li key={s.label} className="grid grid-cols-[88px_minmax(0,1fr)_56px] items-center gap-3 text-[13px]">
                <span>{s.label}</span>
                <span className="flex items-center gap-2">
                  <span className={cn("h-5 rounded-[3px]", tone)} style={{ width: `${width(s.value)}%` }} />
                  {s.kept !== null && <span className="text-[11px] text-brand-ink-2">{keptPct(s.kept)}</span>}
                </span>
                <span className="text-right tabular-nums">{count(s.value)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between border-t border-brand-line pt-2.5 text-[14px]">
            <span>Revenue</span>
            <span className="text-[20px] font-light tabular-nums">{money(f.revenue, currency)}</span>
          </div>
        </>
      )}
    </div>
  );
}

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
