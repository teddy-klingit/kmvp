import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
import { shortAnswer } from "@/lib/insights/short-answer";
import { count, money, pct1, signedPct, times, vsLabel } from "@/lib/insights/format";
import { SEGMENTS, type SegmentKey } from "@/lib/insights/tabs";
import { marketingPm } from "@/lib/contact-person";
import { BlindSpots, Card, KeyNumbers, ShortAnswer, WhatWeFound, type BlindSpot } from "@/components/insights/tab-parts";
import { WORK_TZ } from "@/lib/working-hours";
import { cn } from "@/lib/utils";

const PURPLE = "#B455B6";
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(d);
type Row = { tab: string; href: string; segment: SegmentKey; headline: string; read: string; change: { text: string; tone: "good" | "bad" | "neutral" } | null };
type Change = { title: string; detail: string | null; href: string; weight: number };

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
  const own = competitors.table[0];
  const rows: Row[] = [
    ...(spend ? [{ tab: "Paid ads", href: "/insights/paid", segment: "channels" as const, headline: `${money(spend, cur)} spent · ${money(paid.numbers.sales.value, cur)} sales`, read: paid.numbers.sales.value ? `${times(paid.numbers.sales.value / spend)} return` : "No sales linked yet", change: pctChange(paid.numbers.sales.change, "sales") }] : []),
    ...(organic.posts ? [{ tab: "Organic social", href: "/insights/organic", segment: "channels" as const, headline: `${count(reach.value)} reach${organic.numbers.followers.growth ? ` · ${organic.numbers.followers.growth >= 0 ? "+" : "−"}${count(Math.abs(organic.numbers.followers.growth))} followers` : ""}`, read: organic.numbers.engagement.value !== null ? `${pct1(organic.numbers.engagement.value)} engagement` : "", change: pctChange(reach.change, "reach") }] : []),
    ...(website.hasVisits ? [{ tab: "Website & search", href: "/insights/website", segment: "channels" as const, headline: `${count(website.numbers.visits.value)} visits${website.numbers.buyRate.value !== null ? ` · ${pct1(website.numbers.buyRate.value)} buy` : ""}`, read: website.numbers.ai.value ? `${count(website.numbers.ai.value)} from AI answers` : "", change: pctChange(website.numbers.visits.change, "visits") }] : []),
    ...(email.hasKlaviyoNumbers ? [{ tab: "Email", href: "/insights/email", segment: "channels" as const, headline: `${money(email.numbers.sales.value, cur)} sales${email.list.subscribers !== null ? ` · ${count(email.list.subscribers)} subscribers` : ""}`, read: email.numbers.open.value !== null ? `${Math.round(email.numbers.open.value)}% open` : "", change: pctChange(email.numbers.sales.change, "sales") }] : []),
    ...(s.sales.value ? [{ tab: "Sales", href: "/insights/sales", segment: "sales" as const, headline: `${money(s.sales.value, cur)} from marketing`, read: [`${count(s.orders.value, { exactUnder: 10_000 })} orders`, s.won.value ? `${Math.round(s.won.value)} retail deals` : null].filter(Boolean).join(" · "), change: pctChange(s.sales.change) }] : []),
    ...(competitors.brands.length && leader ? [{ tab: "Competitors", href: "/insights/competitors", segment: "market" as const, headline: own.aiShare !== null && leader.aiShare! > own.aiShare ? `${brandLabel(leader.brand)} leads AI answers` : `You lead AI answers`, read: own.aiShare !== null ? `You: ${Math.round(own.aiShare * 100)}% · ${brandLabel(leader.brand)}: ${Math.round(leader.aiShare! * 100)}%` : "", change: null }] : []),
  ];

  // ─── Biggest changes: the largest moves across the tabs ─────────────────────
  const organicReels = organic.formats.find((f) => f.format === "Reels");
  const salesTop = sales.from.slice(0, 2).map((g) => (g.group === "Retail deals" ? "retail deals" : g.group === "Email" ? "email" : g.group));
  const changes: Change[] = [
    ...(s.sales.change !== null ? [{ title: `Sales from marketing ${s.sales.change >= 0 ? "up" : "down"} ${Math.abs(Math.round(s.sales.change * 100))}%`, detail: salesTop.length ? `${salesTop.join(" and ").replace(/^./, (c) => c.toUpperCase())} ${s.sales.change >= 0 ? "did most of it" : "still bring the most"}.` : null, href: "/insights/sales", weight: Math.abs(s.sales.change) }] : []),
    ...(reach.change !== null && organic.posts ? [{ title: `Organic reach ${reach.change >= 0 ? "up" : "down"} ${Math.abs(Math.round(reach.change * 100))}%`, detail: organicReels && organicReels.postedBefore !== null && organicReels.postedBefore !== organicReels.posted ? `${organicReels.posted < organicReels.postedBefore ? "Fewer" : "More"} Reels: ${organicReels.posted} against ${organicReels.postedBefore} the period before.` : null, href: "/insights/organic", weight: Math.abs(reach.change) }] : []),
    ...(website.numbers.visits.change !== null && website.hasVisits ? [{ title: `Website visits ${website.numbers.visits.change >= 0 ? "up" : "down"} ${Math.abs(Math.round(website.numbers.visits.change * 100))}%`, detail: null, href: "/insights/website", weight: Math.abs(website.numbers.visits.change) * 0.8 }] : []),
    ...(email.numbers.sales.change !== null && email.hasKlaviyoNumbers ? [{ title: `Sales from email ${email.numbers.sales.change >= 0 ? "up" : "down"} ${Math.abs(Math.round(email.numbers.sales.change * 100))}%`, detail: null, href: "/insights/email", weight: Math.abs(email.numbers.sales.change) * 0.8 }] : []),
    ...(leader?.move ? [{ title: `${brandLabel(leader.brand)}: ${leader.move.title.replace(new RegExp(`^${brandLabel(leader.brand)}\\s*(\\(demo\\))?\\s*`, "i"), "")}`, detail: competitors.questions.find((q) => q.named[0] && q.named[0].toLowerCase() === leader.brand.toLowerCase() && q.ownPosition !== 1) ? `It now leads AI answers for “${competitors.questions.find((q) => q.named[0]?.toLowerCase() === leader.brand.toLowerCase() && q.ownPosition !== 1)!.question}”.` : `${day(leader.move.at)}.`, href: "/insights/competitors", weight: 0.12 }] : []),
  ]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  // ─── The short answer ──────────────────────────────────────────────────────
  const onTrack = goals.find((g) => g.status === "On track");
  const behind = goals.find((g) => g.status === "Behind");
  const watch = [reach.change !== null && reach.change < 0 && organic.posts ? "organic reach" : null, leader && own.aiShare !== null && leader.aiShare! > own.aiShare ? brandLabel(leader.brand) : null].filter(Boolean);
  const answer = shortAnswer(
    `${clientId}:overview:${days}`,
    [
      s.sales.value
        ? s.sales.change !== null
          ? s.sales.change >= 0
            ? `Sales from marketing grew ${Math.round(s.sales.change * 100)}% in the last ${days === 365 ? "12 months" : `${days} days`}${salesTop.length ? `, mostly from ${salesTop.join(" and ")}` : ""}.`
            : `Sales from marketing fell ${Math.abs(Math.round(s.sales.change * 100))}% in the last ${days === 365 ? "12 months" : `${days} days`}.${salesTop.length ? ` ${salesTop.join(" and ").replace(/^./, (c) => c.toUpperCase())} still bring the most.` : ""}`
          : `Marketing brought ${money(s.sales.value, cur)} in the last ${days === 365 ? "12 months" : `${days} days`}.`
        : "Connect your shop or CRM to see what marketing brings in.",
      onTrack || behind ? `You're ${[onTrack ? `on track for ${onTrack.title.replace(/^./, (c) => c.toLowerCase())}` : null, behind ? `${onTrack ? "but " : ""}behind on ${behind.title.replace(/^[\d,.+%]+\s*/, "").replace(/^./, (c) => c.toLowerCase())}` : null].filter(Boolean).join(", ")}.` : null,
      watch.length ? `Watch ${watch.join(" and ")}.` : null,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const blind: BlindSpot[] = status.attention.map((x) => ({ text: `${x.name}: ${x.note ?? "needs reconnecting"}.`, action: { label: "Reconnect", href: "/settings/connections" } }));
  const roasDiff = roas !== null && roasPrev !== null ? roas - roasPrev : null;

  return (
    <div className="flex flex-col gap-6">
      <ShortAnswer text={answer} sources={[...new Set([...sales.sources.spend, ...sales.sources.sales])].map((x) => (x === "Google" ? "Google Ads" : x))} />

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
                <li key={g.id} className="flex flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-3 text-[15px]">
                    {g.title}
                    {g.status && <span className={cn("shrink-0 text-[13px]", g.status === "On track" ? "text-[#6E7D2F]" : "text-brand-orange-text")}>{g.status}</span>}
                  </span>
                  {g.progress !== null && (
                    <span aria-hidden className="relative block h-2.5 rounded-full bg-[#EFEBE2]">
                      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, g.progress * 100)}%`, background: PURPLE }} />
                      {g.expected !== null && <span className="absolute -top-1 h-[18px] w-0.5 bg-brand-ink" style={{ left: `${g.expected * 100}%` }} />}
                    </span>
                  )}
                  {g.line && <span className="text-[13px] text-brand-ink-2">{g.line}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[14px] text-brand-ink-2">No goals on file yet.</p>
          )}
          <p className="m-0 mt-5 text-[13px]">
            <Link href="/dashboard?message=1" className="text-brand-ink-2 underline underline-offset-4">
              Goals come from your client profile · {goals.length ? "edit" : "set them"} with {pmFirst}
            </Link>
          </p>
        </Card>

        {changes.length > 0 && (
          <Card title="Biggest changes" flush>
            <ul className="m-0 list-none p-0">
              {changes.map((c) => (
                <li key={c.title} className="border-b border-brand-line last:border-b-0">
                  <Link href={c.href} className="flex items-center gap-3 px-6 py-4 text-brand-ink no-underline hover:bg-black/[0.02]">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px]">{c.title}</span>
                      {c.detail && <span className="text-[13px] text-brand-ink-2">{c.detail}</span>}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-brand-ink-2" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {rows.length > 0 && (
        <Card title={`Your channels, last ${days === 365 ? "12 months" : `${days} days`}`} flush>
          <ul className="m-0 list-none p-0">
            {rows.map((r) => (
              <li key={r.tab} className="border-b border-brand-line last:border-b-0">
                <Link href={r.href} className="grid grid-cols-[minmax(0,1fr)] gap-1 px-6 py-3.5 text-[14px] text-brand-ink no-underline hover:bg-black/[0.02] min-[800px]:grid-cols-[180px_minmax(0,1.3fr)_minmax(0,1fr)_120px] min-[800px]:items-center min-[800px]:gap-4">
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden className="size-2 rounded-[2px]" style={{ background: SEGMENTS[r.segment].bar }} />
                    {r.tab}
                  </span>
                  <span>{r.headline}</span>
                  <span className="text-brand-ink-2 min-[800px]:text-brand-ink">{r.read}</span>
                  <span className={cn("min-[800px]:text-right", r.change?.tone === "bad" ? "text-brand-orange-text" : r.change?.tone === "good" ? "text-[#6E7D2F]" : "text-brand-ink-2")}>{r.change?.text ?? ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-2">
        <WhatWeFound findings={findings} pm={pmFirst} />
        <BlindSpots items={blind} />
      </div>
    </div>
  );
}
