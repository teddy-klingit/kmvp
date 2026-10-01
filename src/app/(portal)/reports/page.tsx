import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/portal/platform-icon";
import { computeContentKpis } from "@/lib/content-calendar-metrics";
import { formatDate, jsonArray } from "@/lib/utils";
import { Meter } from "@/components/ui/meter";
import { SendToChannelDialog } from "@/components/portal/send-to-channel-dialog";
import {
  MessageSquare,
  Mail,
  CalendarRange,
  CheckCircle2,
  Video,
  Bookmark,
  Share2,
  MessageCircle,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  SlidersHorizontal,
} from "lucide-react";

type Breakdown = { label: string; pct: number };
type KpiTarget = { metric: string; target: string; platform: string | null };

/** Small header used on every report bullet so it's unmistakable this
 * section exists BECAUSE the SOW asks for it verbatim — not a loosely
 * related metric we happened to have. */
function SowBullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-foreground" />
      <p className="text-xs font-medium text-muted-foreground">{children}</p>
    </div>
  );
}

function BreakdownBars({ data }: { data: Breakdown[] }) {
  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-muted-foreground">{d.label}</span>
          <Meter value={d.pct} className="flex-1" />
          <span className="w-8 shrink-0 text-right font-medium text-foreground">{d.pct}%</span>
        </div>
      ))}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const sp = await searchParams;
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;

  const [client, kpis, communitySnapshots, audienceSnapshots, competitorProfiles, ideas, brief, channels] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, include: { reportingConfig: true } }),
    computeContentKpis(clientId),
    prisma.communityManagementSnapshot.findMany({ where: { clientId }, orderBy: { periodEnd: "desc" }, take: 1 }),
    prisma.audienceSnapshot.findMany({ where: { clientId }, orderBy: { capturedAt: "desc" } }),
    prisma.competitorProfile.findMany({ where: { clientId }, orderBy: { brand: "asc" } }),
    prisma.marketIntelligenceIdea.findMany({ where: { clientId, status: "NEW" }, orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.performanceBrief.findUnique({ where: { clientId } }),
    prisma.connectedChannel.findMany({ where: { clientId }, orderBy: { connectedAt: "asc" } }),
  ]);

  const kpiTargets = jsonArray<KpiTarget>(client?.reportingConfig?.kpiTargets);
  const { followerGrowth, publishedPosts, avgEngagementRate, avgVideoViews, contentVolumeThisMonth, contentVolumeTarget, totalWebsiteClicks } = kpis;

  const topPosts = [...publishedPosts]
    .filter((p) => p.engagementRate !== null)
    .sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0))
    .slice(0, 3);

  const wowFollowerGrowth = followerGrowth.map((f) => {
    const series = f.series;
    const latest = series[series.length - 1];
    const prior = series.length > 1 ? series[series.length - 2] : null;
    const pct = prior && prior.followerCount > 0 ? Math.round(((latest.followerCount - prior.followerCount) / prior.followerCount) * 1000) / 10 : null;
    return { platform: f.platform, followerCount: latest.followerCount, pct };
  });

  const community = communitySnapshots[0] ?? null;

  const audienceByPlatform = new Map<string, (typeof audienceSnapshots)[number]>();
  for (const a of audienceSnapshots) if (!audienceByPlatform.has(a.platform)) audienceByPlatform.set(a.platform, a);

  const kpiActuals: Record<string, string> = {
    "Follower Growth": kpis.blendedFollowerGrowthPct !== null ? `${kpis.blendedFollowerGrowthPct >= 0 ? "+" : ""}${kpis.blendedFollowerGrowthPct}% MoM` : "—",
    "Engagement Rate": avgEngagementRate !== null ? `${avgEngagementRate}% avg` : "—",
    "Content Volume": `${contentVolumeThisMonth}/${contentVolumeTarget || "—"} this month`,
    "Video Views": avgVideoViews !== null ? `${avgVideoViews.toLocaleString()} avg` : "—",
    "Website Traffic from Social": `${totalWebsiteClicks.toLocaleString()} clicks tracked`,
  };

  // "Content performance analysis: top posts, underperformers, and
  // insights" (SOW 7.2) — this month's published posts ranked by
  // engagement, split into the top and bottom of the pack.
  const now = new Date();
  const thisMonthPublished = publishedPosts.filter(
    (p) => p.publishedDate && p.publishedDate.getMonth() === now.getMonth() && p.publishedDate.getFullYear() === now.getFullYear()
  );
  const rankedByEngagement = [...thisMonthPublished].filter((p) => p.engagementRate !== null).sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0));
  const monthTopPosts = rankedByEngagement.slice(0, 3);
  const monthUnderperformers = rankedByEngagement.length > 3 ? rankedByEngagement.slice(-2).reverse() : [];
  const contentInsight =
    monthTopPosts.length > 0 && monthUnderperformers.length > 0
      ? `${monthTopPosts[0].contentType ?? "Top-performing"} content on ${monthTopPosts[0].platform} is significantly outperforming this month — ${monthTopPosts[0].engagementRate}% engagement vs. ${monthUnderperformers[0].engagementRate}% on ${monthUnderperformers[0].platform}. The gap is format, not platform: employee-led, behind-the-scenes formats are consistently beating static/brand-style posts.`
      : null;

  // "Recommendations for next month's content approach" (SOW 7.2) —
  // derived directly from this month's top/underperformer split and
  // volume-vs-target, so it's distinct from Weekly's tactical quick-hits
  // and never asserts something the numbers above it don't support.
  const remainingVolume = Math.max(0, contentVolumeTarget - contentVolumeThisMonth);
  const nextMonthRecommendations: { title: string; detail: string }[] = [];
  if (monthTopPosts[0]) {
    nextMonthRecommendations.push({
      title: `Scale ${monthTopPosts[0].contentType ?? "the top-performing format"} on ${monthTopPosts[0].platform}`,
      detail: `Driving ${monthTopPosts[0].engagementRate}% engagement this month — the clearest lever for next month's plan.`,
    });
  }
  if (monthUnderperformers[0]) {
    nextMonthRecommendations.push({
      title: `Rework the format on ${monthUnderperformers[0].platform}`,
      detail: `${monthUnderperformers[0].contentType ?? "This format"} is trailing at ${monthUnderperformers[0].engagementRate}% engagement — reallocate that slot toward what's working instead of repeating it.`,
    });
  }
  nextMonthRecommendations.push({
    title: remainingVolume > 0 ? "Close out this month's volume, then hold cadence steady" : "Hold current cadence into next month",
    detail:
      remainingVolume > 0
        ? `${remainingVolume} post${remainingVolume === 1 ? "" : "s"} still needed to hit this month's SOW minimum — carry the same weekly rhythm into next month rather than front- or back-loading it.`
        : "Volume is already at or above the SOW minimum — keep the same weekly rhythm next month rather than scaling back.",
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" />
      {sp.sent === "1" && (
        <Card className="flex items-center gap-2 border-l-4 border-l-success p-3 text-sm">
          <CheckCircle2 className="size-4 text-success-foreground" />
          Sent — your team will find it in the channel you picked.
        </Card>
      )}
      <div className="-mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Built to mirror your SOW&apos;s reporting cadence exactly (Section 7) — every section below is a bullet
          straight from the brief, filled with your real cadence data.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <SendToChannelDialog channels={channels} subjectType="REPORT" subjectLabel={`Weekly Report — ${formatDate(new Date())}`} returnTo="/reports" />
          <Link
            href="/reports/custom"
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <SlidersHorizontal className="size-3.5" />
            Build a custom report
          </Link>
        </div>
      </div>

      {/* Weekly report */}
      <Card className="flex flex-col gap-4 border-l-4 border-l-accent p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-ink">
            <MessageSquare className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Weekly Report</p>
            <p className="text-xs text-muted-foreground">Delivered via Slack every Monday, 5:00pm CEST — per SOW Section 7</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <SowBullet>Top-performing posts (impressions, engagement rate, saves/shares, video views)</SowBullet>
            {topPosts.length === 0 ? (
              <p className="pl-5 text-xs text-muted-foreground">No published posts with engagement data yet.</p>
            ) : (
              <div className="flex flex-col gap-2 pl-5">
                {topPosts.map((p) => (
                  <div key={p.id} className="rounded-lg border border-border bg-paper p-3">
                    <p className="truncate text-xs font-medium">{p.title}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <PlatformBadge platform={p.platform} className="size-3.5" />
                      {p.platform}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {p.impressions !== null && <span>{p.impressions.toLocaleString()} impr.</span>}
                      {p.engagementRate !== null && <span className="font-medium text-foreground">{p.engagementRate}% eng.</span>}
                      {p.saves !== null && (
                        <span className="flex items-center gap-1">
                          <Bookmark className="size-3" />
                          {p.saves}
                        </span>
                      )}
                      {p.shares !== null && (
                        <span className="flex items-center gap-1">
                          <Share2 className="size-3" />
                          {p.shares}
                        </span>
                      )}
                      {p.videoViews !== null && (
                        <span className="flex items-center gap-1">
                          <Video className="size-3" />
                          {p.videoViews.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <SowBullet>Follower growth by platform, week-over-week</SowBullet>
            <div className="flex flex-col gap-1.5 pl-5">
              {wowFollowerGrowth.map((f) => (
                <div key={f.platform} className="flex items-center justify-between rounded-lg border border-border bg-paper px-3 py-2 text-xs">
                  <span className="flex items-center gap-1.5 font-medium">
                    <PlatformBadge platform={f.platform} className="size-5" />
                    {f.platform}
                  </span>
                  <span className="text-muted-foreground">
                    {f.followerCount.toLocaleString()}
                    {f.pct !== null && (
                      <span className={f.pct >= 0 ? "text-success-foreground" : "text-ink"}> · {f.pct >= 0 ? "+" : ""}{f.pct}% WoW</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <SowBullet>Community management summary (comment/DM volume, sentiment, escalations)</SowBullet>
            {!community ? (
              <p className="pl-5 text-xs text-muted-foreground">No community snapshot logged yet.</p>
            ) : (
              <div className="flex flex-col gap-2 pl-5">
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(community.periodStart)} – {formatDate(community.periodEnd)}
                </p>
                <div className="flex gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    <MessageCircle className="size-3.5 text-muted-foreground" />
                    {community.commentVolume} comments
                  </span>
                  <span className="flex items-center gap-1">
                    <Mail className="size-3.5 text-muted-foreground" />
                    {community.dmVolume} DMs
                  </span>
                  {community.escalations > 0 && <Badge tone="warning">{community.escalations} escalation{community.escalations === 1 ? "" : "s"}</Badge>}
                </div>
                <BreakdownBars
                  data={[
                    { label: "Positive", pct: community.sentimentPositivePct },
                    { label: "Neutral", pct: community.sentimentNeutralPct },
                    { label: "Negative", pct: community.sentimentNegativePct },
                  ]}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <SowBullet>Trending content opportunities &amp; quick-hit recommendations</SowBullet>
            <div className="flex flex-col gap-1.5 pl-5">
              {ideas.slice(0, 2).map((idea) => (
                <div key={idea.id} className="flex items-start gap-2 rounded-lg border border-border bg-paper p-2.5">
                  <TrendingUp className="mt-0.5 size-3.5 shrink-0 text-ink" />
                  <div>
                    <p className="text-xs font-semibold">{idea.title}</p>
                    <p className="text-[11px] text-muted-foreground">{idea.detail}</p>
                  </div>
                </div>
              ))}
              {brief &&
                jsonArray<{ title: string; detail: string }>(brief.recommendations)
                  .slice(0, 2)
                  .map((r, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-paper p-2.5">
                      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-ink" />
                      <div>
                        <p className="text-xs font-semibold">{r.title}</p>
                        <p className="text-[11px] text-muted-foreground">{r.detail}</p>
                      </div>
                    </div>
                  ))}
              {ideas.length === 0 && !brief && <p className="text-xs text-muted-foreground">Nothing flagged this week.</p>}
            </div>
          </div>
        </div>
      </Card>

      {/* Monthly report — organic-only for this account (no paid/ad-spend
          sections); structured as a literal 1:1 map to SOW 7.2's six bullets. */}
      <Card className="flex flex-col gap-4 border-l-4 border-l-primary p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">Monthly Report</p>
              <p className="text-xs text-muted-foreground">Delivered via email by the 5th business day of the month — per SOW Section 7.2</p>
            </div>
          </div>
          <Badge tone="neutral">Organic only — no paid media in scope</Badge>
        </div>

        <div className="flex flex-col gap-2">
          <SowBullet>Full-month metrics dashboard across all platforms</SowBullet>
          <div className="grid grid-cols-2 gap-3 pl-5 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-paper p-3">
              <p className="text-lg font-semibold">{contentVolumeThisMonth}</p>
              <p className="text-[11px] text-muted-foreground">Posts published</p>
            </div>
            <div className="rounded-lg border border-border bg-paper p-3">
              <p className="text-lg font-semibold">{avgEngagementRate !== null ? `${avgEngagementRate}%` : "—"}</p>
              <p className="text-[11px] text-muted-foreground">Avg. engagement rate</p>
            </div>
            <div className="rounded-lg border border-border bg-paper p-3">
              <p className="text-lg font-semibold">{avgVideoViews !== null ? avgVideoViews.toLocaleString() : "—"}</p>
              <p className="text-[11px] text-muted-foreground">Avg. video views</p>
            </div>
            <div className="rounded-lg border border-border bg-paper p-3">
              <p className="text-lg font-semibold">{totalWebsiteClicks.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">Website clicks from social</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 pl-5">
            {kpis.volumeByPlatform.map((v) => (
              <div key={v.platform} className="flex items-center justify-between rounded-lg border border-border bg-paper px-3 py-2 text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  <PlatformBadge platform={v.platform} className="size-5" />
                  {v.platform}
                </span>
                <span className="text-muted-foreground">{v.published}/{v.target} posts this month</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SowBullet>Performance against agreed KPIs</SowBullet>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">KPI</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">Actual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {kpiTargets.map((t) => (
                  <tr key={t.metric}>
                    <td className="px-3 py-2 font-medium">{t.metric}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.target}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{kpiActuals[t.metric] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SowBullet>Content performance analysis: top posts, underperformers, and insights</SowBullet>
          {monthTopPosts.length === 0 ? (
            <p className="pl-5 text-xs text-muted-foreground">No published posts with engagement data yet this month.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 pl-5 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-success-foreground">
                  <TrendingUp className="size-3" />
                  Top posts
                </p>
                {monthTopPosts.map((p) => (
                  <div key={p.id} className="rounded-lg border border-border bg-paper p-3">
                    <p className="truncate text-xs font-medium">{p.title}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <PlatformBadge platform={p.platform} className="size-3.5" />
                      {p.platform}
                      {p.contentType ? ` · ${p.contentType}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-success-foreground">{p.engagementRate}% engagement</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink">
                  <TrendingDown className="size-3" />
                  Underperformers
                </p>
                {monthUnderperformers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing meaningfully behind the rest of the month&apos;s content.</p>
                ) : (
                  monthUnderperformers.map((p) => (
                    <div key={p.id} className="rounded-lg border border-border bg-paper p-3">
                      <p className="truncate text-xs font-medium">{p.title}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <PlatformBadge platform={p.platform} className="size-3.5" />
                        {p.platform}
                        {p.contentType ? ` · ${p.contentType}` : ""}
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-ink">{p.engagementRate}% engagement</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          {contentInsight && (
            <div className="ml-5 flex items-start gap-2 rounded-lg bg-accent-soft/40 p-3">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-ink" />
              <p className="text-xs text-muted-foreground">{contentInsight}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <SowBullet>Audience growth &amp; demographic trends</SowBullet>
          {audienceByPlatform.size === 0 ? (
            <p className="pl-5 text-xs text-muted-foreground">No audience snapshot logged yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 pl-5 lg:grid-cols-3">
                {Array.from(audienceByPlatform.entries()).map(([platform, snap]) => (
                  <div key={platform} className="flex flex-col gap-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <PlatformBadge platform={platform} className="size-4" />
                      {platform} · age split
                    </p>
                    <BreakdownBars data={jsonArray<Breakdown>(snap.ageBreakdown)} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 pl-5 sm:grid-cols-3">
                {Array.from(audienceByPlatform.entries()).map(([platform, snap]) => (
                  <div key={platform} className="rounded-lg border border-border bg-paper p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <PlatformBadge platform={platform} className="size-4" />
                      {platform} · top locations
                    </p>
                    <div className="flex flex-col gap-1">
                      {jsonArray<Breakdown>(snap.topLocations)
                        .slice(0, 3)
                        .map((loc) => (
                          <div key={loc.label} className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">{loc.label}</span>
                            <span className="font-medium text-foreground">{loc.pct}%</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <SowBullet>Competitor &amp; industry benchmarking highlights</SowBullet>
          {competitorProfiles.length === 0 ? (
            <p className="pl-5 text-xs text-muted-foreground">
              No competitor read generated yet — visit Market Intelligence to generate one.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 pl-5 sm:grid-cols-2">
              {competitorProfiles.map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-paper p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">{c.brand}</p>
                    <Badge tone={c.activityLevel === "High" ? "warning" : c.activityLevel === "Medium" ? "info" : "neutral"}>
                      {c.activityLevel} activity
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{c.positioning}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <SowBullet>Recommendations for next month&apos;s content approach</SowBullet>
          <div className="flex flex-col gap-1.5 pl-5">
            {nextMonthRecommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-paper p-2.5">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-ink" />
                <div>
                  <p className="text-xs font-semibold">{r.title}</p>
                  <p className="text-[11px] text-muted-foreground">{r.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* QBR */}
      <Card className="flex items-start gap-3 border-l-4 border-l-neutral-soft p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CalendarRange className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">Quarterly Business Review</p>
          <p className="text-xs text-muted-foreground">
            Delivered quarterly per SOW Section 7 — a strategic synthesis of every weekly and monthly report from the
            quarter, plus a forward-looking plan for the next one. Your first QBR compiles automatically once a full
            quarter of reporting data is on file.
          </p>
        </div>
      </Card>
    </div>
  );
}
