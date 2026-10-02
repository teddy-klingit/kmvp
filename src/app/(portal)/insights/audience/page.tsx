import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { insightSources, loadAudienceData, loadContentKpis } from "@/lib/insights-data";
import { pctChange } from "@/lib/report-filters";
import { resolveCommunityEscalationAction } from "@/lib/actions/community-actions";
import { formatDate } from "@/lib/utils";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard, CardBody, CardNote, CardRows } from "@/components/ds/card";
import { StatTiles, Meter, type Stat } from "@/components/ds/stats";
import { StatusPill } from "@/components/ds/status-pill";
import { pillClass } from "@/components/ds/button";
import { PlatformBadge } from "@/components/portal/platform-icon";
import { FollowerGrowthChart } from "@/components/portal/follower-growth-chart";
import { DiscreteMetricBars } from "@/components/portal/discrete-metric-bars";
import { ConnectCard } from "@/components/portal/insights/connect-card";

const SENTIMENT = { POSITIVE: "success", NEUTRAL: "neutral", NEGATIVE: "danger" } as const;

/** A change only when there's a real previous period. */
function change(current: number | null, previous: number | null) {
  const pct = pctChange(current, previous);
  return pct === null ? null : { pct, vs: "previous period" };
}

/**
 * Insights → Audience: Community (comments, DMs, sentiment, escalations) and Website (visits, conversions,
 * what drives traffic) on one page, plus follower growth. Sections without data are left out; the missing
 * sources are explained in one Connect accounts card.
 */
