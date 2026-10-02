import Link from "next/link";
import { getPortalViewer } from "@/lib/current-viewer";
import { prisma } from "@/lib/prisma";
import { insightSources, loadMeasuredAssets, loadPaidMedia, loadTakeaways, takeawayHref } from "@/lib/insights-data";
import { getRecentMarketSignals } from "@/lib/integrations/market-signals";
import { summarizePlatformCampaigns } from "@/lib/performance";
import { formatLabel } from "@/lib/asset-display";
import { generatePerformanceInsightsAction } from "@/lib/actions/performance-actions";
import { formatMoney } from "@/lib/utils";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard, CardRows, CardNote, CardBody } from "@/components/ds/card";
import { NumberedRow } from "@/components/ds/numbered-row";
import { HBars, StatRows, type Stat } from "@/components/ds/stats";
import { PillLink, monoLink } from "@/components/ds/pill-link";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { ConnectCard } from "@/components/portal/insights/connect-card";

/** "Story 9:16" → "Story 9:16"; "Carousel · 3 slides" → "Carousel": slide counts aren't a different format. */
function formatGroup(format: string) {
  return format.split(" · ")[0];
}

/** "Story · 9:16" → "Story" (the kind, for one-line subtitles). */
function formatKind(format: string) {
  return formatLabel(format).split(" · ")[0];
}

const SIGNAL_KIND: Record<string, string> = { COMPETITOR: "competitor", TREND: "trend", MARKET: "industry news", PERFORMANCE: "performance" };

/** Top performer threshold, the same one the Performance tab's tiers use. */
const TOP_CTR = 6.5;
const BELOW_AVG_CTR = 3;

/**
 * Insights Overview (Insights.dc.html): this week's takeaways from the performance agent, CTR by format,
 * best and weakest creative, and a side column with the last 30 days, missing sources and market signals.
 * Every number comes from real data; a metric without data is left out, never shown as "—".
 */
