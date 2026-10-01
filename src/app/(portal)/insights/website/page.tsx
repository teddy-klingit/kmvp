import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { KpiTile } from "@/components/portal/kpi-tile";
import { PlatformBadge } from "@/components/portal/platform-icon";
import { FollowerGrowthChart } from "@/components/portal/follower-growth-chart";
import { INSIGHTS_TABS } from "@/lib/insights-tabs";
import { pctChange } from "@/lib/report-filters";
import { computeContentKpis } from "@/lib/content-calendar-metrics";
import { formatDate } from "@/lib/utils";
import { Users, MousePointerClick, Target, Percent, Lightbulb, Globe } from "lucide-react";
import { Meter } from "@/components/ui/meter";

export default async function WebsiteInsightsPage() {
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;

  const [snapshots, kpis, client] = await Promise.all([
    prisma.websiteAnalyticsSnapshot.findMany({ where: { clientId }, orderBy: { periodEnd: "asc" } }),
    computeContentKpis(clientId),
    prisma.client.findUnique({ where: { id: clientId }, select: { website: true } }),
  ]);

  const latest = snapshots[snapshots.length - 1] ?? null;
  const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  const visitsDelta = pctChange(latest?.visits ?? null, previous?.visits ?? null);
  const uniqueVisitorsDelta = pctChange(latest?.uniqueVisitors ?? null, previous?.uniqueVisitors ?? null);
  const conversionsDelta = pctChange(latest?.conversions ?? null, previous?.conversions ?? null);
  const conversionRateDelta = pctChange(latest?.conversionRate ?? null, previous?.conversionRate ?? null);

  const trendData = snapshots.map((s) => ({
    date: formatDate(s.periodEnd),
    Visits: s.visits,
    "Social referrals": s.socialReferralVisits ?? 0,
  }));

  const topContent = [...kpis.publishedPosts]
    .filter((p) => p.websiteClicks !== null && p.websiteClicks > 0)
    .sort((a, b) => (b.websiteClicks ?? 0) - (a.websiteClicks ?? 0))
    .slice(0, 3);

  const socialSharePct = latest && latest.visits > 0 && latest.socialReferralVisits !== null ? Math.round((latest.socialReferralVisits / latest.visits) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Website" tabs={INSIGHTS_TABS} />
      <p className="-mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Globe className="size-3.5" />
        {client?.website ?? "No domain on file"} — traffic, conversions, and what social content is actually driving people there.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile icon={Users} label="Visits, latest period" value={latest ? latest.visits.toLocaleString() : "—"} delta={visitsDelta} sublabel={previous ? "vs. previous period" : null} />
        <KpiTile icon={MousePointerClick} label="Unique visitors" value={latest ? latest.uniqueVisitors.toLocaleString() : "—"} delta={uniqueVisitorsDelta} sublabel={previous ? "vs. previous period" : null} />
        <KpiTile icon={Target} label="Conversions" value={latest ? latest.conversions.toLocaleString() : "—"} delta={conversionsDelta} sublabel={previous ? "vs. previous period" : null} />
        <KpiTile icon={Percent} label="Conversion rate" value={latest ? `${latest.conversionRate}%` : "—"} delta={conversionRateDelta} sublabel={previous ? "vs. previous period" : null} />
      </div>

      {trendData.length > 1 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Visits over time</SectionLabel>
          <Card className="p-5">
            <FollowerGrowthChart data={trendData} platforms={["Visits", "Social referrals"]} />
          </Card>
        </div>
      )}

      {latest && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <SectionLabel>Traffic sources</SectionLabel>
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Top source</span>
                <span className="font-medium">{latest.topSource ?? "—"}</span>
              </div>
              {socialSharePct !== null && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Share of traffic from social</span>
                    <span className="font-medium text-foreground">{socialSharePct}%</span>
                  </div>
                  <Meter value={socialSharePct} />
                </div>
              )}
              {latest.avgSessionSeconds !== null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Avg. session length</span>
                  <span className="font-medium">{Math.floor(latest.avgSessionSeconds / 60)}m {latest.avgSessionSeconds % 60}s</span>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Manually reported per period — not pulled from a connected analytics tool yet.
              </p>
            </Card>
          </div>

          <div className="flex flex-col gap-3">
            <SectionLabel>Content ideas from social performance</SectionLabel>
            <Card className="flex flex-col gap-2.5 p-5">
              {topContent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No social post has driven meaningful website clicks yet.</p>
              ) : (
                topContent.map((p) => (
                  <div key={p.id} className="flex items-start gap-2.5 rounded-lg border border-border bg-paper p-3">
                    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-ink" />
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-semibold">
                        <PlatformBadge platform={p.platform} className="size-3.5" />
                        {p.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Drove {p.websiteClicks} website clicks — worth a dedicated landing page or a follow-up post
                        linking straight to the careers page.
                      </p>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
