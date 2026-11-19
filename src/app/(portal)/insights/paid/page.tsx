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
import { BlindSpots, Card, KeyNumbers, MeansButton, ShortAnswer, StatusPill, WhatItMeans, WhatWeFound, type BlindSpot } from "@/components/insights/tab-parts";
import { ChannelIcon } from "@/components/insights/source-chip";
import { MessagePmButton } from "@/components/pm-panel/pm-panel-provider";
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
  const paying = t.channels.filter((c) => c.return !== null);
  const topSales = [...paying].sort((a, b) => b.sales - a.sales)[0];
  const topReturn = [...paying].sort((a, b) => (b.return ?? 0) - (a.return ?? 0))[0];
  const label = (p: string) => (p === "Google" ? "Google Ads" : p);
  const moneyMeans = paying.length
    ? `${paying.every((c) => c.return! >= 1) ? "Every channel pays back." : `${paying.filter((c) => c.return! < 1).map((c) => label(c.platform)).join(" and ")} doesn't pay back yet.`} ${label(topSales.platform)} brings the most sales${topReturn && topReturn !== topSales ? `, ${label(topReturn.platform)} the best return${topReturn.retailOnly ? " (retail deals)" : ""}` : ""}.`
    : null;
  const b = t.budget;
  const budgetMeans = b
    ? b.left > b.plan * 0.03
      ? `${money(b.left, cur)} unspent${b.under ? `, mostly ${label(b.under)}` : ""}.${topFormat && formatGap !== null && formatGap >= 0.1 ? ` Move it to ${b.bestPlatform ? `${b.bestPlatform} ` : ""}${topFormat.format} ads next month?` : ""}`
      : b.left < -b.plan * 0.03
        ? `${money(-b.left, cur)} over plan in the last 30 days.`
        : "Spend is on plan."
    : "";
  const maxBar = Math.max(1, ...t.channels.flatMap((c) => [c.spend, c.sales]));

  return (
    <div className="flex flex-col gap-6">
      <ShortAnswer card={card} sources={[...new Set([...t.sources.spend, ...t.sources.sales])].map((s) => (s === "Google" ? "Google Ads" : s))} />

      <KeyNumbers
        items={[
          { label: "Ad spend", value: money(n.spend.value, cur), change: t.budget && days === 30 ? { text: `${Math.round(t.budget.share * 100)}% of plan`, tone: t.budget.share > 1 ? "bad" : "neutral" } : delta(n.spend.change), sub: t.budget && days === 30 ? `${money(t.budget.plan, cur)} planned` : null, spark: n.spend.spark },
          { label: "Sales from ads", value: money(n.sales.value, cur), change: delta(n.sales.change), spark: n.sales.spark },
          { label: "Cost per order", value: n.costPerOrder.value !== null ? money(n.costPerOrder.value, cur) : "No orders yet", change: cpoDiff !== null ? { text: `${cpoDiff <= 0 ? "−" : "+"}${money(Math.abs(cpoDiff), cur)} ${vs}`, tone: cpoDiff <= 0 ? "good" : "bad" } : null, spark: n.costPerOrder.spark },
          { label: "Click rate", value: n.ctr.value !== null ? pct1(n.ctr.value) : "No clicks yet", change: ctrDiff !== null ? { text: `${pts(ctrDiff)} ${vs}`, tone: ctrDiff >= 0 ? "good" : "bad" } : null, spark: n.ctr.spark },
        ]}
      />

      {t.channels.length > 0 && (
        <Card title="Where your money went, and what came back" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-[14px]">
              <thead>
                <tr className="bg-[#FAF8F3] text-left font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">
                  <th className="px-6 py-3 font-fw-regular">Channel</th>
                  <th className="w-[42%] px-3 py-3 font-fw-regular">Spend (grey) vs sales (purple)</th>
                  <th className="px-3 py-3 font-fw-regular">Spend</th>
                  <th className="px-3 py-3 font-fw-regular">Sales</th>
                  <th className="px-6 py-3 font-fw-regular">Return</th>
                </tr>
              </thead>
              <tbody>
                {t.channels.map((c) => (
                  <tr key={c.platform} className="border-t border-brand-line">
                    <td className="px-6 py-3.5">
                      <span className="flex items-center gap-3 text-[15px] font-fw-medium">
                        <ChannelIcon source={c.platform} />
                        {c.platform === "Google" ? "Google Ads" : c.platform}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="flex flex-col gap-1">
                        <span className="h-2 rounded-full bg-[#C2C3C5]" style={{ width: `${Math.max(2, (c.spend / maxBar) * 100)}%` }} />
                        <span className="h-2 rounded-full" style={{ width: `${Math.max(2, (c.sales / maxBar) * 100)}%`, background: PURPLE }} />
                      </span>
                    </td>
                    <td className="px-3 py-3.5 font-fw-medium tabular-nums">{money(c.spend, cur)}</td>
                    <td className="px-3 py-3.5 font-fw-medium tabular-nums">{c.sales ? money(c.sales, cur) : "–"}</td>
                    <td className="px-6 py-3.5">{c.return !== null ? <StatusPill tone={c.return >= 1 ? "good" : "bad"}>{`${times(c.return)}${c.retailOnly ? " retail" : ""}`}</StatusPill> : <span className="text-brand-ink-2">No sales yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {moneyMeans && <WhatItMeans className="mt-2">{moneyMeans}</WhatItMeans>}
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {t.best.length > 0 && (
            <Card title="Best and worst ads" flush>
              <ul className="m-0 list-none p-0">
                {t.best.map((a) => (
                  <li key={a.id} className="grid grid-cols-[56px_minmax(0,1fr)_88px_96px] items-center gap-4 border-b border-brand-line px-6 py-3.5 last:border-b-0">
                    <span className="size-14 shrink-0 overflow-hidden rounded-[10px]" style={{ background: a.color ?? "#F3EEE3" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- an access-checked asset file */}
                      {a.thumbnail && <img src={a.thumbnail} alt="" className="size-full object-cover" />}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <Link href={`/library/${a.id}?from=insights`} className="truncate text-[15px] font-fw-medium text-brand-ink no-underline hover:underline">
                        {a.title}
                      </Link>
                      <span className="truncate text-[12px] text-brand-ink-2">{[a.platform, a.format?.split(" ")[0]].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex flex-col tabular-nums">
                      <span className="text-[16px] font-fw-medium">{a.orderValue && a.tag !== "Weakest" ? money(a.orderValue, cur) : pct1(a.ctr)}</span>
                      <span className="text-[12px] text-brand-ink-2">{a.orderValue && a.tag !== "Weakest" ? "per order" : "click rate"}</span>
                    </span>
                    <StatusPill tone={a.tag === "Winner" ? "good" : "bad"}>{a.tag === "Winner" ? "Best" : "Weakest"}</StatusPill>
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
            <Card title="Budget this month" flush>
              <div className="flex flex-col gap-3 px-6 pt-5">
                <dl className="m-0 grid grid-cols-3 gap-3">
                  {[
                    ["Planned", money(t.budget.plan, cur)],
                    [days === 30 ? "Spent" : "Spent, last 30 days", money(t.budget.spent, cur)],
                    [t.budget.left >= 0 ? "Left" : "Over", money(Math.abs(t.budget.left), cur)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-0.5">
                      <dt className="text-[13px] text-brand-ink-2">{k}</dt>
                      <dd className={cn("m-0 text-[26px] font-fw-medium tabular-nums", k === "Over" && "text-brand-orange-text")}>{v}</dd>
                    </div>
                  ))}
                </dl>
                <span aria-hidden className="block h-2.5 rounded-full bg-[#EFEBE2]">
                  <span className="block h-full rounded-full" style={{ width: `${Math.min(100, t.budget.share * 100)}%`, background: t.budget.share > 1 ? "#FF5D02" : PURPLE }} />
                </span>
              </div>
              <WhatItMeans className="mt-4" action={
                  <MessagePmButton dot={false} className="inline-flex h-9 items-center rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white hover:opacity-90">
                    Suggest to {pmFirst}
                  </MessagePmButton>
                }>
                {budgetMeans}
              </WhatItMeans>
            </Card>
          )}
          {t.tired.length > 0 && (
            <Card title="Ads getting tired" flush>
              <ul className="m-0 list-none p-0">
                {t.tired.map((a) => (
                  <li key={a.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-brand-line px-6 py-4 last:border-b-0">
                    <span className="size-11 rounded-lg bg-[#F3E6DC]" aria-hidden />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px]">{a.title}</span>
                      <span className="text-[12px] text-brand-ink-2">{["Meta", a.format?.split(" ")[0]].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex flex-col text-right tabular-nums">
                      <span className="text-[16px]">{a.frequency.toFixed(1)}×</span>
                      <span className="text-[12px] text-brand-ink-2">seen per person</span>
                    </span>
                    <span className="flex flex-col text-right tabular-nums">
                      <span className="text-[16px] text-brand-orange-text">
                        {a.ctrBefore.toFixed(1)} → {pct1(a.ctrNow)}
                      </span>
                      <span className="text-[12px] text-brand-ink-2">click rate, 3 weeks</span>
                    </span>
                  </li>
                ))}
              </ul>
              <WhatItMeans
                className="mt-2"
                action={
                  <MeansButton href={`/brief/new?${new URLSearchParams({ q: `Refresh “${t.tired[0].title}”: people see it ${t.tired[0].frequency.toFixed(1)} times and its click rate fell from ${pct1(t.tired[0].ctrBefore)} to ${pct1(t.tired[0].ctrNow)}.` })}`}>Refresh it</MeansButton>
                }
              >
                People have seen {t.tired.length === 1 ? "it" : "them"} too often. A new version usually brings clicks back.
              </WhatItMeans>
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
