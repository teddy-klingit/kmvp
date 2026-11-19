import Link from "next/link";
import { ChevronRight, Crosshair } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { loadTrendsTab } from "@/lib/insights/market-tabs";
import { askedAbout, tabFindings } from "@/lib/insight-records";
import { hrefAliases } from "@/lib/insights/tabs";
import { answerCard, type Signal, type SignalStatus } from "@/lib/insights/short-answer";
import { entitlements } from "@/lib/entitlements";
import { marketingPm } from "@/lib/contact-person";
import { AskIdeaButton } from "@/components/insights/ask-idea-button";
import { BlindSpots, Card, ShortAnswer, StatusPill, WhatItMeans, WhatWeFound, type BlindSpot } from "@/components/insights/tab-parts";
import { WORK_TZ } from "@/lib/working-hours";
import { cn } from "@/lib/utils";

const BLUE = "#5B6FB0";
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(d);
const STAGE: Record<string, string> = { Early: "bg-[#EEF3D6]", Rising: "bg-[#FCEFD9]", Peaking: "bg-[#FDE7DC]", Fading: "bg-[#EFEBE2]" };
const signedPct = (c: number) => `${c >= 0 ? "+" : "−"}${Math.round(Math.abs(c) * 100)}%`;
type Theme = { theme: string; articleTitles: string[] };

function Line({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 96 + 2).toFixed(1)},${(30 - ((v - min) / span) * 26).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 100 34" className="h-8 w-24" aria-hidden>
      <polyline points={pts} fill="none" stroke={BLUE} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Insights → Trends (Phase X v2, Ins4Trends): "What's rising that we could use, and what's coming up?" The short
 * answer, what's rising in the category (12-week line, stage, fit for the brand, its opportunity or Ask for an
 * idea), moments coming up (flagging ones with nothing in the Planner), demand for the category, findings and blind
 * spots. Top trends on Pro; all of them on Enterprise.
 */