export default async function InsightsOverviewPage() {
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [paid, { all, measured }, { takeaways }, sources, signals, chatProject] = await Promise.all([
    loadPaidMedia(clientId),
    loadMeasuredAssets(clientId),
    loadTakeaways(clientId),
    insightSources(clientId),
    getRecentMarketSignals(clientId, { take: 3 }),
    prisma.project.findFirst({ where: { clientId, status: { notIn: ["ARCHIVED", "DRAFT"] } }, orderBy: { updatedAt: "desc" }, select: { id: true } }),
  ]);

  // CTR by format, delivered work only.
  const groups = new Map<string, { total: number; n: number }>();
  for (const a of measured) {
    const g = groups.get(formatGroup(a.format)) ?? { total: 0, n: 0 };
    g.total += a.ctr;
    g.n += 1;
    groups.set(formatGroup(a.format), g);
  }
  const formats = [...groups].map(([label, g]) => ({ label, value: Math.round((g.total / g.n) * 10) / 10 })).sort((a, b) => b.value - a.value);
  const top = formats[0];
  const bottom = formats[formats.length - 1];
  const ratio = top && bottom && bottom.value > 0 && formats.length > 1 ? top.value / bottom.value : null;

  // Best and weakest creative.
  const sorted = [...measured].sort((a, b) => b.ctr - a.ctr);
  const avg = measured.length ? measured.reduce((s, a) => s + a.ctr, 0) / measured.length : 0;
  const best = sorted.filter((a) => a.ctr >= avg).slice(0, 3);
  const weakest = sorted.filter((a) => a.ctr < BELOW_AVG_CTR).slice(0, 3);

  // Last 30 days (Meta reads last_30d). Only metrics with data.
  const summary = paid.campaigns.length ? summarizePlatformCampaigns(paid.campaigns) : null;
  const stats: Stat[] = [
    ...(summary
      ? [
          {
            label: "Ad spend",
            value: summary.mixedCurrencies ? summary.spendByCurrency.map((s) => formatMoney(s.amount, s.currency)).join(" + ") : formatMoney(summary.totalSpend, summary.currency),
          },
        ]
      : []),
    ...(measured.length ? [{ label: "CTR, delivered creative", value: `${(Math.round(avg * 10) / 10).toFixed(1)}%` }] : []),
    ...(summary ? [{ label: "CTR, all paid ads", value: `${summary.blendedCtr.toFixed(1)}%` }] : []),
    ...(measured.length
      ? [{ label: "Assets tracked", value: String(measured.length), note: `${measured.filter((a) => a.ctr >= TOP_CTR).length} top performers` }]
      : []),
  ];

  const refresh = `/projects/new?${new URLSearchParams({
    idea: "Refresh our weakest creative",
    detail: weakest.map((w) => `${w.title} (${w.project}, ${w.format}): ${w.ctr}% CTR`).join("\n"),
  })}`;

  return (
    <PageGrid
      main={
        <>
          <SectionCard title="This week's takeaways" action={<span className="text-[12px] text-brand-ink-2">By the performance agent</span>}>
            {takeaways.length > 0 ? (
              <CardRows as="ol">
                {takeaways.map((t, i) => (
                  <NumberedRow
                    key={t.title}
                    n={i + 1}
                    title={t.title}
                    detail={t.detail}
                    action={
                      <PillLink href={takeawayHref(t)} className="min-w-[168px]">
                        {t.action.label}
                      </PillLink>
                    }
                  />
                ))}
              </CardRows>
            ) : (
              <div className="flex flex-wrap items-center gap-4 px-6 py-5">
                <p className="m-0 min-w-0 flex-1 basis-[260px] text-[14px] text-brand-ink-2">
                  The performance agent writes this week&apos;s takeaways from your numbers every week. Want them now?
                </p>
                <AgentButton action={generatePerformanceInsightsAction} label="Write takeaways" pendingLabel="Reading the numbers…" />
              </div>
            )}
          </SectionCard>

          {formats.length > 0 && (
            <SectionCard title="Click-through rate by format" action={<span className="text-[13px] text-brand-ink-2">Delivered work · measured CTR</span>}>
              <CardBody className="flex flex-col gap-3.5">
                <HBars rows={formats} />
                {ratio && ratio >= 1.5 && (
                  <span className="text-[12px] text-brand-ink-2">
                    {top.label} gets {ratio.toFixed(1)}× the click-through rate of {bottom.label}.
                  </span>
                )}
              </CardBody>
            </SectionCard>
          )}

          {measured.length > 0 && (
            <SectionCard
              title="Best and weakest creative"
              action={
                <Link href="/insights/performance#creative" className={monoLink}>
                  ALL {all.length} ASSETS
                </Link>
              }
            >
              <div className="grid grid-cols-1 @min-[600px]/col:grid-cols-2">
                <CreativeList label="TOP PERFORMERS" items={best} />
                <div className="border-t border-brand-line @min-[600px]/col:border-l @min-[600px]/col:border-t-0">
                  {weakest.length > 0 ? (
                    <CreativeList label="BELOW AVERAGE" items={weakest} footer={<PillLink href={refresh} size="sm" className="mt-2 self-start">Brief a refresh</PillLink>} />
                  ) : (
                    <div className="flex flex-col gap-1 px-6 pb-5 pt-4">
                      <span className="pb-1.5 text-[12px] text-brand-ink-2">Below average</span>
                      <span className="text-[14px] text-brand-ink-2">Nothing under {BELOW_AVG_CTR}% CTR.</span>
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          )}
        </>
      }
      side={
        <>
          {stats.length > 0 && (
            <SectionCard title={summary ? "Last 30 days" : "Key numbers"} label="Key numbers">
              <StatRows rows={stats} />
            </SectionCard>
          )}
          <ConnectCard missing={sources.missing} connected={sources.connected} href={chatProject ? `/projects/${chatProject.id}?channel=klingit` : "/help"} />
          <SectionCard
            title="Market signals"
            action={
              <Link href="/insights/market" className={monoLink}>
                ALL
              </Link>
            }
          >
            {signals.length === 0 ? (
              <CardNote>No market signals yet. Competitor and news checks run when you open Market.</CardNote>
            ) : (
              <ul className="m-0 list-none py-2 pl-0">
                {signals.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 px-6 py-2.5">
                    <span aria-hidden className="mt-[7px] size-2 shrink-0 bg-brand-lime-strong" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[14px]">{s.title}</span>
                      <span className="text-[12px] text-brand-ink-2">
                        {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(s.publishedAt)} · {SIGNAL_KIND[s.type] ?? s.type.toLowerCase()}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      }
    />
  );
}

function CreativeList({ label, items, footer }: { label: string; items: { id: string; title: string; project: string; format: string; ctr: number; color: string | null }[]; footer?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-6 pb-5 pt-4">
      <span className="pb-1.5 font-brand-mono text-[11px] text-brand-ink-2">{label}</span>
      {items.map((a) => (
        <div key={a.id} className="flex items-center gap-3 py-2">
          <span aria-hidden className="size-10 shrink-0 rounded-[6px]" style={{ backgroundColor: a.color ? `color-mix(in srgb, ${a.color} 16%, white)` : "var(--brand-chip)" }} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px]">{a.title}</span>
            <span className="truncate text-[12px] text-brand-ink-2">
              {a.project} · {formatKind(a.format)}
            </span>
          </span>
          <span className="text-[15px] tabular-nums">{a.ctr.toFixed(1)}%</span>
        </div>
      ))}
      {footer}
    </div>
  );
}
