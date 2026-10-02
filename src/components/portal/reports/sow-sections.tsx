import { prisma } from "@/lib/prisma";
import { computeContentKpis } from "@/lib/content-calendar-metrics";
import { formatDate, jsonArray } from "@/lib/utils";
import { SectionCard, CardBody, CardNote, CardRows } from "@/components/ds/card";
import { StatTiles, Meter, type Stat } from "@/components/ds/stats";
import { StatusPill } from "@/components/ds/status-pill";
import { NumberedRow } from "@/components/ds/numbered-row";
import { DataTable } from "@/components/ds/data-table";
import { PlatformBadge } from "@/components/portal/platform-icon";

type Breakdown = { label: string; pct: number };
type KpiTarget = { metric: string; target: string; platform: string | null };

/**
 * The SOW's report sections (Section 7: weekly; 7.2: monthly), each one a bullet from the brief filled with
 * real data. Shown behind "Open full report" (weekly) and on the Monthly tab. Metrics without data are
 * left out; nothing is asserted that the numbers don't show.
 */
export async function loadSowData(clientId: string) {
  const [client, kpis, community, audience, competitors, ideas, brief] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, include: { reportingConfig: true } }),
    computeContentKpis(clientId),
    prisma.communityManagementSnapshot.findFirst({ where: { clientId }, orderBy: { periodEnd: "desc" } }),
    prisma.audienceSnapshot.findMany({ where: { clientId }, orderBy: { capturedAt: "desc" } }),
    prisma.competitorProfile.findMany({ where: { clientId }, orderBy: { brand: "asc" } }),
    prisma.marketIntelligenceIdea.findMany({ where: { clientId, status: "NEW" }, orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.performanceBrief.findUnique({ where: { clientId } }),
  ]);
  const now = new Date();
  const ranked = (posts: typeof kpis.publishedPosts) => [...posts].filter((p) => p.engagementRate !== null).sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0));
  const thisMonth = kpis.publishedPosts.filter((p) => p.publishedDate && p.publishedDate.getMonth() === now.getMonth() && p.publishedDate.getFullYear() === now.getFullYear());
  const monthRanked = ranked(thisMonth);
  const audienceByPlatform = new Map<string, (typeof audience)[number]>();
  for (const a of audience) if (!audienceByPlatform.has(a.platform)) audienceByPlatform.set(a.platform, a);
  return {
    paidInScope: client?.paidMediaInScope ?? true,
    kpiTargets: jsonArray<KpiTarget>(client?.reportingConfig?.kpiTargets),
    kpis,
    topPosts: ranked(kpis.publishedPosts).slice(0, 3),
    wow: kpis.followerGrowth.map((f) => {
      const latest = f.series[f.series.length - 1];
      const prior = f.series.length > 1 ? f.series[f.series.length - 2] : null;
      const pct = prior && prior.followerCount > 0 ? Math.round(((latest.followerCount - prior.followerCount) / prior.followerCount) * 1000) / 10 : null;
      return { platform: f.platform, followerCount: latest.followerCount, pct };
    }),
    community,
    audienceByPlatform,
    competitors,
    ideas,
    recommendations: brief ? jsonArray<{ title: string; detail: string }>(brief.recommendations) : [],
    monthTop: monthRanked.slice(0, 3),
    monthUnder: monthRanked.length > 3 ? monthRanked.slice(-2).reverse() : [],
  };
}

type SowData = Awaited<ReturnType<typeof loadSowData>>;