export default async function TrendsPage() {
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const ent = await entitlements(clientId);
  const [t, findings, pm, brief] = await Promise.all([loadTrendsTab(clientId, { tier: ent.tier }), tabFindings(clientId, hrefAliases("/insights/trends")), marketingPm(clientId), prisma.trendBrief.findUnique({ where: { clientId } })]);
  const pmFirst = pm?.name.split(" ")[0] ?? "Klingit";
  const category = viewer.client.industry ?? "your category";
  const asked = await askedAbout(clientId, "trend", t.rows.map((r) => r.topic));
  const notPlanned = t.moments.filter((m) => !m.planned && !m.opportunity);
  const rising = [...t.rows].filter((r) => r.change > 0).sort((a, b) => b.change - a.change)[0];

  const signals: Signal[] = [
    ...(rising ? [{ id: "rising", status: "good" as const, value: signedPct(rising.change), label: `${rising.topic}, last 12 weeks`, weight: 3 }] : []),
    ...(t.demand?.change != null ? [{ id: "demand", status: (t.demand.change >= 0 ? "good" : "attention") as SignalStatus, value: signedPct(t.demand.change), label: "Category demand vs last year", weight: 2 }] : []),
    ...(notPlanned.length ? [{ id: "moments", status: "attention" as const, value: String(notPlanned.length), label: `Moment${notPlanned.length === 1 ? "" : "s"} in the next 90 days with nothing planned`, weight: 2.5 }] : []),
  ];
  const card = answerCard(`${clientId}:trends`, {
    headline: rising ? `${rising.topic.replace(/^./, (c) => c.toUpperCase())} is the fastest-rising trend.` : "Trends show here once the weekly trend check has run.",
    signals,
  });

  const themes = jsonArray<Theme>(brief?.themes).sort((a, b) => b.articleTitles.length - a.articleTitles.length).slice(0, 4);
  const blind: BlindSpot[] = [
    ...(t.rows.length ? [] : [{ text: "Rising searches and social topics for your category: the weekly trend check hasn't run yet.", action: null }]),
    ...(t.hidden ? [{ text: `${t.hidden} more trend${t.hidden === 1 ? "" : "s"} for your category are on ${ent.tier === "enterprise" ? "the full list" : "Enterprise"}.`, action: ent.tier === "enterprise" ? null : { label: "See plans", href: "/settings/plan" } }] : []),
    ...(t.demand ? [] : [{ text: "Demand for your category over the year: search interest arrives with the next trend check.", action: null }]),
  ];
  const maxDemand = t.demand ? Math.max(...t.demand.series.map((s) => s.value)) : 1;
  const minDemand = t.demand ? Math.min(...t.demand.series.map((s) => s.value)) : 0;

  return (
    <div className="flex flex-col gap-6">
      <ShortAnswer card={card} sources={["Search trends", "TikTok", "Instagram"]} />

      {t.rows.length > 0 && (
        <Card title={`What's rising in ${category}`} flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[14px]">
              <thead>
                <tr className="bg-[#FAF8F3] text-left font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">
                  {["Trend", "Change", "Last 12 weeks", "Stage", "Fit for you", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 font-normal first:pl-6 last:pr-6">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.id} className="border-t border-brand-line align-middle">
                    <td className="py-3.5 pl-6 pr-4 text-[15px]">{r.topic}</td>
                    <td className={cn("px-4 py-3.5 text-[16px] tabular-nums", r.change >= 0 ? "text-[#6E7D2F]" : "text-brand-orange-text")}>{signedPct(r.change)}</td>
                    <td className="px-4 py-3.5">
                      <Line values={r.series} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={cn("rounded-md px-2 py-0.5 text-[12px]", STAGE[r.stage] ?? "bg-[#EFEBE2]")}>{r.stage}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex flex-col gap-1">
                        <span aria-label={`Fit ${r.fit} of 3`} className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <span key={i} className={cn("size-2.5 rounded-full", i < r.fit ? "bg-[#8D9E47]" : "bg-[#E6E2D8]")} />
                          ))}
                        </span>
                        {r.fitNote && <span className="text-[12px] text-brand-ink-2">{r.fitNote}</span>}
                      </span>
                    </td>
                    <td className="py-3.5 pl-4 pr-6 text-right">
                      {r.opportunity ? (
                        <Link href={`/opportunities/${r.opportunity.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-[#F5C9B0] bg-[#FFF4EE] px-3 py-1 text-[12px] text-brand-ink no-underline hover:border-brand-orange">
                          <Crosshair className="size-3" strokeWidth={2} /> {r.opportunity.title} <ChevronRight className="size-3" />
                        </Link>
                      ) : (
                        <AskIdeaButton variant="outline" asked={asked.has(r.topic)} pm={pmFirst} about={{ question: r.topic, value: signedPct(r.change), sources: ["Search trends"], href: "/insights/trends", kind: "trend" }} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">
            <span>Early: just starting</span>
            <span>Rising: best time to act</span>
            <span>Peaking: crowded</span>
            <span>Fading: skip</span>
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          {t.moments.length > 0 && (
            <Card title="Moments coming up" flush action={<Link href="/planner" className="font-brand-mono text-[12px] uppercase text-brand-ink underline underline-offset-4">Open Planner</Link>}>
              <ul className="m-0 list-none p-0">
                {t.moments.map((m) => {
                  const planned = Boolean(m.planned || m.opportunity);
                  return (
                    <li key={m.id} className="grid grid-cols-[52px_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-brand-line px-6 py-3.5 text-[14px] last:border-b-0">
                      <span className="text-[13px] text-brand-ink-2">{day(m.date)}</span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[15px]">{m.name}</span>
                        <span className="text-[12px] text-brand-ink-2">{m.planned ? (m.planned.briefed ? "Briefed" : "In your Planner") : m.opportunity ? "Opportunity open" : m.briefPassed ? "Brief now" : `Brief by ${day(m.briefBy)}`}</span>
                      </span>
                      <StatusPill tone={planned ? "good" : "bad"}>{planned ? "Planned" : "Not planned"}</StatusPill>
                      {planned ? (
                        <span className="w-[84px]" />
                      ) : (
                        <Link href={`/brief/new?${new URLSearchParams({ q: `A post or campaign for ${m.name} (${day(m.date)}).` })}`} className="inline-flex h-8 w-[84px] items-center justify-center rounded-full border border-brand-ink font-brand-mono text-[12px] text-brand-ink no-underline hover:bg-brand-ink hover:text-white">
                          Brief it
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <WhatWeFound findings={findings} pm={pmFirst} />
          {!t.rows.length && themes.length > 0 && (
            <Card title="In the news for your category" flush>
              <ul className="m-0 list-none p-0">
                {themes.map((x) => (
                  <li key={x.theme} className="flex justify-between gap-3 border-b border-brand-line px-6 py-3.5 text-[14px] last:border-b-0">
                    <span>{x.theme}</span>
                    <span className="text-brand-ink-2">
                      {x.articleTitles.length} headline{x.articleTitles.length === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {t.demand && (
            <Card title="Demand for your category" flush>
              <div className="flex flex-col gap-2 px-6 pt-5">
                {t.demand.change !== null && (
                  <p className="m-0 flex flex-wrap items-baseline gap-x-3">
                    <span className={cn("text-[34px] font-light tabular-nums", t.demand.change >= 0 ? "text-[#6E7D2F]" : "text-brand-orange-text")}>{signedPct(t.demand.change)}</span>
                    <span className="text-[14px] text-brand-ink-2">{t.demand.label ?? "searches for your category vs last year"}</span>
                  </p>
                )}
                <svg viewBox="0 0 300 90" className="h-24 w-full" preserveAspectRatio="none" aria-hidden>
                  <polyline
                    points={t.demand.series.map((s, i) => `${((i / Math.max(1, t.demand!.series.length - 1)) * 296 + 2).toFixed(1)},${(84 - ((s.value - minDemand) / Math.max(1, maxDemand - minDemand)) * 76).toFixed(1)}`).join(" ")}
                    fill="none"
                    stroke={BLUE}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <span className="flex justify-between text-[12px] text-brand-ink-2">
                  <span>{t.demand.series[0].label}</span>
                  <span>{t.demand.series[t.demand.series.length - 1].label}</span>
                </span>
              </div>
              {t.demand.note ? <WhatItMeans className="mt-4">{t.demand.note}</WhatItMeans> : <div className="h-6" />}
            </Card>
          )}
          <BlindSpots items={blind} />
        </div>
      </div>
    </div>
  );
}
