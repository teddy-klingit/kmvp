import Link from "next/link";
import { getPortalViewer } from "@/lib/current-viewer";
import { prisma } from "@/lib/prisma";
import { parseRange } from "@/lib/insights/daily";
import { loadPaidTab } from "@/lib/insights/paid-tab";
import { tabFindings } from "@/lib/insight-records";
import { hrefAliases } from "@/lib/insights/tabs";
import { answerCard, type Signal, type SignalStatus } from "@/lib/insights/short-answer";
import { money, pct1, pts, signedPct, times, vsLabel } from "@/lib/insights/format";
import { marketingPm } from "@/lib/contact-person";
import { adDataStatus } from "@/lib/integrations/live-ads-owner";
import { isClientAdmin } from "@/lib/client-roles";
import { NoAdAccount } from "@/components/portal/insights/no-ad-account";
import { AllCampaigns } from "@/components/insights/paid-all-campaigns";
import { BlindSpots, Card, KeyNumbers, ShortAnswer, WhatWeFound, type BlindSpot } from "@/components/insights/tab-parts";
import { WORK_TZ } from "@/lib/working-hours";
import { cn } from "@/lib/utils";

const PURPLE = "#B455B6";
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(d);

/**
 * Insights → Paid ads (Phase X v2, Ins4Paid): "What do our ads cost, what do they bring, and what should we change?"
 * The short answer, 4 numbers, where the money went and what came back, best and worst ads, budget pacing, ads
 * getting tired, findings and blind spots; the campaign detail sits closed under "All campaigns".
 */
