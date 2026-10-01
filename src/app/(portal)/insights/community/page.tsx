import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiTile } from "@/components/portal/kpi-tile";
import { PlatformBadge } from "@/components/portal/platform-icon";
import { FollowerGrowthChart } from "@/components/portal/follower-growth-chart";
import { DiscreteMetricBars } from "@/components/portal/discrete-metric-bars";
import { INSIGHTS_TABS } from "@/lib/insights-tabs";
import { resolveCommunityEscalationAction } from "@/lib/actions/community-actions";
import { formatDate } from "@/lib/utils";
import { MessageCircle, Mail, AlertTriangle, Heart, CheckCircle2 } from "lucide-react";

const SENTIMENT_TONE = { POSITIVE: "success", NEUTRAL: "neutral", NEGATIVE: "danger" } as const;

export default async function CommunityInsightsPage() {
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;

  const [snapshots, escalations] = await Promise.all([
    prisma.communityManagementSnapshot.findMany({ where: { clientId }, orderBy: { periodEnd: "asc" } }),
    prisma.communityEscalation.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
  ]);

  const latest = snapshots[snapshots.length - 1] ?? null;
  const openEscalations = escalations.filter((e) => e.status === "OPEN");
  const resolvedEscalations = escalations.filter((e) => e.status === "RESOLVED");

  const sentimentTrendData = snapshots.map((s) => ({
    date: formatDate(s.periodEnd),
    Positive: s.sentimentPositivePct,
    Neutral: s.sentimentNeutralPct,
    Negative: s.sentimentNegativePct,
  }));

  const commentBars = snapshots.map((s) => ({ period: formatDate(s.periodEnd, { month: "short", day: "2-digit" }), value: s.commentVolume }));
  const dmBars = snapshots.map((s) => ({ period: formatDate(s.periodEnd, { month: "short", day: "2-digit" }), value: s.dmVolume }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Community Management" tabs={INSIGHTS_TABS} />
      <p className="-mt-4 text-sm text-muted-foreground">
        How people are interacting with your brand across channels — comment and DM volume, sentiment, and anything
        that needs a human to step in.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile icon={MessageCircle} label="Comments, latest period" value={latest ? latest.commentVolume.toLocaleString() : "—"} />
        <KpiTile icon={Mail} label="DMs, latest period" value={latest ? latest.dmVolume.toLocaleString() : "—"} />
        <KpiTile
          icon={Heart}
          label="Positive sentiment"
          value={latest ? `${latest.sentimentPositivePct}%` : "—"}
          tone={latest ? (latest.sentimentPositivePct >= 60 ? "good" : latest.sentimentPositivePct < 40 ? "bad" : "neutral") : null}
        />
        <KpiTile
          icon={AlertTriangle}
          label="Open escalations"
          value={String(openEscalations.length)}
          tone={openEscalations.length === 0 ? "good" : openEscalations.length > 2 ? "bad" : "neutral"}
        />
      </div>

      {sentimentTrendData.length > 1 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Sentiment trend</SectionLabel>
          <Card className="p-5">
            <FollowerGrowthChart data={sentimentTrendData} platforms={["Positive", "Neutral", "Negative"]} />
          </Card>
        </div>
      )}

      {snapshots.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <SectionLabel>Comment volume by period</SectionLabel>
            <Card className="p-5">
              <DiscreteMetricBars data={commentBars} label="Comments" />
            </Card>
          </div>
          <div className="flex flex-col gap-3">
            <SectionLabel>DM volume by period</SectionLabel>
            <Card className="p-5">
              <DiscreteMetricBars data={dmBars} label="DMs" />
            </Card>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <SectionLabel>Needs a response — {openEscalations.length} open</SectionLabel>
        {openEscalations.length === 0 ? (
          <Card className="flex items-center gap-2 p-5">
            <CheckCircle2 className="size-4 text-success-foreground" />
            <p className="text-sm text-muted-foreground">Nothing flagged for escalation right now.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {openEscalations.map((e) => (
              <Card key={e.id} className="flex items-start justify-between gap-4 border-l-4 border-l-danger p-4">
                <div className="flex items-start gap-3">
                  <PlatformBadge platform={e.platform} className="size-8" />
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone={SENTIMENT_TONE[e.sentiment]}>{e.sentiment.charAt(0) + e.sentiment.slice(1).toLowerCase()}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(e.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">&quot;{e.snippet}&quot;</p>
                  </div>
                </div>
                <form action={resolveCommunityEscalationAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <Button type="submit" size="sm" variant="secondary">Mark resolved</Button>
                </form>
              </Card>
            ))}
          </div>
        )}
      </div>

      {resolvedEscalations.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Resolved</SectionLabel>
          <Card className="divide-y divide-border p-0">
            {resolvedEscalations.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <PlatformBadge platform={e.platform} className="size-5" />
                <p className="min-w-0 flex-1 truncate text-muted-foreground">&quot;{e.snippet}&quot;</p>
                <Badge tone="success">Resolved</Badge>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
