import { Suspense } from "react";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { connectHref, insightSources, loadAudienceData, loadContentKpis } from "@/lib/insights-data";
import { contentFormatPerformance } from "@/lib/content-calendar-metrics";
import { compact, dayLabel, parseRange, pct, sinceDays } from "@/lib/insights/daily";
import { PageGrid } from "@/components/ds/page-grid";
import { FilterChips } from "@/components/ds/filter-chips";
import { PillLink } from "@/components/ds/pill-link";
import { pillClass } from "@/components/ds/button";
import { resolveCommunityEscalationAction } from "@/lib/actions/community-actions";
import { ConnectCard } from "@/components/portal/insights/connect-card";
import { ChartCard, SkeletonChart, StatTile } from "@/components/insights/cards";
import { BarList, Legend, LineChart, StackBar } from "@/components/insights/charts";
import { SERIES } from "@/components/insights/tokens";
import { SubBar } from "@/components/insights/toolbar";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const FUNNEL_SHADES = ["#1E1E1E", "#4A4A4A", "#6E6E6E", "#9A9A9A", "#C2C3C5"];
const Demo = () => <span className="rounded-full bg-brand-peach-pale px-2.5 py-0.5 text-[12px] text-brand-orange-text">Demo data</span>;

/**
 * Insights → Audience (InsightsAudience.dc.html): tiles, follower growth, from visit to purchase, what people
 * say and engagement by post type. Each block is a grey skeleton with Connect until its source has data, and
 * every block filled from a demo source says so.
 */