export default async function PaidAdsPage({ searchParams }: { searchParams: Promise<{ platform?: string; range?: string }> }) {
  const { platform, range } = await searchParams;
  const days = parseRange(range);
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  if ((await adDataStatus(clientId)) === "none") return <NoAdAccount admin={isClientAdmin(viewer)} />;
  const [t, findings, pm, broken] = await Promise.all([
    loadPaidTab(clientId, { days }),
    tabFindings(clientId, hrefAliases("/insights/paid")),
    marketingPm(clientId),
    prisma.dataSource.findMany({ where: { clientId, source: { in: ["Meta", "Google", "LinkedIn", "TikTok"] }, status: { in: ["needs_reconnect", "error"] } } }),
  ]);
  const pmFirst = pm?.name.split(" ")[0] ?? "Klingit";
  const cur = t.currency;
  const n = t.numbers;
  const vs = vsLabel(days);

  // ─── The short answer: every number below is computed above ───────────────────
  const ret = n.spend.value ? n.sales.value / n.spend.value : null;
  const bestChannel = t.channels.filter((c) => c.return !== null && c.spend >= n.spend.value * 0.1).sort((a, b) => (b.return ?? 0) - (a.return ?? 0))[0];
  const [topFormat, lowFormat] = [t.formatOrders[0], t.formatOrders.at(-1)];
  const formatGap = topFormat && lowFormat && topFormat !== lowFormat ? topFormat.orderValue / lowFormat.orderValue - 1 : null;
  const signals: Signal[] = [
    ...(n.spend.value && n.sales.value ? [{ id: "sales", status: (ret !== null && ret >= 1 ? "good" : "attention") as SignalStatus, value: money(n.sales.value, cur), label: `Sales from ${money(n.spend.value, cur)} ad spend`, weight: 3 }] : []),
    ...(topFormat && formatGap !== null && formatGap >= 0.1 ? [{ id: "format", status: "good" as const, value: money(topFormat.orderValue, cur), label: `Average ${topFormat.format} order, ${Math.round(formatGap * 100)}% bigger than ${lowFormat!.format}`, weight: 2 }] : []),
    ...(t.tired.length ? [{ id: "tired", status: "attention" as const, value: `${t.tired.length} ad${t.tired.length === 1 ? "" : "s"}`, label: "Worn out and losing clicks: refresh it", weight: 2.5 }] : []),
    ...(n.costPerOrder.value !== null && n.costPerOrder.previous !== null ? [{ id: "cpo", status: (n.costPerOrder.value <= n.costPerOrder.previous ? "good" : "attention") as SignalStatus, value: money(n.costPerOrder.value, cur), label: `Per online order, was ${money(n.costPerOrder.previous, cur)}`, weight: 1 }] : []),
    ...(t.budget && t.budget.share > 1 ? [{ id: "budget", status: "attention" as const, value: `${Math.round(t.budget.share * 100)}%`, label: "Of this month's ad budget spent", weight: 2.2 }] : []),
  ];
  const card = answerCard(`${clientId}:paid:${days}`, {
    headline: n.spend.value
      ? [ret ? `Ads paid back ${times(ret)}.` : `${money(n.spend.value, cur)} spent on ads.`, topFormat && formatGap !== null && formatGap >= 0.1 ? `${topFormat.format} ads are your best spend.` : bestChannel && t.channels.length > 1 ? `${bestChannel.platform} brings back the most.` : null].filter(Boolean).join(" ")
      : "No ad spend in this period yet.",
    signals,
  });

  const delta = (change: number | null, goodWhenUp = true) => (change === null ? null : { text: `${signedPct(change)} ${vs}`, tone: (change >= 0) === goodWhenUp ? ("good" as const) : ("bad" as const) });
  const cpoDiff = n.costPerOrder.value !== null && n.costPerOrder.previous !== null ? n.costPerOrder.value - n.costPerOrder.previous : null;
  const ctrDiff = n.ctr.value !== null && n.ctr.previous !== null ? n.ctr.value - n.ctr.previous : null;

  const blind: BlindSpot[] = [
    ...broken.map((s) => ({ text: `${s.source === "Google" ? "Google Ads" : s.source} ${s.source === "TikTok" ? "ads " : ""}disconnected since ${day(s.updatedAt)}: its spend and clicks aren't in these numbers.`, action: { label: "Reconnect", href: "/settings/connections" } })),
    ...(t.budget ? [] : [{ text: `No monthly ad budget on file, so we can't show how spend is pacing. ${pmFirst} can add it.`, action: { label: `Ask ${pmFirst}`, href: "/dashboard?message=1" } }]),
    ...(t.sources.sales.length ? [] : [{ text: "What the ads sold: connect your shop or CRM to follow clicks to orders and deals.", action: { label: "Connect", href: "/settings/connections" } }]),
  ];
  const maxBar = Math.max(1, ...t.channels.flatMap((c) => [c.spend, c.sales]));

  return (
    <div className="flex flex-col gap-6">
      <ShortAnswer card={card} sources={[...new Set([...t.sources.spend, ...t.sources.sales])].map((s) => (s === "Google" ? "Google Ads" : s))} />

      <KeyNumbers
        items={[
          { label: "Ad spend", value: money(n.spend.value, cur), change: t.budget && days === 30 ? { text: `${Math.round(t.budget.share * 100)}% of plan`, tone: "neutral" } : delta(n.spend.change), sub: t.budget && days === 30 ? `${money(t.budget.plan, cur)} planned` : null, spark: n.spend.spark },
          { label: "Sales from ads", value: money(n.sales.value, cur), change: delta(n.sales.change), spark: n.sales.spark },
          { label: "Cost per order", value: n.costPerOrder.value !== null ? money(n.costPerOrder.value, cur) : "No orders yet", change: cpoDiff !== null ? { text: `${cpoDiff <= 0 ? "−" : "+"}${money(Math.abs(cpoDiff), cur)} ${vs}`, tone: cpoDiff <= 0 ? "good" : "bad" } : null, spark: n.costPerOrder.spark },
          { label: "Click rate", value: n.ctr.value !== null ? pct1(n.ctr.value) : "No clicks yet", change: ctrDiff !== null ? { text: `${pts(ctrDiff)} ${vs}`, tone: ctrDiff >= 0 ? "good" : "bad" } : null, spark: n.ctr.spark },
        ]}
      />

      {t.channels.length > 0 && (
        <Card title="Where your money went, and what came back" flush>
          <div className="@container/money overflow-x-auto">
            <div className="grid min-w-[560px] grid-cols-[110px_minmax(0,1fr)_72px_72px_84px] gap-x-4 border-b border-brand-line px-6 py-3 font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">
              <span>Channel</span>
              <span>Spend vs sales</span>
              <span>Spend</span>
              <span>Sales</span>
              <span>Return</span>
            </div>
            <ul className="m-0 min-w-[560px] list-none p-0">
              {t.channels.map((c) => (
                <li key={c.platform} className="grid grid-cols-[110px_minmax(0,1fr)_72px_72px_84px] items-center gap-x-4 border-b border-brand-line px-6 py-3.5 last:border-b-0">
                  <span className="text-[15px]">{c.platform === "Google" ? "Google Ads" : c.platform}</span>
                  <span className="flex flex-col gap-1">
                    <span className="h-2 rounded-full bg-[#C2C3C5]" style={{ width: `${Math.max(2, (c.spend / maxBar) * 100)}%` }} />
                    <span className="h-2 rounded-full" style={{ width: `${Math.max(2, (c.sales / maxBar) * 100)}%`, background: PURPLE }} />
                  </span>
                  <span className="text-[14px] tabular-nums">{money(c.spend, cur)}</span>
                  <span className="text-[14px] tabular-nums">{c.sales ? money(c.sales, cur) : "—"}</span>
                  <span className="text-[14px] tabular-nums">{c.return !== null ? `${times(c.return)}${c.retailOnly ? " retail" : ""}` : "No sales yet"}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-full bg-[#C2C3C5]" /> Spend
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-full" style={{ background: PURPLE }} /> Sales it brought
            </span>
            <span>Sales from {t.sources.sales.join(" and ") || "your shop and CRM"}, shared credit</span>
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {t.best.length > 0 && (
            <Card title="Best and worst ads" flush>
              <ul className="m-0 list-none p-0">
                {t.best.map((a) => (
                  <li key={a.id} className="flex items-center gap-4 border-b border-brand-line px-6 py-3.5 last:border-b-0">
                    <span className="size-14 shrink-0 overflow-hidden rounded-[10px]" style={{ background: a.color ?? "#F3EEE3" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- an access-checked asset file */}
                      {a.thumbnail && <img src={a.thumbnail} alt="" className="size-full object-cover" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <Link href={`/library/${a.id}?from=insights`} className="truncate text-[15px] text-brand-ink no-underline hover:underline">
                        {a.title}
                      </Link>
                      <span className="truncate text-[12px] text-brand-ink-2">{[a.platform, a.format].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-right text-[13px] tabular-nums">{[a.orderValue ? `${money(a.orderValue, cur)} order` : null, `CTR ${pct1(a.ctr)}`].filter(Boolean).join(" · ")}</span>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[12px]", a.tag === "Winner" ? "bg-[#EEF3D6] text-brand-ink" : "bg-[#FDE7DC] text-brand-ink")}>{a.tag}</span>
                  </li>
                ))}
              </ul>
              <p className="m-0 border-t border-brand-line px-6 py-3 text-[13px]">
                <Link href="/library?category=Ads" className="text-brand-ink underline underline-offset-4">
                  All ads in the Output library ›
                </Link>
              </p>
            </Card>
          )}
          <WhatWeFound findings={findings} pm={pmFirst} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {t.budget && (
            <Card title="Budget this month">
              <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[14px] text-brand-ink-2">
                <span className="text-[28px] font-light tabular-nums text-brand-ink">{money(t.budget.spent, cur)}</span>
                of {money(t.budget.plan, cur)} planned · day {t.budget.day} of {t.budget.days}
              </p>
              <span aria-hidden className="mt-3 block h-2.5 rounded-full bg-[#EFEBE2]">
                <span className="block h-full rounded-full" style={{ width: `${Math.min(100, t.budget.share * 100)}%`, background: PURPLE }} />
              </span>
              <p className="m-0 mt-3 text-[14px] leading-[1.5]">
                {t.budget.unspent > t.budget.plan * 0.03
                  ? `At this pace you'll spend ${money(t.budget.projected, cur)}: ${money(t.budget.unspent, cur)} unspent${t.budget.under ? `, mostly ${t.budget.under}` : ""}.`
                  : t.budget.unspent < -t.budget.plan * 0.03
                    ? `At this pace you'll spend ${money(t.budget.projected, cur)}, ${money(-t.budget.unspent, cur)} over plan.`
                    : "Spend is on pace for the plan."}
              </p>
            </Card>
          )}
          {t.tired.length > 0 && (
            <Card title="Ads getting tired" flush>
              <ul className="m-0 list-none p-0">
                {t.tired.map((a) => (
                  <li key={a.id} className="flex items-center gap-4 border-b border-brand-line px-6 py-4 last:border-b-0">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px]">{[a.title, a.format?.split(" ")[0]].filter(Boolean).join(" · ")}</span>
                      <span className="text-[13px] text-brand-ink-2">
                        Seen {a.frequency.toFixed(1)} times per person · CTR down from {pct1(a.ctrBefore)} to {pct1(a.ctrNow)} in 3 weeks
                      </span>
                    </span>
                    <Link href={`/brief/new?${new URLSearchParams({ q: `Refresh “${a.title}”: people see it ${a.frequency.toFixed(1)} times and its click rate fell from ${pct1(a.ctrBefore)} to ${pct1(a.ctrNow)}.` })}`} className="inline-flex h-9 shrink-0 items-center rounded-full border border-brand-ink px-4 font-brand-mono text-[12px] text-brand-ink no-underline hover:bg-brand-ink hover:text-white">
                      Refresh it
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="m-0 border-t border-brand-line px-6 py-3 text-[13px] text-brand-ink-2">We flag an ad when people see it more than 4 times and clicks drop by a third.</p>
            </Card>
          )}
          <BlindSpots items={blind} />
        </div>
      </div>

      <details id="all-campaigns" className="group rounded-2xl bg-white/60 px-6 py-4 [&[open]]:bg-transparent [&[open]]:px-0">
        <summary className="cursor-pointer list-none text-[16px] text-brand-ink group-open:px-6">
          All campaigns <span className="text-[13px] text-brand-ink-2">· spend and clicks per day, every campaign, click rate by format</span>
        </summary>
        <div className="mt-4">
          <AllCampaigns clientId={clientId} days={days} platform={platform} range={range} />
        </div>
      </details>
    </div>
  );
}