function Bars({ data }: { data: Breakdown[] }) {
  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <div key={d.label} className="grid grid-cols-[96px_minmax(0,1fr)_40px] items-center gap-3 text-[13px]">
          <span className="truncate text-brand-ink-2">{d.label}</span>
          <Meter value={d.pct} max={100} label={`${d.label} ${d.pct}%`} />
          <span className="text-right tabular-nums">{d.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function PostRow({ p, metric }: { p: SowData["topPosts"][number]; metric?: "full" | "engagement" }) {
  const bits = [
    p.impressions !== null && metric === "full" ? `${p.impressions.toLocaleString("en-GB")} impr.` : null,
    p.engagementRate !== null ? `${p.engagementRate}% eng.` : null,
    p.saves !== null && metric === "full" ? `${p.saves} saves` : null,
    p.shares !== null && metric === "full" ? `${p.shares} shares` : null,
    p.videoViews !== null && metric === "full" ? `${p.videoViews.toLocaleString("en-GB")} views` : null,
  ].filter(Boolean);
  return (
    <li className="flex items-center gap-3 px-6 py-3.5">
      <PlatformBadge platform={p.platform} className="size-7" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px]">{p.title}</span>
        <span className="text-[12px] text-brand-ink-2">
          {p.platform}
          {p.contentType ? ` · ${p.contentType}` : ""}
        </span>
      </span>
      <span className="text-right text-[13px] tabular-nums text-brand-ink-2">{bits.join(" · ")}</span>
    </li>
  );
}

/** SOW Section 7: the weekly report's four bullets. */
export function WeeklySow({ data }: { data: SowData }) {
  const { topPosts, wow, community, ideas, recommendations } = data;
  return (
    <>
      <SectionCard title="Top-performing posts" action={<span className="text-[12px] text-brand-ink-2">Impressions, engagement, saves/shares, video views</span>}>
        {topPosts.length === 0 ? (
          <CardNote>No published posts with engagement data yet.</CardNote>
        ) : (
          <CardRows>
            {topPosts.map((p) => (
              <PostRow key={p.id} p={p} metric="full" />
            ))}
          </CardRows>
        )}
      </SectionCard>
      {wow.length > 0 && (
        <SectionCard title="Follower growth, week over week">
          <CardRows>
            {wow.map((f) => (
              <li key={f.platform} className="flex items-center gap-3 px-6 py-3.5">
                <PlatformBadge platform={f.platform} className="size-6" />
                <span className="min-w-0 flex-1 text-[15px]">{f.platform}</span>
                <span className="text-[14px] tabular-nums">
                  {f.followerCount.toLocaleString("en-GB")}
                  {f.pct !== null && (
                    <span className="text-brand-ink-2">
                      {" "}
                      · {f.pct >= 0 ? "+" : ""}
                      {f.pct}% WoW
                    </span>
                  )}
                </span>
              </li>
            ))}
          </CardRows>
        </SectionCard>
      )}
      <SectionCard title="Community" action={community ? <span className="text-[12px] text-brand-ink-2">{formatDate(community.periodStart, { day: "numeric", month: "short" })} – {formatDate(community.periodEnd, { day: "numeric", month: "short" })}</span> : undefined}>
        {!community ? (
          <CardNote>No community snapshot logged yet.</CardNote>
        ) : (
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4 text-[14px]">
              <span>{community.commentVolume} comments</span>
              <span>{community.dmVolume} DMs</span>
              {community.escalations > 0 && <StatusPill tone="watch">{community.escalations} escalation{community.escalations === 1 ? "" : "s"}</StatusPill>}
            </div>
            <Bars
              data={[
                { label: "Positive", pct: community.sentimentPositivePct },
                { label: "Neutral", pct: community.sentimentNeutralPct },
                { label: "Negative", pct: community.sentimentNegativePct },
              ]}
            />
          </CardBody>
        )}
      </SectionCard>
      <SectionCard title="Opportunities and quick hits">
        {ideas.length === 0 && recommendations.length === 0 ? (
          <CardNote>Nothing flagged this week.</CardNote>
        ) : (
          <CardRows as="ol">
            {[...ideas.slice(0, 2), ...recommendations.slice(0, 2)].map((r, i) => (
              <NumberedRow key={i} n={i + 1} title={r.title} detail={r.detail} />
            ))}
          </CardRows>
        )}
      </SectionCard>
    </>
  );
}

/** SOW Section 7.2: the monthly report's six bullets. */
export function MonthlySow({ data }: { data: SowData }) {
  const { kpis, kpiTargets, monthTop, monthUnder, audienceByPlatform, competitors, paidInScope } = data;
  const tiles: Stat[] = [
    { label: "Posts published", value: String(kpis.contentVolumeThisMonth), note: kpis.contentVolumeTarget ? `of ${kpis.contentVolumeTarget} (SOW minimum)` : null },
    ...(kpis.avgEngagementRate !== null ? [{ label: "Engagement rate", value: `${kpis.avgEngagementRate}%` }] : []),
    ...(kpis.avgVideoViews !== null ? [{ label: "Video views, average", value: kpis.avgVideoViews.toLocaleString("en-GB") }] : []),
    ...(kpis.totalWebsiteClicks > 0 ? [{ label: "Website clicks from social", value: kpis.totalWebsiteClicks.toLocaleString("en-GB") }] : []),
  ];
  const actual: Record<string, string | null> = {
    "Follower Growth": kpis.blendedFollowerGrowthPct !== null ? `${kpis.blendedFollowerGrowthPct >= 0 ? "+" : ""}${kpis.blendedFollowerGrowthPct}% MoM` : null,
    "Engagement Rate": kpis.avgEngagementRate !== null ? `${kpis.avgEngagementRate}% avg` : null,
    "Content Volume": kpis.contentVolumeTarget ? `${kpis.contentVolumeThisMonth} of ${kpis.contentVolumeTarget} this month` : `${kpis.contentVolumeThisMonth} this month`,
    "Video Views": kpis.avgVideoViews !== null ? `${kpis.avgVideoViews.toLocaleString("en-GB")} avg` : null,
    "Website Traffic from Social": kpis.totalWebsiteClicks > 0 ? `${kpis.totalWebsiteClicks.toLocaleString("en-GB")} clicks tracked` : null,
  };
  const remaining = Math.max(0, kpis.contentVolumeTarget - kpis.contentVolumeThisMonth);
  return (
    <>
      <SectionCard title="This month across platforms" meta={!paidInScope ? <StatusPill>Organic only</StatusPill> : undefined}>
        <StatTiles tiles={tiles} />
        {kpis.volumeByPlatform.length > 0 && (
          <CardRows className="border-t border-brand-line">
            {kpis.volumeByPlatform.map((v) => (
              <li key={v.platform} className="flex items-center gap-3 px-6 py-3">
                <PlatformBadge platform={v.platform} className="size-5" />
                <span className="min-w-0 flex-1 text-[14px]">{v.platform}</span>
                <span className="text-[13px] tabular-nums text-brand-ink-2">
                  {v.published} of {v.target}
                </span>
              </li>
            ))}
          </CardRows>
        )}
      </SectionCard>

      {kpiTargets.length > 0 && (
        <SectionCard title="Against your KPIs">
          <DataTable
            label="KPIs"
            columns={[
              { key: "kpi", label: "KPI" },
              { key: "target", label: "Target" },
              { key: "actual", label: "Actual" },
            ]}
            rows={kpiTargets.map((t) => ({
              id: t.metric,
              cells: { kpi: t.metric, target: <span className="text-brand-ink-2">{t.target}</span>, actual: actual[t.metric] ?? <span className="text-brand-ink-2">Not measured yet</span> },
            }))}
          />
        </SectionCard>
      )}

      <SectionCard title="Content performance">
        {monthTop.length === 0 ? (
          <CardNote>No published posts with engagement data yet this month.</CardNote>
        ) : (
          <div className="grid grid-cols-1 @min-[600px]/col:grid-cols-2">
            <div>
              <p className="m-0 px-6 pt-4 font-brand-mono text-[11px] text-brand-ink-2">TOP POSTS</p>
              <CardRows>
                {monthTop.map((p) => (
                  <PostRow key={p.id} p={p} metric="engagement" />
                ))}
              </CardRows>
            </div>
            <div className="border-t border-brand-line @min-[600px]/col:border-l @min-[600px]/col:border-t-0">
              <p className="m-0 px-6 pt-4 font-brand-mono text-[11px] text-brand-ink-2">BEHIND THE REST</p>
              {monthUnder.length === 0 ? (
                <CardNote>Nothing meaningfully behind the rest of the month&apos;s content.</CardNote>
              ) : (
                <CardRows>
                  {monthUnder.map((p) => (
                    <PostRow key={p.id} p={p} metric="engagement" />
                  ))}
                </CardRows>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {audienceByPlatform.size > 0 && (
        <SectionCard title="Audience">
          <CardBody className="grid grid-cols-1 gap-6 @min-[600px]/col:grid-cols-2">
            {[...audienceByPlatform].map(([platform, snap]) => (
              <div key={platform} className="flex flex-col gap-3">
                <span className="flex items-center gap-2 font-brand-mono text-[11px] text-brand-ink-2">
                  <PlatformBadge platform={platform} className="size-4" />
                  {platform.toUpperCase()} · AGE
                </span>
                <Bars data={jsonArray<Breakdown>(snap.ageBreakdown)} />
                <span className="font-brand-mono text-[11px] text-brand-ink-2">TOP LOCATIONS</span>
                <Bars data={jsonArray<Breakdown>(snap.topLocations).slice(0, 3)} />
              </div>
            ))}
          </CardBody>
        </SectionCard>
      )}

      <SectionCard title="Competitors">
        {competitors.length === 0 ? (
          <CardNote>No competitor read yet. Generate one in Insights → Market → Competitors.</CardNote>
        ) : (
          <CardRows>
            {competitors.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 px-6 py-4">
                <span className="flex items-center gap-2">
                  <span className="text-[15px]">{c.brand}</span>
                  <StatusPill tone={c.activityLevel === "High" ? "watch" : "neutral"}>{c.activityLevel} activity</StatusPill>
                </span>
                <span className="text-[13px] leading-[1.5] text-brand-ink-2">{c.positioning}</span>
              </li>
            ))}
          </CardRows>
        )}
      </SectionCard>

      <SectionCard title="Next month">
        <CardRows as="ol">
          {monthTop[0] && <NumberedRow n={1} title={`Scale ${monthTop[0].contentType ?? "the top format"} on ${monthTop[0].platform}`} detail={`${monthTop[0].engagementRate}% engagement this month, the best of the month.`} />}
          {monthUnder[0] && <NumberedRow n={monthTop[0] ? 2 : 1} title={`Rework the format on ${monthUnder[0].platform}`} detail={`${monthUnder[0].contentType ?? "This format"} is at ${monthUnder[0].engagementRate}% engagement, behind the rest.`} />}
          <NumberedRow
            n={(monthTop[0] ? 1 : 0) + (monthUnder[0] ? 1 : 0) + 1}
            title={remaining > 0 ? "Close this month's volume, then hold cadence" : "Hold the current cadence"}
            detail={remaining > 0 ? `${remaining} post${remaining === 1 ? "" : "s"} still needed to reach the SOW minimum.` : kpis.contentVolumeTarget ? "Volume is at or above the SOW minimum." : "No SOW minimum is set yet."}
          />
        </CardRows>
      </SectionCard>
    </>
  );
}
