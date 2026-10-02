import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FollowerGrowthChart } from "@/components/portal/follower-growth-chart";
import { Sparkline } from "@/components/portal/sparkline";
import { DiscreteMetricBars } from "@/components/portal/discrete-metric-bars";
import { MixDonutChart, MIX_DONUT_COLORS } from "@/components/portal/mix-donut-chart";
import { KpiTile } from "@/components/portal/kpi-tile";
import { PostDetailDialog } from "@/components/portal/post-detail-dialog";
import { PlatformBadge } from "@/components/portal/platform-icon";
import { CalendarMonthView } from "@/components/portal/calendar-month-view";
import { SmartCalendarBanner } from "@/components/portal/smart-calendar-banner";
import { AddPlanItemDialog } from "@/components/portal/add-plan-item-dialog";
import { InspirationExploreButton } from "@/components/portal/inspiration-explore-button";
import { GenerateContentPlanSuggestionsButton } from "@/components/portal/generate-content-plan-suggestions-button";
import { SegmentedNav } from "@/components/ds/segmented-control";
import { Lightbulb, Users, Heart, Video, MousePointerClick, Check, List, CalendarDays, Sparkles, X, ArrowRight } from "lucide-react";
import { cn, formatDate, jsonArray, kpiToneVsTarget } from "@/lib/utils";
import { sampleImageUrl } from "@/lib/sample-image";
import { computeContentKpis } from "@/lib/content-calendar-metrics";
import { approveContentPlanSuggestionAction, rejectContentPlanSuggestionAction } from "@/lib/actions/content-calendar-actions";
import { stageStatusText } from "@/lib/project-state";
import { loadProjectStateMap } from "@/lib/project-state-loader";
import { CHART_SERIES_COLORS } from "@/lib/chart-theme";
import { Meter } from "@/components/ui/meter";

const SERIES_COLORS = CHART_SERIES_COLORS;

const PIPELINE_STAGES = ["SUBMITTED", "IN_REVIEW", "REVISED", "APPROVED", "SCHEDULED"] as const;
const STAGE_LABEL: Record<(typeof PIPELINE_STAGES)[number], string> = {
  SUBMITTED: "Submitted",
  IN_REVIEW: "In review",
  REVISED: "Revised",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
};

function StageTracker({ stage }: { stage: string }) {
  const currentIndex = PIPELINE_STAGES.indexOf(stage as (typeof PIPELINE_STAGES)[number]);
  return (
    <div className="flex items-center gap-1">
      {PIPELINE_STAGES.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            className={`flex size-4 items-center justify-center rounded-full text-[8px] font-semibold ${
              i < currentIndex ? "bg-accent text-ink" : i === currentIndex ? "bg-accent text-ink" : "bg-muted text-muted-foreground"
            }`}
            title={STAGE_LABEL[s]}
          >
            {i < currentIndex ? <Check className="size-2.5" /> : i + 1}
          </div>
          {i < PIPELINE_STAGES.length - 1 && <div className={`h-0.5 w-3 ${i < currentIndex ? "bg-accent" : "bg-muted"}`} />}
        </div>
      ))}
    </div>
  );
}

function monthParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string; platform?: string }>;
}) {
  const { view, month: monthParamValue, platform: selectedPlatform } = await searchParams;
  const isCalendarView = view === "calendar";
  const now = new Date();
  const month = monthParamValue && /^\d{4}-\d{2}$/.test(monthParamValue) ? new Date(Number(monthParamValue.slice(0, 4)), Number(monthParamValue.slice(5, 7)) - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const qs = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { view, month: monthParamValue, platform: selectedPlatform, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return `/calendar${s ? `?${s}` : ""}`;
  };

  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;

  const [planTargets, upcomingPostsAll, businessOutcomes, suggestions, kpis, reportingConfig, projects, ownItems, inspirations] = await Promise.all([
    prisma.contentPlanTarget.findMany({ where: { clientId }, orderBy: { platform: "asc" } }),
    prisma.contentPost.findMany({ where: { clientId, status: "PLANNED" }, orderBy: { scheduledDate: "asc" }, take: 20 }),
    prisma.clientBusinessOutcome.findMany({ where: { clientId }, orderBy: { periodStart: "asc" } }),
    prisma.contentPlanSuggestion.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 15 }),
    computeContentKpis(clientId),
    prisma.clientReportingConfig.findUnique({ where: { clientId } }),
    prisma.project.findMany({ where: { clientId, dueDate: { not: null }, ...projectVisibilityWhere(viewer.id) } }),
    prisma.clientCalendarItem.findMany({ where: { clientId }, orderBy: { date: "asc" } }),
    prisma.inspiration.findMany({ where: { clientId, targetDate: { not: null } } }),
  ]);
  const stateById = await loadProjectStateMap(projects.map((p) => p.id), clientId);
  const kpiTargets = jsonArray<{ metric: string; target: string; platform: string | null }>(reportingConfig?.kpiTargets);
  const kpiTargetFor = (metric: string) => kpiTargets.find((t) => t.metric === metric)?.target ?? null;

  const { followerGrowth, blendedFollowerGrowthPct, volumeByPlatform, contentVolumeThisMonth, contentVolumeTarget, avgEngagementRate, avgVideoViews, totalWebsiteClicks, publishedPosts: publishedPostsAll } = kpis;

  const allPlatforms = Array.from(new Set([...upcomingPostsAll.map((p) => p.platform), ...publishedPostsAll.map((p) => p.platform)]));
  const upcomingPosts = selectedPlatform ? upcomingPostsAll.filter((p) => p.platform === selectedPlatform) : upcomingPostsAll;
  const publishedPosts = selectedPlatform ? publishedPostsAll.filter((p) => p.platform === selectedPlatform) : publishedPostsAll;
  const calendarPosts = [...upcomingPostsAll, ...publishedPostsAll].filter((p) => !selectedPlatform || p.platform === selectedPlatform);

  const filteredFollowerGrowth = selectedPlatform ? followerGrowth.filter((f) => f.platform === selectedPlatform) : followerGrowth;

  // Wide-format rows for the multi-series chart: one row per date, one
  // column per platform. Sort by the actual timestamp, not the formatted
  // "DD Mon" string — string-sorting puts "04 Sept" before "07 Aug" and
  // scrambles the X-axis across month boundaries.
  const platforms = filteredFollowerGrowth.map((f) => f.platform);
  const dateMap = new Map<number, string>();
  for (const f of filteredFollowerGrowth) for (const s of f.series) dateMap.set(s.capturedAt.getTime(), formatDate(s.capturedAt));
  const sortedTimestamps = Array.from(dateMap.keys()).sort((a, b) => a - b);
  const followerChartData = sortedTimestamps.map((ts) => {
    const row: Record<string, string | number> = { date: dateMap.get(ts)! };
    for (const f of filteredFollowerGrowth) {
      const point = f.series.find((s) => s.capturedAt.getTime() === ts);
      if (point) row[f.platform] = point.followerCount;
    }
    return row;
  });

  const hasRevenue = businessOutcomes.some((o) => o.revenue !== null);
  const outcomeMetricLabel = hasRevenue ? "Revenue" : "Leads";
  const outcomeBars = businessOutcomes.map((o) => ({
    period: formatDate(o.periodStart, { month: "short" }),
    value: hasRevenue ? (o.revenue ?? 0) : (o.leadsGenerated ?? 0),
  }));

  const pendingSuggestions = suggestions.filter((s) => s.status === "PENDING");
  const scheduledSuggestions = suggestions.filter((s) => s.status === "APPROVED");
  const rejectedSuggestions = suggestions.filter((s) => s.status === "REJECTED");
  // Staggered future placeholder dates so the calendar visibly proposes new
  // slots — not real scheduled dates until a suggestion is approved.
  const calendarSuggestions = pendingSuggestions.map((s, i) => ({
    id: s.id,
    title: s.title,
    platform: s.platform ?? "Instagram",
    proposedDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3 + i * 3),
    href: `${qs({ view: undefined })}#plan-suggestions`,
  }));

  // "What to start now to be ready in time" — Inspiration ideas, placed on
  // the grid at their computed start-by date and routed to the "Ideas"
  // section (they get briefed via InspirationExploreButton, not approved
  // like a ContentPlanSuggestion).
  const ideaSuggestions = inspirations
    .map((idea) => {
      const targetDate = idea.targetDate!;
      const startBy = new Date(targetDate.getTime() - idea.leadTimeDays * 86400000);
      return { id: idea.id, title: idea.title, description: idea.description, formatTags: jsonArray<string>(idea.formatTags), startBy, targetDate };
    })
    .filter((s) => s.startBy.getTime() >= now.getTime() - 86400000)
    .sort((a, b) => a.startBy.getTime() - b.startBy.getTime());
  const calendarIdeas = ideaSuggestions.map((s) => ({
    id: `idea-${s.id}`,
    title: s.title,
    platform: "Website",
    proposedDate: s.startBy,
    href: `${qs({ view: undefined })}#content-ideas`,
  }));

  // "What Klingit is producing" + "what you're running yourselves" — plain
  // colored bars on the grid, no detail dialog (there's no ContentPost
  // behind them).
  const assetPlatforms = await prisma.asset.findMany({
    where: { projectId: { in: projects.map((p) => p.id) }, platform: { not: null } },
    select: { projectId: true, platform: true },
  });
  const platformsByProject = new Map<string, Set<string>>();
  for (const a of assetPlatforms) {
    const set = platformsByProject.get(a.projectId) ?? new Set<string>();
    if (a.platform) set.add(a.platform);
    platformsByProject.set(a.projectId, set);
  }
  const otherCalendarItems = [
    ...projects.map((p) => ({ id: `p-${p.id}`, title: `${p.name} — due`, date: p.dueDate!, href: `/projects/${p.id}`, colorSeed: p.id })),
    ...ownItems.map((i) => ({ id: `o-${i.id}`, title: i.title, date: i.date, href: undefined, colorSeed: i.channel })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Calendar" />
      <div className="-mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Everything around your brand in one place — what Klingit is producing, what you&apos;re running yourselves,
          what to start now to be ready in time, and how the content plan is performing.
        </p>
        <div className="flex items-center gap-2">
          <AddPlanItemDialog />
          <SegmentedNav
            label="Calendar view"
            items={[
              { label: "List", href: qs({ view: undefined }), icon: <List className="size-3.5" />, active: !isCalendarView },
              { label: "Calendar", href: qs({ view: "calendar" }), icon: <CalendarDays className="size-3.5" />, active: isCalendarView },
            ]}
          />
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-card p-0.5">
            <Link
              href={qs({ platform: undefined })}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                !selectedPlatform ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </Link>
            {allPlatforms.map((p) => (
              <Link
                key={p}
                href={qs({ platform: p })}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  selectedPlatform === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <PlatformBadge platform={p} className="size-4" />
                {p}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile icon={Users} label="Follower growth, MoM" value={blendedFollowerGrowthPct !== null ? `${blendedFollowerGrowthPct >= 0 ? "+" : ""}${blendedFollowerGrowthPct}%` : "—"} tone={kpiToneVsTarget(blendedFollowerGrowthPct, kpiTargetFor("Follower Growth"))} />
        <KpiTile icon={Heart} label="Avg. engagement rate" value={avgEngagementRate !== null ? `${avgEngagementRate}%` : "—"} tone={kpiToneVsTarget(avgEngagementRate, kpiTargetFor("Engagement Rate"))} />
        <KpiTile icon={Video} label="Avg. video views" value={avgVideoViews !== null ? avgVideoViews.toLocaleString() : "—"} tone={kpiToneVsTarget(avgVideoViews, kpiTargetFor("Video Views"))} />
        <KpiTile icon={MousePointerClick} label="Website clicks from social" value={totalWebsiteClicks.toLocaleString()} />
      </div>

      {isCalendarView ? (
        <>
          {(calendarSuggestions.length > 0 || calendarIdeas.length > 0) && <SmartCalendarBanner />}
          <Card className="p-5">
            <CalendarMonthView
              month={month}
              posts={calendarPosts}
              suggestions={[...calendarSuggestions, ...calendarIdeas]}
              otherItems={otherCalendarItems}
              prevHref={qs({ view: "calendar", month: monthParam(prevMonth) })}
              nextHref={qs({ view: "calendar", month: monthParam(nextMonth) })}
            />
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-3 lg:col-span-2">
              <SectionLabel>Content volume this month — {contentVolumeThisMonth} of {contentVolumeTarget || "—"} planned</SectionLabel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {volumeByPlatform.map((v) => {
                  const pct = v.target > 0 ? Math.min(100, Math.round((v.published / v.target) * 100)) : 0;
                  return (
                    <Card key={v.platform} className="flex flex-col gap-2 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 font-medium">
                          <PlatformBadge platform={v.platform} className="size-5" />
                          {v.platform}
                        </span>
                        <span className="text-muted-foreground">
                          {v.published}/{v.target}
                        </span>
                      </div>
                      <Meter value={pct} />
                    </Card>
                  );
                })}
              </div>
            </div>
            {volumeByPlatform.some((v) => v.published > 0) && (
              <div className="flex flex-col gap-3">
                <SectionLabel>Mix this month</SectionLabel>
                <Card className="p-5">
                  <MixDonutChart
                    data={volumeByPlatform.filter((v) => v.published > 0).map((v) => ({ name: v.platform, value: v.published }))}
                    centerValue={String(contentVolumeThisMonth)}
                    centerLabel="posts"
                  />
                  <div className="mt-3 flex flex-col gap-1.5">
                    {volumeByPlatform
                      .filter((v) => v.published > 0)
                      .map((v, i) => (
                        <div key={v.platform} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="size-2 rounded-full" style={{ backgroundColor: MIX_DONUT_COLORS[i % MIX_DONUT_COLORS.length] }} />
                            <PlatformBadge platform={v.platform} className="size-4" />
                            {v.platform}
                          </span>
                          <span className="font-medium text-foreground">{v.published}</span>
                        </div>
                      ))}
                  </div>
                </Card>
              </div>
            )}
          </div>

          {filteredFollowerGrowth.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Follower growth by platform</SectionLabel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {filteredFollowerGrowth.map((f, i) => (
                  <Card key={f.platform} className="flex items-center gap-3 p-4">
                    <PlatformBadge platform={f.platform} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{f.platform}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.followerCount.toLocaleString()} followers
                        {f.growthPct !== null && (
                          <span className={f.growthPct >= 0 ? "text-success-foreground" : "text-ink"}> · {f.growthPct >= 0 ? "+" : ""}{f.growthPct}% MoM</span>
                        )}
                      </p>
                    </div>
                    {f.series.length > 1 && (
                      <Sparkline data={f.series.map((s) => ({ value: s.followerCount }))} color={SERIES_COLORS[i % SERIES_COLORS.length]} />
                    )}
                  </Card>
                ))}
              </div>
              {followerChartData.length > 1 && (
                <Card className="p-5">
                  <FollowerGrowthChart data={followerChartData} platforms={platforms} />
                </Card>
              )}
            </div>
          )}

          {outcomeBars.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Business outcomes ({outcomeMetricLabel.toLowerCase()}, per reporting period)</SectionLabel>
              <Card className="p-5">
                <DiscreteMetricBars data={outcomeBars} label={outcomeMetricLabel} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Manually reported by {viewer.client.name} — not pulled from a connected system.
                  {businessOutcomes[businessOutcomes.length - 1]?.note ? ` ${businessOutcomes[businessOutcomes.length - 1].note}` : ""}
                </p>
              </Card>
            </div>
          )}

          <div id="plan-suggestions" className="flex scroll-mt-6 flex-col gap-3">
            <div className="flex items-center justify-between">
              <SectionLabel>
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-ink" />
                  Plan suggestions
                </span>
              </SectionLabel>
              <GenerateContentPlanSuggestionsButton label="Generate suggestions" />
            </div>
            {pendingSuggestions.length === 0 ? (
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">No pending suggestions — generate a fresh read on the plan above.</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {pendingSuggestions.map((s) => (
                  <Card key={s.id} className="flex flex-col gap-3 border-l-4 border-l-accent p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-ink">
                        <Lightbulb className="size-4" />
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{s.title}</p>
                          <Badge tone="neutral">{s.sourceCadence}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{s.rationale}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <form action={rejectContentPlanSuggestionAction}>
                          <input type="hidden" name="suggestionId" value={s.id} />
                          <Button type="submit" size="icon" variant="secondary" title="Reject">
                            <X className="size-4" />
                          </Button>
                        </form>
                        <form action={approveContentPlanSuggestionAction}>
                          <input type="hidden" name="suggestionId" value={s.id} />
                          <Button type="submit" size="sm" className="gap-1.5">
                            Approve &amp; brief
                            <ArrowRight className="size-3.5" />
                          </Button>
                        </form>
                      </div>
                    </div>
                    <div className="pl-11">
                      <StageTracker stage={s.stage} />
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {scheduledSuggestions.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Approved — now in your plan</p>
                {scheduledSuggestions.map((s) => (
                  <Card key={s.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                    <p className="truncate">{s.title}</p>
                    <div className="flex items-center gap-3">
                      <StageTracker stage={s.stage} />
                      <Badge tone="success">Scheduled</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {rejectedSuggestions.length > 0 && (
              <Card className="divide-y divide-border p-0">
                {rejectedSuggestions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                    <p className="truncate text-muted-foreground">{s.title}</p>
                    <Badge tone="neutral">Rejected</Badge>
                  </div>
                ))}
              </Card>
            )}
          </div>

          {ideaSuggestions.length > 0 && (
            <div id="content-ideas" className="flex scroll-mt-6 flex-col gap-3">
              <SectionLabel>Ideas to get ahead of</SectionLabel>
              <div className="flex flex-col gap-2">
                {ideaSuggestions.map((s) => (
                  <Card key={s.id} className="flex items-center justify-between gap-4 border-l-4 border-l-accent p-4">
                    <div>
                      <p className="text-sm font-semibold">{s.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {s.description} Start by {formatDate(s.startBy)} to be ready for {formatDate(s.targetDate)}.
                      </p>
                    </div>
                    <div className="shrink-0">
                      <InspirationExploreButton inspirationId={s.id} label="Brief now" variant="primary" />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <SectionLabel>Plan targets (weekly volume)</SectionLabel>
            {planTargets.length === 0 ? (
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">No baseline plan set yet — Klingit sets this with you during onboarding.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {planTargets.map((t) => (
                  <Card key={t.id} className="flex items-center gap-2 p-4">
                    <PlatformBadge platform={t.platform} className="size-7" />
                    <div>
                      <p className="text-lg font-semibold">{t.weeklyVolume}<span className="text-xs font-normal text-muted-foreground">/wk</span></p>
                      <p className="text-xs text-muted-foreground">{t.platform}</p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <SectionLabel>Klingit production &amp; your own plan</SectionLabel>
            {projects.length === 0 && ownItems.length === 0 ? (
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">Nothing on the books yet.</p>
              </Card>
            ) : (
              <Card className="divide-y divide-border p-0">
                {projects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-muted/40">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-ink">
                      <CalendarDays className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {Array.from(platformsByProject.get(p.id) ?? []).join(", ") || "Klingit production"}
                      </p>
                    </div>
                    {stateById.get(p.id) && <Badge tone="neutral">{stageStatusText(stateById.get(p.id)!)}</Badge>}
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(p.dueDate!)}</span>
                  </Link>
                ))}
                {ownItems.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <CalendarDays className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{i.title}</p>
                        <p className="text-xs text-muted-foreground">{i.channel}</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(i.date)}</span>
                  </div>
                ))}
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <SectionLabel>Upcoming</SectionLabel>
            {upcomingPosts.length === 0 ? (
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
              </Card>
            ) : (
              <Card className="divide-y divide-border p-0">
                {upcomingPosts.map((p) => (
                  <PostDetailDialog key={p.id} post={p}>
                    <div className="flex cursor-pointer items-center gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-muted/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sampleImageUrl(p.id)} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.title}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <PlatformBadge platform={p.platform} className="size-3.5" />
                          {p.platform}
                          {p.contentType ? ` · ${p.contentType}` : ""}
                          {p.sourceSuggestionId ? " · from an approved suggestion" : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{p.scheduledDate ? formatDate(p.scheduledDate) : "—"}</span>
                    </div>
                  </PostDetailDialog>
                ))}
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <SectionLabel>Recently published</SectionLabel>
            <Card className="divide-y divide-border p-0">
              {publishedPosts.slice(0, 12).map((p) => (
                <PostDetailDialog key={p.id} post={p}>
                  <div className="flex cursor-pointer items-center gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-muted/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sampleImageUrl(p.id)} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.title}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <PlatformBadge platform={p.platform} className="size-3.5" />
                        {p.platform}
                        {p.contentType ? ` · ${p.contentType}` : ""} · {p.publishedDate ? formatDate(p.publishedDate) : "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                      {p.impressions !== null && <span>{p.impressions.toLocaleString()} impr.</span>}
                      {p.engagementRate !== null && <span className="font-medium text-foreground">{p.engagementRate}% eng.</span>}
                      {p.videoViews !== null && (
                        <span className="flex items-center gap-1">
                          <Video className="size-3" />
                          {p.videoViews.toLocaleString()}
                        </span>
                      )}
                      {p.websiteClicks !== null && p.websiteClicks > 0 && (
                        <span className="flex items-center gap-1">
                          <MousePointerClick className="size-3" />
                          {p.websiteClicks}
                        </span>
                      )}
                    </div>
                  </div>
                </PostDetailDialog>
              ))}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
