import { connectHref, ctrByFormat, loadMeasuredAssets, loadPaidMedia } from "@/lib/insights-data";
import { compact, dayLabel, loadDaily, money, pct, type RangeDays } from "@/lib/insights/daily";
import { cn } from "@/lib/utils";
import { FilterChips } from "@/components/ds/filter-chips";
import { PillLink } from "@/components/ds/pill-link";
import { ChartCard, SkeletonChart } from "@/components/insights/cards";
import { BarList, ColumnChart, LineChart } from "@/components/insights/charts";
import { SubBar } from "@/components/insights/toolbar";
import { Suspense } from "react";

/** A campaign whose CTR is under half the reference (creative average, or the account's own) needs a look. */
const FAR_BELOW = 0.5;

/**
 * Paid ads → "All campaigns" (Phase X v2, closed by default): the detail PMs and specialists want under the tab's
 * summary: spend and clicks per day, every campaign with its CTR, and CTR by format, with a platform filter.
 */
export async function AllCampaigns({ clientId, days, platform, range }: { clientId: string; days: RangeDays; platform?: string; range?: string }) {
  const [paid, daily, { measured }, connect] = await Promise.all([loadPaidMedia(clientId), loadDaily(clientId, days, platform ?? null), loadMeasuredAssets(clientId), connectHref(clientId)]);

  const platforms = daily.platforms.length ? daily.platforms : [...new Set(paid.campaigns.map((c) => c.platform))];
  const href = (p?: string) => {
    const q = new URLSearchParams();
    if (p) q.set("platform", p);
    if (range) q.set("range", range);
    return `/insights/paid${q.size ? `?${q}` : ""}#all-campaigns`;
  };
  const fallback = platform ? paid.campaigns.filter((c) => c.platform === platform) : paid.campaigns;
  const currency = daily.currency ?? fallback[0]?.currency ?? null;

  const avg = measured.length ? measured.reduce((a, m) => a + m.ctr, 0) / measured.length : null;
  const campaigns = daily.has
    ? daily.campaigns.map((c) => ({ id: `${c.platform}:${c.campaignId}`, name: c.name, sub: `${c.platform} · ${c.accountName}${c.live ? " · live" : ""}`, spend: c.spend, impressions: c.impressions, clicks: c.clicks, ctr: c.ctr, live: c.live }))
    : fallback.map((c) => ({ id: `${c.platform}:${c.campaignId}`, name: c.campaignName, sub: `${c.platform} · ${c.accountName}`, spend: c.spend, impressions: c.impressions, clicks: c.clicks, ctr: c.ctr, live: !paid.isSample }));
  const reference = avg ?? (daily.has ? daily.totals.ctr : null);
  const maxSpend = Math.max(...campaigns.map((c) => c.spend), 1);
  const flagged = (ctr: number) => reference !== null && ctr < reference * FAR_BELOW;

  const formats = ctrByFormat(measured);
  const xEvery = days === 7 ? 1 : days === 30 ? 7 : days === 90 ? 14 : 60;

  return (
    <div className="flex flex-col gap-6">
      <Suspense>
        <SubBar
          chips={
            platforms.length > 1 ? (
              <FilterChips label="Platform" items={[{ label: "All platforms", href: href(), active: !platform }, ...platforms.map((p) => ({ label: p, href: href(p), active: platform === p }))]} />
            ) : null
          }
        />
      </Suspense>
            {daily.has ? (
              <ChartCard
                title="Spend and clicks per day"
                table={{ columns: ["Day", `Spend${currency ? `, ${currency}` : ""}`, "Clicks", "Impressions"], rows: daily.days.map((d) => [dayLabel(d.date), Math.round(d.spend), d.clicks, d.impressions]) }}
              >
                <span className="text-[16px]">Spend{currency ? `, ${currency}` : ""}</span>
                <ColumnChart data={daily.days.map((d) => ({ x: dayLabel(d.date), values: [d.spend] }))} series={[{ name: "Spend" }]} height={180} xEvery={xEvery} />
                <span className="pt-3 text-[16px]">Clicks</span>
                <LineChart x={daily.days.map((d) => dayLabel(d.date))} series={[{ name: "Clicks", values: daily.days.map((d) => d.clicks) }]} height={140} xEvery={xEvery} />
              </ChartCard>
            ) : paid.inScope && !paid.isSample && paid.connected.length === 0 ? (
              <ChartCard title="Spend and clicks per day">
                <SkeletonChart line="Connect an ad account to see every day's spend and clicks." action={<PillLink href={connect} size="sm">Connect</PillLink>} />
              </ChartCard>
            ) : null}

            {campaigns.length > 0 && (
              <ChartCard
                flush
                title="Campaigns"
                meta={<span className="font-brand-mono text-[12px] text-brand-ink">{paid.isSample ? `${campaigns.length} SAMPLE` : `${campaigns.filter((c) => c.live).length} LIVE`}</span>}
                table={{ columns: ["Campaign", "Spend", "Impressions", "Clicks", "CTR"], rows: campaigns.map((c) => [c.name, money(c.spend, currency), c.impressions, c.clicks, `${c.ctr}%`]) }}
              >
                <div className="@container/table">
                  <div className="grid grid-cols-[minmax(0,1fr)_96px_72px] gap-3 border-b border-brand-line px-6 py-3 text-[13px] text-brand-mute @min-[640px]/table:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_80px_64px_72px]">
                    <span>Campaign</span>
                    <span>Spend</span>
                    <span className="hidden @min-[640px]/table:block">Impressions</span>
                    <span className="hidden @min-[640px]/table:block">Clicks</span>
                    <span>CTR</span>
                  </div>
                  <ul className="m-0 list-none p-0">
                    {campaigns.map((c) => (
                      <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_96px_72px] items-center gap-3 border-b border-brand-line px-6 py-3.5 last:border-b-0 @min-[640px]/table:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_80px_64px_72px]">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[15px]">{c.name}</span>
                          <span className="truncate text-[12px] text-brand-mute">{c.sub}</span>
                        </span>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span aria-hidden className="hidden h-2 shrink-0 rounded-r-[4px] bg-brand-ink @min-[640px]/table:block" style={{ width: `${Math.max(4, (c.spend / maxSpend) * 72)}px` }} />
                          <span className="truncate text-[14px] tabular-nums">{money(c.spend, currency)}</span>
                        </span>
                        <span className="hidden text-[14px] tabular-nums @min-[640px]/table:block">{compact(c.impressions)}</span>
                        <span className="hidden text-[14px] tabular-nums @min-[640px]/table:block">{c.clicks.toLocaleString("en-GB")}</span>
                        <span className="flex items-center gap-1.5 text-[14px] tabular-nums">
                          {flagged(c.ctr) && <span aria-label="Far below average" className="size-2 rounded-full bg-brand-orange" />}
                          {pct(c.ctr)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {reference !== null && campaigns.some((c) => flagged(c.ctr)) && (
                    <p className="m-0 flex items-center gap-1.5 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">
                      <span aria-hidden className="size-2 rounded-full bg-brand-orange" />
                      Far below your {avg !== null ? "creative" : "account"} average ({pct(reference)})
                    </p>
                  )}
                </div>
              </ChartCard>
            )}

            {formats.length > 0 && (
              <ChartCard title="CTR by format" table={{ columns: ["Format", "CTR", "Assets"], rows: formats.map((f) => [f.label, `${f.value}%`, f.count]) }}>
                <BarList rows={formats.map((f) => ({ label: f.label, value: f.value, display: `${f.value}%`, tone: avg !== null && f.value >= avg ? "ink" : "grey" }))} labelWidth={120} compact />
              </ChartCard>
            )}

            {paid.errors.map((e) => (
              <ChartCard key={e.platform} title={`Couldn't reach ${e.platform} Ads`}>
                <span className={cn("text-[13px] text-brand-ink-2")}>{e.message}</span>
              </ChartCard>
            ))}
    </div>
  );
}
