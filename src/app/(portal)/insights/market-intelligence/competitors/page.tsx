import Link from "next/link";
import { ExternalLink, Radio, Compass, Gauge, UserPlus, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BrandAvatar } from "@/components/ui/avatar";
import { formatDate, jsonArray } from "@/lib/utils";
import { domainForBrand } from "@/lib/brand-domains";
import { getCompetitorAdLibraryActivity } from "@/lib/integrations/meta-ad-library";
import { getLinkedInCompetitorAds } from "@/lib/integrations/linkedin-ad-library";
import { getGoogleCompetitorAds } from "@/lib/integrations/google-ad-transparency";
import { AdVolumeTrendChart } from "@/components/portal/ad-volume-trend-chart";
import { ShareOfVoiceChart } from "@/components/portal/share-of-voice-chart";
import { BenchmarkBar } from "@/components/portal/benchmark-bar";
import { GenerateMarketIntelligenceButton } from "@/components/portal/generate-market-intelligence-button";
import { addSuggestedCompetitorAction, dismissSuggestedCompetitorAction } from "@/lib/actions/market-intelligence-actions";

type Theme = { theme: string; evidence: string };

const ACTIVITY_TONE = { High: "danger", Medium: "warning", Low: "neutral" } as const;

export default async function MarketIntelligenceCompetitorsPage() {
  const viewer = await getPortalViewer();
  const competitorBrands = jsonArray<string>(viewer.client.competitorBrands);

  const [adLibraryResults, linkedInAdResults, googleAdResults, snapshots, profiles, benchmark, suggestions] = await Promise.all([
    competitorBrands.length ? getCompetitorAdLibraryActivity(competitorBrands) : Promise.resolve([]),
    competitorBrands.length ? getLinkedInCompetitorAds(competitorBrands) : Promise.resolve([]),
    competitorBrands.length ? getGoogleCompetitorAds(competitorBrands) : Promise.resolve([]),
    prisma.competitorSnapshot.findMany({
      where: { clientId: viewer.clientId, platform: "LinkedIn", totalAds: { not: null } },
      orderBy: { capturedAt: "asc" },
    }),
    prisma.competitorProfile.findMany({ where: { clientId: viewer.clientId } }),
    prisma.performanceBenchmark.findUnique({ where: { clientId: viewer.clientId } }),
    prisma.suggestedCompetitor.findMany({ where: { clientId: viewer.clientId, status: "NEW" }, orderBy: { createdAt: "desc" } }),
  ]);

  const anyOk = adLibraryResults.some((r) => r.ok);
  const anyNotConfigured = adLibraryResults.some((r) => !r.ok && r.reason === "not_configured");
  const linkedInNotConnected = linkedInAdResults.some((r) => !r.ok && r.reason === "not_connected");
  const googleNotConfigured = googleAdResults.some((r) => !r.ok && r.reason === "not_configured");

  const trendByBrand = new Map<string, { date: string; total: number }[]>();
  for (const snap of snapshots) {
    const points = trendByBrand.get(snap.brand) ?? [];
    points.push({ date: formatDate(snap.capturedAt, { day: "2-digit", month: "short" }), total: snap.totalAds ?? 0 });
    trendByBrand.set(snap.brand, points);
  }

  const profileByBrand = new Map(profiles.map((p) => [p.brand, p]));

  const shareOfVoiceData = linkedInAdResults.filter((r) => r.ok).map((r) => ({ brand: r.brand, totalAds: r.ok ? r.total : 0 }));

  const suggestionsCard = suggestions.length > 0 && (
    <Card className="flex flex-col gap-3 p-5">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <UserPlus className="size-4 text-ink" />
        Suggested competitors
      </p>
      <div className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-paper p-3">
            <div>
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-xs text-muted-foreground">{s.evidence}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <form action={addSuggestedCompetitorAction}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="name" value={s.name} />
                <button type="submit" className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90">
                  Add
                </button>
              </form>
              <form action={dismissSuggestedCompetitorAction}>
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" className="flex items-center justify-center rounded-full p-1.5 text-muted-foreground hover:bg-border">
                  <X className="size-3.5" />
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );

  if (competitorBrands.length === 0) {
    return (
      <>
        {suggestionsCard}
        <Card className="flex items-center justify-between gap-4 p-5">
          <p className="text-sm text-muted-foreground">No competitors on file yet — add some in Account settings, or generate an analysis to get suggestions from category news.</p>
          <GenerateMarketIntelligenceButton label="Generate analysis" />
        </Card>
      </>
    );
  }

  return (
    <>
      {suggestionsCard}
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <Gauge className="size-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Performance benchmark</p>
            <Badge tone="warning" className="text-[10px]">
              AI estimate
            </Badge>
          </div>
          <GenerateMarketIntelligenceButton label={benchmark ? "Refresh analysis" : "Generate analysis"} />
        </div>
        {!benchmark ? (
          <p className="text-sm text-muted-foreground">
            No real third-party benchmark data exists for this category — generate an analysis to get a reasoned estimate instead, based on your own
            performance and competitor context.
          </p>
        ) : (
          <>
            <BenchmarkBar ownCtr={benchmark.ownCtr} estimatedLow={benchmark.estimatedLow} estimatedHigh={benchmark.estimatedHigh} />
            <p className="text-xs text-muted-foreground">{benchmark.rationale}</p>
            <p className="text-[11px] text-muted-foreground">
              Estimated from {benchmark.ownFormat} · Generated {formatDate(benchmark.generatedAt, { day: "2-digit", month: "short" })}. Not measured
              third-party data.
            </p>
          </>
        )}
      </Card>

      {shareOfVoiceData.length >= 2 && (
        <Card className="flex flex-col gap-2 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Share of voice (LinkedIn Ad Library)</p>
          <ShareOfVoiceChart data={shareOfVoiceData} />
        </Card>
      )}

      {anyNotConfigured && (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Meta Ad Library isn&apos;t connected yet — this will populate automatically once it is.</p>
        </Card>
      )}
      {!anyOk && !anyNotConfigured && (
        <Card className="p-5">
          <p className="text-sm font-medium">Meta Ad Library access pending</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The connected token needs a separate identity verification for Ad Library access. Complete it at{" "}
            <Link href="https://www.facebook.com/ads/library/api" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              facebook.com/ads/library/api
            </Link>
            , and Meta ad previews will start showing automatically below.
          </p>
        </Card>
      )}
      {linkedInNotConnected && (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">LinkedIn isn&apos;t connected yet — this will populate automatically once it is.</p>
        </Card>
      )}
      {googleNotConfigured && (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">
            Google&apos;s ad transparency data isn&apos;t connected yet — this will populate automatically once it is.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        <SectionLabel>Competitor profiles</SectionLabel>
        {competitorBrands.map((brand) => {
          const profile = profileByBrand.get(brand);
          const metaResult = adLibraryResults.find((r) => r.brand === brand);
          const linkedInResult = linkedInAdResults.find((r) => r.brand === brand);
          const googleResult = googleAdResults.find((r) => r.brand === brand);
          const trend = trendByBrand.get(brand) ?? [];

          return (
            <Card key={brand} className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <BrandAvatar name={brand} domain={domainForBrand(brand)} size="md" />
                  <div>
                    <p className="text-sm font-semibold">{brand}</p>
                    {linkedInResult?.ok && <p className="text-[11px] text-muted-foreground">{linkedInResult.total} live ads on LinkedIn</p>}
                  </div>
                </div>
                {profile && <Badge tone={ACTIVITY_TONE[profile.activityLevel as keyof typeof ACTIVITY_TONE] ?? "neutral"}>{profile.activityLevel} activity</Badge>}
              </div>

              {profile ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">{profile.positioning}</p>
                  <div className="flex flex-wrap gap-2">
                    {jsonArray<Theme>(profile.themes).map((t, i) => (
                      <span key={i} className="group relative flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground" title={t.evidence}>
                        <Compass className="size-3 text-ink" />
                        {t.theme}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No positioning read yet — generate an analysis to synthesize one from their ad activity.</p>
              )}

              {trend.length >= 2 && (
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Volume trend</p>
                  <AdVolumeTrendChart data={trend} />
                </div>
              )}

              {(metaResult?.ok || linkedInResult?.ok || (googleResult && (googleResult.ok || googleResult.reason !== "not_configured"))) && (
                <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-3">
                  {metaResult?.ok && (
                    <div className="flex flex-col gap-2">
                      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Meta
                        <Radio className="size-2.5 text-success-foreground" />
                      </p>
                      {metaResult.ads.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No ads confidently matched to this brand&apos;s own Page via text search.
                        </p>
                      )}
                      {metaResult.ads.slice(0, 2).map((ad) => (
                        <Link
                          key={ad.id}
                          href={ad.snapshotUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col gap-2 rounded-lg border border-border p-2.5 text-xs transition-colors hover:bg-muted"
                        >
                          <p className="line-clamp-3 text-foreground">{ad.bodyText ?? "(No text preview)"}</p>
                          <span className="flex items-center gap-1 self-end text-muted-foreground">
                            View ad <ExternalLink className="size-3" />
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                  {linkedInResult?.ok && (
                    <div className="flex flex-col gap-2">
                      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        LinkedIn
                        <Radio className="size-2.5 text-success-foreground" />
                      </p>
                      {linkedInResult.ads.slice(0, 3).map((ad) => (
                        <Link
                          key={ad.adUrl}
                          href={ad.adUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-xs transition-colors hover:bg-muted"
                        >
                          <span className="font-medium text-foreground">{ad.advertiserName}</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            View <ExternalLink className="size-3" />
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                  {googleResult && googleResult.ok && (
                    <div className="flex flex-col gap-2">
                      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Google
                        <Radio className="size-2.5 text-success-foreground" />
                      </p>
                      <p className="text-[11px] text-muted-foreground">{googleResult.total} creative{googleResult.total === 1 ? "" : "s"} on file</p>
                      {googleResult.ads.map((ad) => (
                        <Link
                          key={ad.creativeId}
                          href={ad.pageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-xs transition-colors hover:bg-muted"
                        >
                          <span className="font-medium text-foreground">{ad.format}{ad.topic ? ` · ${ad.topic}` : ""}</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            View <ExternalLink className="size-3" />
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                  {googleResult && !googleResult.ok && googleResult.reason === "not_found" && (
                    <div className="flex flex-col gap-2">
                      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Google</p>
                      <p className="text-[11px] text-muted-foreground">
                        Not found under &quot;{brand}&quot; in Google&apos;s EU ad transparency data — either no EU Google Ads activity, or registered
                        under a different legal name.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
