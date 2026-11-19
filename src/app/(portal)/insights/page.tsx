import Link from "next/link";
import { ArrowDown, ArrowUp, Eye } from "lucide-react";
import { getPortalViewer } from "@/lib/current-viewer";
import { parseRange } from "@/lib/insights/daily";
import { loadSalesTab } from "@/lib/insights/sales-tab";
import { loadPaidTab } from "@/lib/insights/paid-tab";
import { loadOrganicTab } from "@/lib/insights/organic-tab";
import { loadWebsiteTab } from "@/lib/insights/website-tab";
import { loadEmailTab } from "@/lib/insights/email-tab";
import { brandLabel, loadCompetitorsTab } from "@/lib/insights/market-tabs";
import { goalViews } from "@/lib/insights/goals";
import { insightsSourceStatus } from "@/lib/insights/source-status";
import { tabFindings } from "@/lib/insight-records";
import { answerCard, type Signal, type SignalStatus } from "@/lib/insights/short-answer";
import { count, money, pct1, signedPct, times, vsLabel } from "@/lib/insights/format";
import { SEGMENTS, type SegmentKey } from "@/lib/insights/tabs";
import { marketingPm } from "@/lib/contact-person";
import { BlindSpots, Card, KeyNumbers, ShortAnswer, StatusPill, WhatWeFound, type BlindSpot } from "@/components/insights/tab-parts";
import { cn } from "@/lib/utils";

type Row = { tab: string; href: string; segment: SegmentKey; headline: string; read: string; change: { text: string; tone: "good" | "bad" | "neutral" } | null };
type Change = { title: string; value: string; tone: "good" | "bad" | "watch"; detail: string | null; href: string; tab: string; segment: SegmentKey; weight: number };

/**
 * Insights → Overview (Phase X v2, Ins4Overview): "How is our marketing doing, and are we on track for our goals?"
 * The short answer across channels, 4 numbers, the client's goals, the biggest changes, one row per tab (each tab's
 * own headline numbers, so they always match), findings and blind spots.
 */