export default async function AudiencePage({ searchParams }: { searchParams: Promise<{ range?: string; platform?: string }> }) {
  const { range, platform } = await searchParams;
  const days = parseRange(range);
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [{ community, website, escalations }, kpis, sources, connect] = await Promise.all([loadAudienceData(clientId), loadContentKpis(clientId), insightSources(clientId), connectHref(clientId)]);
  const since = sinceDays(days);
  // Demo data says so: a demo account, or a source filled with dummy data.
  const socialDemo = viewer.client.isDemo || sources.demo.includes("LinkedIn") || sources.demo.includes("Instagram");
  const siteDemo = viewer.client.isDemo || sources.demo.includes("Google Analytics");

  const socialPlatforms = [...new Set([...kpis.followerGrowth.map((f) => f.platform), ...kpis.publishedPosts.map((p) => p.platform)])];
  const showWebsite = !platform || platform === "Website";
  const showSocial = platform !== "Website";
  const href = (p?: string) => {
    const q = new URLSearchParams();
    if (p) q.set("platform", p);
    if (range) q.set("range", range);
    return `/insights/audience${q.size ? `?${q}` : ""}`;
  };
  const chips = [{ label: "All", href: href(), active: !platform }, ...socialPlatforms.map((p) => ({ label: p, href: href(p), active: platform === p })), ...(website.length ? [{ label: "Website", href: href("Website"), active: platform === "Website" }] : [])];

  // Followers: the weekly snapshots inside the range, one line per platform.
  const followers = kpis.followerGrowth.filter((f) => showSocial && (!platform || f.platform === platform));
  const snapDates = [...new Set(followers.flatMap((f) => f.series.filter((s) => s.capturedAt.getTime() >= since).map((s) => iso(s.capturedAt))))].sort();
  const followerSeries = followers.map((f, i) => ({ name: f.platform, color: SERIES[i % SERIES.length], values: snapDates.map((d) => f.series.find((s) => iso(s.capturedAt) === d)?.followerCount ?? null) }));
  const totalFollowers = followers.reduce((a, f) => a + f.followerCount, 0);
  const followerSpark = snapDates.map((d) => followers.reduce((a, f) => a + (f.series.find((s) => iso(s.capturedAt) === d)?.followerCount ?? 0), 0));

  const posts = kpis.publishedPosts.filter((p) => showSocial && (!platform || p.platform === platform) && p.publishedDate && p.publishedDate.getTime() >= since);
  const rated = posts.filter((p) => p.engagementRate !== null);
  const engagement = rated.length ? rated.reduce((a, p) => a + p.engagementRate!, 0) / rated.length : null;
  const byType = contentFormatPerformance(posts);
  const typeAvg = byType.length ? byType.reduce((a, t) => a + t.ctr, 0) / byType.length : 0;

  const latestC = showSocial ? (community[community.length - 1] ?? null) : null;
  const latestW = showWebsite ? (website[website.length - 1] ?? null) : null;
  // The full funnel when the analytics source gives it, otherwise visits → conversions.
  const funnel = (latestW?.funnel ?? null) as { visitsFromAds: number; productPage: number; addToCart: number; checkout: number; purchase: number } | null;
  const funnelRows = funnel
    ? [
        { label: "Visits from ads", value: funnel.visitsFromAds },
        { label: "Product page", value: funnel.productPage },
        { label: "Add to cart", value: funnel.addToCart },
        { label: "Checkout", value: funnel.checkout },
        { label: "Purchase", value: funnel.purchase },
      ]
    : latestW
      ? [{ label: "Visits", value: latestW.visits }, ...(latestW.socialReferralVisits !== null ? [{ label: "From social", value: latestW.socialReferralVisits }] : []), { label: "Conversions", value: latestW.conversions }]
      : [];
  const drop = funnel
    ? funnelRows.slice(1).map((r, i) => ({ from: funnelRows[i].label, to: r.label, lost: 1 - r.value / (funnelRows[i].value || 1) })).sort((x, y) => y.lost - x.lost)[0]
    : null;
  const themes = jsonArray<{ theme: string; count: number }>(latestC?.themes);
  const period = (s: { periodStart: Date; periodEnd: Date }) => `${dayLabel(iso(s.periodStart))} – ${dayLabel(iso(s.periodEnd))}`;

  return (
    <div className="flex flex-col gap-6">
      <Suspense>
        <SubBar chips={chips.length > 1 ? <FilterChips label="Audience source" items={chips} /> : null} />
      </Suspense>

      <div className="grid grid-cols-2 gap-4 min-[1000px]:grid-cols-4">
        {followers.length > 0 && <StatTile icon="followers" label="Followers" value={compact(totalFollowers)} context={`${followers.map((f) => f.platform).join(" + ")}${socialDemo ? " · demo" : ""}`} spark={followerSpark.length > 1 ? followerSpark : undefined} />}
        {engagement !== null && <StatTile icon="engagement" label="Engagement rate" value={pct(engagement)} context={`${rated.length} organic post${rated.length === 1 ? "" : "s"} · ${days} days`} />}
        {latestC && <StatTile icon="comments" label="Comments" value={latestC.commentVolume.toLocaleString("en-GB")} context={`${period(latestC)}${socialDemo ? " · demo" : ""}`} />}
        {latestW && <StatTile icon="visits" label="Site visits" value={compact(latestW.visits)} context={`${period(latestW)}${siteDemo ? " · demo" : ""}`} />}
      </div>

      <PageGrid
        main={
          <>
            {showSocial && (
              <ChartCard
                title="Follower growth"
                meta={followers.length > 0 && socialDemo ? <Demo /> : undefined}
                table={{ columns: ["Week", ...followerSeries.map((s) => s.name)], rows: snapDates.map((d, i) => [dayLabel(d), ...followerSeries.map((s) => s.values[i] ?? "")]) }}
              >
                {snapDates.length > 1 ? (
                  <>
                    <Legend items={followerSeries.map((s) => ({ label: s.name, color: s.color, line: true }))} />
                    <LineChart x={snapDates.map(dayLabel)} series={followerSeries} height={220} format={{ kind: "compact" }} />
                  </>
                ) : followers.length > 0 ? (
                  <SkeletonChart shape="line" line="Followers are counted weekly: pick 30 or 90 days to see a trend." action={<PillLink href={`/insights/audience?${new URLSearchParams({ range: "90", ...(platform ? { platform } : {}) })}`} size="sm">90 days</PillLink>} />
                ) : (
                  <SkeletonChart shape="line" line="Connect your social accounts to see follower growth." action={<PillLink href={connect} size="sm">Connect</PillLink>} />
                )}
              </ChartCard>
            )}

            {showWebsite && (
              <ChartCard
                title={funnel ? "From ad to purchase" : "From visit to purchase"}
                meta={latestW ? siteDemo ? <Demo /> : <span className="font-brand-mono text-[12px] text-brand-ink">GOOGLE ANALYTICS</span> : undefined}
                table={latestW ? { columns: ["Step", "People"], rows: funnelRows.map((r) => [r.label, r.value]) } : undefined}
              >
                {latestW ? (
                  <>
                    <BarList rows={funnelRows.map((r, i) => ({ label: r.label, value: r.value, display: r.value.toLocaleString("en-GB"), color: FUNNEL_SHADES[Math.min(i, FUNNEL_SHADES.length - 1)] }))} labelWidth={130} />
                    <span className="text-[14px] text-brand-ink-2">
                      {funnel && drop
                        ? `${pct((funnel.purchase / funnel.visitsFromAds) * 100)} of ad visitors buy · biggest drop: ${drop.from.toLowerCase()} → ${drop.to.toLowerCase()}`
                        : `${pct(latestW.conversionRate)} of visits convert · ${period(latestW)}`}
                    </span>
                  </>
                ) : (
                  <SkeletonChart line="Connect Google Analytics to follow visits through to purchases." action={<PillLink href={connect} size="sm">Connect</PillLink>} />
                )}
              </ChartCard>
            )}

            {showSocial && escalations.some((e) => e.status === "OPEN") && (
              <ChartCard flush title="Needs a response" meta={<span className="font-brand-mono text-[12px] text-brand-ink">{escalations.filter((e) => e.status === "OPEN").length} OPEN</span>}>
                <ul className="m-0 list-none p-0">
                  {escalations
                    .filter((e) => e.status === "OPEN")
                    .map((e) => (
                      <li key={e.id} className="flex items-center gap-3 border-b border-brand-line px-6 py-3.5 last:border-b-0">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[15px]">&ldquo;{e.snippet}&rdquo;</span>
                          <span className="text-[13px] text-brand-mute">
                            {e.platform} · {e.sentiment.charAt(0) + e.sentiment.slice(1).toLowerCase()} · {dayLabel(iso(e.createdAt))}
                          </span>
                        </span>
                        <form action={resolveCommunityEscalationAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <button type="submit" className={pillClass("secondary", "sm")}>
                            Mark resolved
                          </button>
                        </form>
                      </li>
                    ))}
                </ul>
              </ChartCard>
            )}
          </>
        }
        side={
          <>
            {showSocial && (
              <ChartCard title="What people say" meta={latestC && socialDemo ? <Demo /> : undefined} table={latestC ? { columns: ["Sentiment", "Share"], rows: [["Positive", `${latestC.sentimentPositivePct}%`], ["Neutral", `${latestC.sentimentNeutralPct}%`], ["Negative", `${latestC.sentimentNegativePct}%`]] } : undefined}>
                {latestC ? (
                  <>
                    <span className="text-[16px]">Comment sentiment, {period(latestC)}</span>
                    <StackBar
                      segments={[
                        { label: "Positive", value: latestC.sentimentPositivePct, display: `${latestC.sentimentPositivePct}%`, color: SERIES[1] },
                        { label: "Neutral", value: latestC.sentimentNeutralPct, display: `${latestC.sentimentNeutralPct}%`, color: "#C2C3C5" },
                        { label: "Negative", value: latestC.sentimentNegativePct, display: `${latestC.sentimentNegativePct}%`, color: SERIES[2] },
                      ]}
                    />
                    <span className="text-[13px] text-brand-mute">
                      {latestC.commentVolume.toLocaleString("en-GB")} comments{latestC.dmVolume ? ` · ${latestC.dmVolume.toLocaleString("en-GB")} DMs` : ""}
                    </span>
                    {themes.length > 0 && (
                      <>
                        <span className="pt-2 text-[16px]">Top themes</span>
                        <BarList rows={themes.map((t, i) => ({ label: t.theme, value: t.count, display: String(t.count), tone: i === 0 ? "ink" : "grey" }))} labelWidth={130} compact />
                      </>
                    )}
                  </>
                ) : (
                  <SkeletonChart line="Comment sentiment appears once your social accounts are connected." action={<PillLink href={connect} size="sm">Connect</PillLink>} />
                )}
              </ChartCard>
            )}

            {showSocial && (
              <ChartCard title="Engagement by post type" table={{ columns: ["Post type", "Engagement", "Posts"], rows: byType.map((t) => [t.key, `${t.ctr}%`, t.count]) }}>
                {byType.length > 0 ? (
                  <BarList rows={byType.map((t) => ({ label: t.key, value: t.ctr, display: `${t.ctr}%`, tone: t.ctr >= typeAvg ? "ink" : "grey" }))} labelWidth={110} compact />
                ) : (
                  <SkeletonChart line={`No published posts with engagement in the last ${days} days.`} />
                )}
              </ChartCard>
            )}

            <ConnectCard missing={sources.missing} connected={sources.connected} href={connect} />
          </>
        }
      />
    </div>
  );
}