export default async function AudiencePage() {
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [{ community, escalations, website }, kpis, sources, chatProject] = await Promise.all([
    loadAudienceData(clientId),
    loadContentKpis(clientId),
    insightSources(clientId),
    prisma.project.findFirst({ where: { clientId, status: { notIn: ["ARCHIVED", "DRAFT"] } }, orderBy: { updatedAt: "desc" }, select: { id: true } }),
  ]);

  const latestC = community[community.length - 1] ?? null;
  const open = escalations.filter((e) => e.status === "OPEN");
  const resolved = escalations.filter((e) => e.status === "RESOLVED");
  const communityTiles: Stat[] = latestC
    ? [
        { label: "Comments, latest period", value: latestC.commentVolume.toLocaleString("en-GB") },
        { label: "DMs, latest period", value: latestC.dmVolume.toLocaleString("en-GB") },
        { label: "Positive sentiment", value: `${latestC.sentimentPositivePct}%` },
        { label: "Open escalations", value: String(open.length) },
      ]
    : [];

  const latestW = website[website.length - 1] ?? null;
  const prevW = website.length > 1 ? website[website.length - 2] : null;
  const websiteTiles: Stat[] = latestW
    ? [
        { label: "Visits", value: latestW.visits.toLocaleString("en-GB"), change: change(latestW.visits, prevW?.visits ?? null) },
        { label: "Unique visitors", value: latestW.uniqueVisitors.toLocaleString("en-GB"), change: change(latestW.uniqueVisitors, prevW?.uniqueVisitors ?? null) },
        { label: "Conversions", value: latestW.conversions.toLocaleString("en-GB"), change: change(latestW.conversions, prevW?.conversions ?? null) },
        { label: "Conversion rate", value: `${latestW.conversionRate}%`, change: change(latestW.conversionRate, prevW?.conversionRate ?? null) },
      ]
    : [];
  const socialShare = latestW && latestW.visits > 0 && latestW.socialReferralVisits !== null ? Math.round((latestW.socialReferralVisits / latestW.visits) * 100) : null;
  const drivers = [...kpis.publishedPosts].filter((p) => (p.websiteClicks ?? 0) > 0).sort((a, b) => (b.websiteClicks ?? 0) - (a.websiteClicks ?? 0)).slice(0, 3);
  const followers = kpis.followerGrowth.filter((f) => f.followerCount !== null);

  const short = (d: Date) => formatDate(d, { day: "numeric", month: "short" });

  return (
    <PageGrid
      main={
        <>
          <SectionCard id="community" title="Community" action={latestC ? <span className="text-[13px] text-brand-ink-2">Period ending {short(latestC.periodEnd)}</span> : undefined}>
            {latestC ? (
              <>
                <StatTiles tiles={communityTiles} />
                {community.length > 1 && (
                  <CardBody className="flex flex-col gap-6 border-t border-brand-line">
                    <div className="flex flex-col gap-2">
                      <span className="font-brand-mono text-[11px] text-brand-ink-2">SENTIMENT</span>
                      <FollowerGrowthChart
                        data={community.map((s) => ({ date: short(s.periodEnd), Positive: s.sentimentPositivePct, Neutral: s.sentimentNeutralPct, Negative: s.sentimentNegativePct }))}
                        platforms={["Positive", "Neutral", "Negative"]}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-6 @min-[600px]/col:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <span className="font-brand-mono text-[11px] text-brand-ink-2">COMMENTS</span>
                        <DiscreteMetricBars data={community.map((s) => ({ period: short(s.periodEnd), value: s.commentVolume }))} label="Comments" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="font-brand-mono text-[11px] text-brand-ink-2">DMS</span>
                        <DiscreteMetricBars data={community.map((s) => ({ period: short(s.periodEnd), value: s.dmVolume }))} label="DMs" />
                      </div>
                    </div>
                  </CardBody>
                )}
              </>
            ) : (
              <CardNote>Comment, DM and sentiment numbers appear once your social accounts are connected.</CardNote>
            )}
          </SectionCard>

          {escalations.length > 0 && (
            <SectionCard title="Needs a response" action={<span className="font-brand-mono text-[12px] text-brand-ink-2">{open.length} OPEN</span>}>
              {open.length === 0 ? (
                <CardNote>Nothing flagged for escalation right now.</CardNote>
              ) : (
                <CardRows>
                  {open.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-6 py-4">
                      <PlatformBadge platform={e.platform} className="size-8" />
                      <span className="flex min-w-0 flex-1 basis-[240px] flex-col gap-1">
                        <span className="flex items-center gap-2">
                          <StatusPill tone={SENTIMENT[e.sentiment]}>{e.sentiment.charAt(0) + e.sentiment.slice(1).toLowerCase()}</StatusPill>
                          <span className="text-[12px] text-brand-ink-2">{short(e.createdAt)}</span>
                        </span>
                        <span className="text-[14px] leading-[1.5]">&ldquo;{e.snippet}&rdquo;</span>
                      </span>
                      <form action={resolveCommunityEscalationAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className={pillClass("secondary", "sm")}>
                          Mark resolved
                        </button>
                      </form>
                    </li>
                  ))}
                </CardRows>
              )}
              {resolved.length > 0 && (
                <details className="border-t border-brand-line">
                  <summary className="cursor-pointer px-6 py-3 font-brand-mono text-[12px] text-brand-ink">{resolved.length} RESOLVED</summary>
                  <CardRows>
                    {resolved.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 px-6 py-3">
                        <PlatformBadge platform={e.platform} className="size-5" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-brand-ink-2">&ldquo;{e.snippet}&rdquo;</span>
                      </li>
                    ))}
                  </CardRows>
                </details>
              )}
            </SectionCard>
          )}

          <SectionCard id="website" title="Website" meta={viewer.client.website ? <span className="text-[13px] text-brand-ink-2">{viewer.client.website}</span> : undefined}>
            {latestW ? (
              <>
                <StatTiles tiles={websiteTiles} />
                {website.length > 1 && (
                  <CardBody className="border-t border-brand-line">
                    <FollowerGrowthChart data={website.map((s) => ({ date: short(s.periodEnd), Visits: s.visits, "Social referrals": s.socialReferralVisits ?? 0 }))} platforms={["Visits", "Social referrals"]} />
                  </CardBody>
                )}
                <div className="flex flex-col gap-3 border-t border-brand-line px-6 py-5">
                  {latestW.topSource && (
                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                      <span className="text-brand-ink-2">Top source</span>
                      <span>{latestW.topSource}</span>
                    </div>
                  )}
                  {socialShare !== null && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-[14px]">
                        <span className="text-brand-ink-2">Traffic from social</span>
                        <span className="tabular-nums">{socialShare}%</span>
                      </div>
                      <Meter value={socialShare} max={100} label={`${socialShare}% of traffic from social`} />
                    </div>
                  )}
                  {latestW.avgSessionSeconds !== null && (
                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                      <span className="text-brand-ink-2">Average session</span>
                      <span className="tabular-nums">
                        {Math.floor(latestW.avgSessionSeconds / 60)}m {latestW.avgSessionSeconds % 60}s
                      </span>
                    </div>
                  )}
                  <span className="text-[12px] text-brand-ink-2">Reported per period by your Klingit team, not yet pulled from an analytics tool.</span>
                </div>
              </>
            ) : (
              <CardNote>Visits and conversions appear once Google Analytics is connected.</CardNote>
            )}
          </SectionCard>
        </>
      }
      side={
        <>
          <ConnectCard missing={sources.missing} connected={sources.connected} href={chatProject ? `/projects/${chatProject.id}?channel=klingit` : "/help"} />
          {followers.length > 0 && (
            <SectionCard title="Followers">
              <CardRows>
                {followers.map((f) => (
                  <li key={f.platform} className="flex items-center gap-3 px-6 py-3.5">
                    <PlatformBadge platform={f.platform} className="size-6" />
                    <span className="min-w-0 flex-1 text-[15px]">{f.platform}</span>
                    <span className="flex flex-col items-end">
                      <span className="text-[15px] tabular-nums">{f.followerCount.toLocaleString("en-GB")}</span>
                      {f.growthPct !== null && (
                        <span className="text-[12px] text-brand-ink-2">
                          {f.growthPct >= 0 ? "+" : ""}
                          {f.growthPct}% in 30 days
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </CardRows>
            </SectionCard>
          )}
          {drivers.length > 0 && (
            <SectionCard title="Posts that drive visits">
              <CardRows>
                {drivers.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-6 py-3.5">
                    <PlatformBadge platform={p.platform} className="size-6" />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{p.title}</span>
                    <span className="text-[13px] tabular-nums text-brand-ink-2">{p.websiteClicks} clicks</span>
                  </li>
                ))}
              </CardRows>
            </SectionCard>
          )}
        </>
      }
    />
  );
}