export default async function InsightsOverviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = parseRange((await searchParams).range);
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [sales, paid, organic, website, email, competitors, goals, status, findings, pm] = await Promise.all([
    loadSalesTab(clientId, { days, model: "shared" }),
    loadPaidTab(clientId, { days }),
    loadOrganicTab(clientId, { days }),
    loadWebsiteTab(clientId, { days }),
    loadEmailTab(clientId, { days }),
    loadCompetitorsTab(clientId, { days }),
    goalViews(clientId),
    insightsSourceStatus(clientId),
    tabFindings(clientId, null, { days: 31, take: 3 }),
    marketingPm(clientId),
  ]);
  const pmFirst = pm?.name.split(" ")[0] ?? "Klingit";
  const cur = sales.currency;
  const vs = vsLabel(days);
  const s = sales.numbers;
  const spend = paid.numbers.spend.value;
  const roas = spend ? s.sales.value / spend : null;
  const roasPrev = s.previous && s.previous.spend ? s.previous.sales / s.previous.spend : null;
  const reach = organic.numbers.reach;
  const tone = (ch: number | null, goodWhenUp = true) => (ch === null ? "neutral" : (ch >= 0) === goodWhenUp ? "good" : "bad") as "good" | "bad" | "neutral";
  const pctChange = (ch: number | null, what = "") => (ch === null ? null : { text: `${signedPct(ch)}${what ? ` ${what}` : ""}`, tone: tone(ch) });

  // ─── Your channels this month: each tab's own headline numbers ──────────────
  const leader = [...competitors.table].filter((r) => !r.own && r.aiShare !== null).sort((a, b) => b.aiShare! - a.aiShare!)[0];
  const own = competitors.table.find((r) => r.own)!;
  const rows: Row[] = [
    ...(spend ? [{ tab: "Paid ads", href: "/insights/paid", segment: "channels" as const, headline: `${money(paid.numbers.sales.value, cur)} sales`, read: `from ${money(spend, cur)} spend${paid.numbers.sales.value ? ` · ${times(paid.numbers.sales.value / spend)}` : ""}`, change: pctChange(paid.numbers.sales.change, "sales") }] : []),
    ...(organic.posts ? [{ tab: "Organic social", href: "/insights/organic", segment: "channels" as const, headline: `${count(reach.value)} reach`, read: organic.numbers.followers.growth ? `${organic.numbers.followers.growth >= 0 ? "+" : "−"}${count(Math.abs(organic.numbers.followers.growth))} followers` : organic.numbers.engagement.value !== null ? `${pct1(organic.numbers.engagement.value)} engagement` : "", change: pctChange(reach.change, "reach") }] : []),
    ...(website.hasVisits ? [{ tab: "Website & search", href: "/insights/website", segment: "channels" as const, headline: `${count(website.numbers.visits.value)} visits`, read: [website.numbers.buyRate.value !== null ? `${pct1(website.numbers.buyRate.value)} buy` : null, website.numbers.ai.value ? `${count(website.numbers.ai.value)} from AI` : null].filter(Boolean).join(" · "), change: pctChange(website.numbers.visits.change) }] : []),
    ...(email.hasKlaviyoNumbers ? [{ tab: "Email", href: "/insights/email", segment: "channels" as const, headline: `${money(email.numbers.sales.value, cur)} sales`, read: email.list.subscribers !== null ? `${count(email.list.subscribers)} subscribers` : "", change: pctChange(email.numbers.sales.change) }] : []),
    ...(s.sales.value ? [{ tab: "Sales", href: "/insights/sales", segment: "sales" as const, headline: money(s.sales.value, cur), read: [`${count(s.orders.value, { exactUnder: 10_000 })} orders`, s.won.value ? `${Math.round(s.won.value)} retail deals` : null].filter(Boolean).join(" · "), change: pctChange(s.sales.change) }] : []),
    ...(competitors.brands.length && leader && own.aiShare !== null ? [{ tab: "Competitors", href: "/insights/competitors", segment: "market" as const, headline: `#${own.rank} in AI answers`, read: leader.aiShare! > own.aiShare ? `${brandLabel(leader.brand)} ${Math.round(leader.aiShare! * 100)}% · you ${Math.round(own.aiShare * 100)}%` : `You ${Math.round(own.aiShare * 100)}% · ${brandLabel(leader.brand)} ${Math.round(leader.aiShare! * 100)}%`, change: null }] : []),
  ];

  // ─── Biggest changes: the largest moves across the tabs ─────────────────────
  const organicReels = organic.formats.find((f) => f.format === "Reels");
  const salesTop = sales.from.slice(0, 2).map((g) => (g.group === "Retail deals" ? "retail deals" : g.group === "Email" ? "email" : g.group));
  const up = (ch: number) => (ch >= 0 ? "good" : "bad") as "good" | "bad";
  const changes: Change[] = [
    ...(s.sales.change !== null ? [{ title: "Sales from marketing", value: signedPct(s.sales.change), tone: up(s.sales.change), detail: salesTop.length ? `${salesTop.join(" and ").replace(/^./, (c) => c.toUpperCase())} ${s.sales.change >= 0 ? "did most of it" : "still bring the most"}` : null, href: "/insights/sales", tab: "Sales", segment: "sales" as const, weight: Math.abs(s.sales.change) }] : []),
    ...(reach.change !== null && organic.posts ? [{ title: "Organic reach", value: signedPct(reach.change), tone: up(reach.change), detail: organicReels && organicReels.postedBefore !== null && organicReels.postedBefore !== organicReels.posted ? `${organicReels.posted} Reels against ${organicReels.postedBefore} the period before` : null, href: "/insights/organic", tab: "Organic social", segment: "channels" as const, weight: Math.abs(reach.change) }] : []),
    ...(website.numbers.visits.change !== null && website.hasVisits ? [{ title: "Website visits", value: signedPct(website.numbers.visits.change), tone: up(website.numbers.visits.change), detail: null, href: "/insights/website", tab: "Website & search", segment: "channels" as const, weight: Math.abs(website.numbers.visits.change) * 0.8 }] : []),
    ...(email.numbers.sales.change !== null && email.hasKlaviyoNumbers ? [{ title: "Sales from email", value: signedPct(email.numbers.sales.change), tone: up(email.numbers.sales.change), detail: null, href: "/insights/email", tab: "Email", segment: "channels" as const, weight: Math.abs(email.numbers.sales.change) * 0.8 }] : []),
    ...(leader && leader.aiShare !== null && own.aiShare !== null && leader.aiShare > own.aiShare ? [{ title: `${brandLabel(leader.brand)} in AI answers`, value: `${Math.round(leader.aiShare * 100)}%`, tone: "watch" as const, detail: `You: ${Math.round(own.aiShare * 100)}%${leader.move ? `. They ${leader.move.title.replace(new RegExp(`^${brandLabel(leader.brand)}\\s*(\\(demo\\))?\\s*`, "i"), "")}` : ""}`, href: "/insights/competitors", tab: "Competitors", segment: "market" as const, weight: 0.12 }] : []),
  ]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  // ─── The short answer ──────────────────────────────────────────────────────
  const behind = goals.find((g) => g.status === "Behind");
  const leads = leader && own.aiShare !== null && leader.aiShare! > own.aiShare;
  const fewerReels = organicReels && organicReels.postedBefore !== null && organicReels.posted < organicReels.postedBefore;
  const signals: Signal[] = [
    ...(s.sales.value && s.sales.change !== null ? [{ id: "sales", status: (s.sales.change >= 0 ? "good" : "attention") as SignalStatus, value: signedPct(s.sales.change), label: `Sales from marketing, now ${money(s.sales.value, cur)}`, weight: 3 }] : []),
    ...(organic.posts && reach.change !== null ? [{ id: "reach", status: (reach.change >= 0 ? "good" : "attention") as SignalStatus, value: signedPct(reach.change), label: `Organic reach${reach.change < 0 && fewerReels ? ", because of fewer Reels" : ""}`, weight: 1 + Math.abs(reach.change) * 10 }] : []),
    ...(leads ? [{ id: "ai", status: "watch" as const, value: `${Math.round(leader.aiShare! * 100)}% vs ${Math.round(own.aiShare! * 100)}%`, label: `${brandLabel(leader.brand)} is named more than you in AI answers`, weight: 1.5 }] : []),
    ...(behind ? [{ id: "goal", status: "attention" as const, value: behind.line?.split(" · ")[0] ?? "Behind", label: `${behind.title}: behind`, weight: 0.8 }] : []),
    ...(email.hasKlaviyoNumbers && email.numbers.sales.change !== null ? [{ id: "email", status: (email.numbers.sales.change >= 0 ? "good" : "attention") as SignalStatus, value: signedPct(email.numbers.sales.change), label: "Sales from email", weight: 0.6 }] : []),
  ];
  const needs = [organic.posts && reach.change !== null && reach.change < 0 ? "organic reach" : null, behind ? "community" : null, leads ? "AI visibility" : null].filter(Boolean) as string[];
  const needList = (needs.length > 2 ? `${needs.slice(0, -1).join(", ")} and ${needs.at(-1)}` : needs.join(" and ")).replace(/^./, (c) => c.toUpperCase());
  const card = answerCard(`${clientId}:overview:${days}`, {
    headline: [
      s.sales.value ? (s.sales.change === null ? `Marketing brought ${money(s.sales.value, cur)}.` : `Sales are ${s.sales.change >= 0 ? "up" : "down"}.`) : "Connect your shop or CRM to see what marketing brings in.",
      needs.length ? `${needList} need${needs.length === 1 ? "s" : ""} attention.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    signals,
  });

  const blind: BlindSpot[] = status.attention.map((x) => ({ text: `${x.name}: ${x.note ?? "needs reconnecting"}.`, action: { label: "Reconnect", href: "/settings/connections" } }));
  const roasDiff = roas !== null && roasPrev !== null ? roas - roasPrev : null;

  return (
    <div className="flex flex-col gap-6">
      <ShortAnswer card={card} sources={[...new Set([...sales.sources.spend, ...sales.sources.sales])].map((x) => (x === "Google" ? "Google Ads" : x))} />

      <KeyNumbers
        items={[
          { label: "Sales from marketing", value: s.sales.value ? money(s.sales.value, cur) : "Not connected", change: s.sales.change !== null ? { text: `${signedPct(s.sales.change)} ${vs}`, tone: tone(s.sales.change) } : null, spark: s.sales.spark },
          { label: "Sales ÷ ad spend", value: roas !== null ? times(roas) : "No ad spend", change: roasDiff !== null ? { text: `${roasDiff >= 0 ? "+" : "−"}${Math.abs(roasDiff).toFixed(1)}× ${vs}`, tone: tone(roasDiff) } : null },
          { label: "New customers", value: s.fresh.value ? count(s.fresh.value, { exactUnder: 10_000 }) : "Not connected", change: s.fresh.change !== null ? { text: `${signedPct(s.fresh.change)} ${vs}`, tone: tone(s.fresh.change) } : null, spark: s.fresh.spark },
          { label: "Organic reach", value: organic.posts ? count(reach.value) : "No numbers yet", change: reach.change !== null && organic.posts ? { text: `${signedPct(reach.change)} ${vs}`, tone: tone(reach.change) } : null, spark: reach.spark },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-2">
        <Card title={`Your goals for ${new Date().getFullYear()}`}>
          {goals.length ? (
            <ul className="m-0 flex list-none flex-col gap-5 p-0">
              {goals.map((g) => (
                <li key={g.id} className="flex flex-col gap-2">
                  <span className="flex items-center justify-between gap-3 text-[15px]">
                    {g.title}
                    {g.status && (
                      <StatusPill tone={g.status === "On track" ? "good" : "bad"}>{g.status}</StatusPill>
                    )}
                  </span>
                  {g.progress !== null && (
                    <span aria-hidden className="relative block h-2.5 rounded-full bg-[#EFEBE2]">
                      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, g.progress * 100)}%`, background: g.status === "Behind" ? "#FF5D02" : "#8D9E47" }} />
                      {g.expected !== null && <span className="absolute -top-1 h-[18px] w-0.5 bg-brand-ink" style={{ left: `${g.expected * 100}%` }} />}
                    </span>
                  )}
                  {g.left || g.right ? (
                    <span className="flex justify-between gap-3 text-[13px] text-brand-ink-2">
                      <span>{g.left}</span>
                      <span className="text-right">{g.right}</span>
                    </span>
                  ) : (
                    g.line && <span className="text-[13px] text-brand-ink-2">{g.line}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[14px] text-brand-ink-2">No goals on file yet.</p>
          )}
          {goals.some((g) => g.expected !== null) && <p className="m-0 mt-4 text-[12px] text-brand-mute">| = where you should be today</p>}
          <p className="m-0 mt-3 text-[13px]">
            <Link href="/dashboard?message=1" className="text-brand-ink-2 underline underline-offset-4">
              Goals come from your client profile · {goals.length ? "edit" : "set them"} with {pmFirst}
            </Link>
          </p>
        </Card>

        {changes.length > 0 && (
          <Card title={days === 30 ? "Biggest changes this month" : "Biggest changes"} flush>
            <ul className="m-0 list-none p-0">
              {changes.map((c) => {
                const Icon = c.tone === "good" ? ArrowUp : c.tone === "bad" ? ArrowDown : Eye;
                return (
                  <li key={c.title} className="border-b border-brand-line last:border-b-0">
                    <Link href={c.href} className="grid grid-cols-[32px_72px_minmax(0,1fr)_auto] items-center gap-3 px-6 py-4 text-brand-ink no-underline hover:bg-black/[0.02]">
                      <span className={cn("flex size-8 items-center justify-center rounded-full", c.tone === "good" ? "bg-[#EEF4DA] text-[#6E7D2F]" : c.tone === "bad" ? "bg-[#FFF1E8] text-brand-orange" : "bg-[#EEF1FA] text-[#5B6FB0]")} aria-hidden>
                        <Icon className="size-4" strokeWidth={2} />
                      </span>
                      <span className={cn("text-[20px] font-fw-semibold tabular-nums", c.tone === "good" ? "text-[#6E7D2F]" : c.tone === "bad" ? "text-brand-orange-text" : "text-[#5B6FB0]")}>{c.value}</span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[15px] font-fw-medium">{c.title}</span>
                        {c.detail && <span className="text-[13px] text-brand-ink-2">{c.detail}</span>}
                      </span>
                      <span className="hidden items-center gap-1.5 whitespace-nowrap text-[12px] text-brand-ink-2 min-[560px]:flex">
                        <span aria-hidden className="size-2 rounded-[2px]" style={{ background: SEGMENTS[c.segment].bar }} />
                        {c.tab} ›
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      {rows.length > 0 && (
        <Card title={days === 30 ? "Your channels this month" : `Your channels, last ${days === 365 ? "12 months" : `${days} days`}`} flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead>
                <tr className="bg-[#FAF8F3] text-left font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">
                  <th className="w-[56px] py-3 pl-6 font-normal" aria-label="Segment" />
                  <th className="px-3 py-3 font-normal">Channel</th>
                  <th className="px-3 py-3 font-normal">Result</th>
                  <th className="px-3 py-3 font-normal">Key detail</th>
                  <th className="px-6 py-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tab} className="border-t border-brand-line">
                    <td className="py-3.5 pl-6">
                      <span aria-hidden className="flex size-6 items-center justify-center rounded-md" style={{ background: SEGMENTS[r.segment].tint }}>
                        <span className="size-2 rounded-[2px]" style={{ background: SEGMENTS[r.segment].bar }} />
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <Link href={r.href} className="font-fw-medium text-brand-ink no-underline hover:underline">
                        {r.tab}
                      </Link>
                    </td>
                    <td className="px-3 py-3.5 text-[16px] font-fw-medium tabular-nums">{r.headline}</td>
                    <td className="px-3 py-3.5 text-brand-ink-2">{r.read}</td>
                    <td className="px-6 py-3.5">{r.change ? <StatusPill tone={r.change.tone === "neutral" ? "neutral" : r.change.tone}>{r.change.text}</StatusPill> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-2">
        <WhatWeFound findings={findings} pm={pmFirst} />
        <BlindSpots items={blind} />
      </div>
    </div>
  );
}
