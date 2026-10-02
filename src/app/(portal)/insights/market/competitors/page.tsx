import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { BrandAvatar } from "@/components/ui/avatar";
import { SectionCard, CardBody, CardNote, CardRows } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { PageGrid } from "@/components/ds/page-grid";
import { pillClass } from "@/components/ds/button";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { formatDate, jsonArray } from "@/lib/utils";
import { domainForBrand } from "@/lib/brand-domains";
import { getCompetitorAdLibraryActivity } from "@/lib/integrations/meta-ad-library";
import { getLinkedInCompetitorAds } from "@/lib/integrations/linkedin-ad-library";
import { getGoogleCompetitorAds } from "@/lib/integrations/google-ad-transparency";
import { AdVolumeTrendChart } from "@/components/portal/ad-volume-trend-chart";
import { ShareOfVoiceChart } from "@/components/portal/share-of-voice-chart";
import { BenchmarkBar } from "@/components/portal/benchmark-bar";
import { addSuggestedCompetitorAction, dismissSuggestedCompetitorAction, generateMarketIntelligenceAction } from "@/lib/actions/market-intelligence-actions";

type Theme = { theme: string; evidence: string };

const ACTIVITY_TONE = { High: "watch", Medium: "neutral", Low: "neutral" } as const;

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
    <SectionCard title="Suggested competitors" action={<span className="text-[12px] text-brand-ink-2">{suggestions.length} new</span>}>
      <CardRows>
        {suggestions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-6 py-4">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px]">{s.name}</span>
              <span className="text-[12px] leading-[1.5] text-brand-ink-2">{s.evidence}</span>
            </span>
            <form action={addSuggestedCompetitorAction}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="name" value={s.name} />
              <button type="submit" className={pillClass("primary", "sm")}>
                Add
              </button>
            </form>
            <form action={dismissSuggestedCompetitorAction}>
              <input type="hidden" name="id" value={s.id} />
              <button type="submit" aria-label={`Dismiss ${s.name}`} className="flex size-11 items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-chip sm:size-9">
                <X className="size-4" />
              </button>
            </form>
          </li>
        ))}
      </CardRows>
    </SectionCard>
  );

  // Integrations that aren't returning data, explained once.
  const missing = [
    anyNotConfigured && "Meta Ad Library isn't connected yet.",
    !anyOk && !anyNotConfigured && "Meta Ad Library access is pending: the token needs Meta's separate identity check (facebook.com/ads/library/api).",
    linkedInNotConnected && "LinkedIn isn't connected yet.",
    googleNotConfigured && "Google's ad transparency data isn't connected yet.",
  ].filter((x): x is string => Boolean(x));

  const benchmarkCard = (
    <SectionCard
      title="Performance benchmark"
      meta={<StatusPill tone="watch">AI estimate</StatusPill>}
      action={<AgentButton action={generateMarketIntelligenceAction} label={benchmark ? "Refresh" : "Generate"} pendingLabel="Reading…" />}
    >
      {!benchmark ? (
        <CardNote>There&apos;s no third-party benchmark data for this category. Generate an analysis for a reasoned estimate from your own performance and competitor context.</CardNote>
      ) : (
        <CardBody className="flex flex-col gap-3">
          <BenchmarkBar ownCtr={benchmark.ownCtr} estimatedLow={benchmark.estimatedLow} estimatedHigh={benchmark.estimatedHigh} />
          <p className="m-0 text-[13px] leading-[1.5] text-brand-ink-2">{benchmark.rationale}</p>
          <p className="m-0 font-brand-mono text-[11px] text-brand-ink-2">
            FROM {benchmark.ownFormat.toUpperCase()} · {formatDate(benchmark.generatedAt, { day: "numeric", month: "short" }).toUpperCase()} · NOT MEASURED DATA
          </p>
        </CardBody>
      )}
    </SectionCard>
  );

  if (competitorBrands.length === 0) {
    return (
      <PageGrid
        main={
          <>
            {suggestionsCard}
            <SectionCard title="Competitors">
              <div className="flex flex-wrap items-center gap-4 px-6 py-5">
                <p className="m-0 min-w-0 flex-1 basis-[260px] text-[14px] text-brand-ink-2">No competitors on file yet. Add some in Account settings, or generate an analysis to get suggestions from category news.</p>
                <AgentButton action={generateMarketIntelligenceAction} label="Generate analysis" pendingLabel="Reading…" />
              </div>
            </SectionCard>
          </>
        }
      />
    );
  }

  return (
    <PageGrid
      main={
        <>
          {suggestionsCard}
          {competitorBrands.map((brand) => {
            const profile = profileByBrand.get(brand);
            const metaResult = adLibraryResults.find((r) => r.brand === brand);
            const linkedInResult = linkedInAdResults.find((r) => r.brand === brand);
            const googleResult = googleAdResults.find((r) => r.brand === brand);
            const trend = trendByBrand.get(brand) ?? [];
            const showAds = metaResult?.ok || linkedInResult?.ok || (googleResult && (googleResult.ok || googleResult.reason !== "not_configured"));

            return (
              <SectionCard
                key={brand}
                label={brand}
                title={
                  <span className="flex items-center gap-3">
                    <BrandAvatar name={brand} domain={domainForBrand(brand)} size="md" />
                    <span className="flex flex-col">
                      <span>{brand}</span>
                      {linkedInResult?.ok && <span className="text-[12px] text-brand-ink-2">{linkedInResult.total} live ads on LinkedIn</span>}
                    </span>
                  </span>
                }
                action={profile ? <StatusPill tone={ACTIVITY_TONE[profile.activityLevel as keyof typeof ACTIVITY_TONE] ?? "neutral"}>{profile.activityLevel} activity</StatusPill> : undefined}
              >
                <CardBody className="flex flex-col gap-4">
                  {profile ? (
                    <>
                      <p className="m-0 text-[14px] leading-[1.55]">{profile.positioning}</p>
                      <div className="flex flex-wrap gap-2">
                        {jsonArray<Theme>(profile.themes).map((t, i) => (
                          <span key={i} title={t.evidence} className="rounded-full bg-brand-chip px-3 py-1 text-[12px]">
                            {t.theme}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="m-0 text-[13px] text-brand-ink-2">No positioning read yet. Generate an analysis to get one from their ad activity.</p>
                  )}

                  {trend.length >= 2 && (
                    <div>
                      <p className="m-0 mb-1 text-[12px] text-brand-ink-2">Ad volume, LinkedIn</p>
                      <AdVolumeTrendChart data={trend} />
                    </div>
                  )}

                  {showAds && (
                    <div className="grid grid-cols-1 gap-4 border-t border-brand-line pt-4 @min-[600px]/col:grid-cols-3">
                      {metaResult?.ok && (
                        <AdColumn label="META">
                          {metaResult.ads.length === 0 && <p className="m-0 text-[12px] text-brand-ink-2">No ads confidently matched to this brand&apos;s own Page.</p>}
                          {metaResult.ads.slice(0, 2).map((ad) => (
                            <AdLink key={ad.id} href={ad.snapshotUrl}>
                              <span className="line-clamp-3">{ad.bodyText ?? "(No text preview)"}</span>
                            </AdLink>
                          ))}
                        </AdColumn>
                      )}
                      {linkedInResult?.ok && (
                        <AdColumn label="LINKEDIN">
                          {linkedInResult.ads.slice(0, 3).map((ad) => (
                            <AdLink key={ad.adUrl} href={ad.adUrl}>
                              {ad.advertiserName}
                            </AdLink>
                          ))}
                        </AdColumn>
                      )}
                      {googleResult && googleResult.ok && (
                        <AdColumn label={`GOOGLE · ${googleResult.total} CREATIVE${googleResult.total === 1 ? "" : "S"}`}>
                          {googleResult.ads.map((ad) => (
                            <AdLink key={ad.creativeId} href={ad.pageUrl}>
                              {ad.format}
                              {ad.topic ? ` · ${ad.topic}` : ""}
                            </AdLink>
                          ))}
                        </AdColumn>
                      )}
                      {googleResult && !googleResult.ok && googleResult.reason === "not_found" && (
                        <AdColumn label="GOOGLE">
                          <p className="m-0 text-[12px] leading-[1.5] text-brand-ink-2">Not found under &quot;{brand}&quot; in Google&apos;s EU ad transparency data.</p>
                        </AdColumn>
                      )}
                    </div>
                  )}
                </CardBody>
              </SectionCard>
            );
          })}
        </>
      }
      side={
        <>
          {benchmarkCard}
          {shareOfVoiceData.length >= 2 && (
            <SectionCard title="Share of voice" action={<span className="text-[12px] text-brand-ink-2">LinkedIn Ad Library</span>}>
              <CardBody>
                <ShareOfVoiceChart data={shareOfVoiceData} />
              </CardBody>
            </SectionCard>
          )}
          {missing.length > 0 && (
            <SectionCard title="Not connected yet" tone="muted">
              <ul className="m-0 flex list-none flex-col gap-2 px-6 py-5">
                {missing.map((m) => (
                  <li key={m} className="text-[13px] leading-[1.5] text-brand-ink-2">
                    {m} It fills in automatically once it is.
                  </li>
                ))}
              </ul>
              {!anyOk && !anyNotConfigured && (
                <p className="m-0 px-6 pb-5">
                  <Link href="https://www.facebook.com/ads/library/api" target="_blank" rel="noopener noreferrer" className="text-[13px] text-brand-ink underline underline-offset-4">
                    Complete Meta&apos;s check
                  </Link>
                </p>
              )}
            </SectionCard>
          )}
        </>
      }
    />
  );
}

function AdColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="m-0 font-brand-mono text-[11px] text-brand-ink-2">{label}</p>
      {children}
    </div>
  );
}

function AdLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-2 rounded-[8px] bg-brand-chip p-3 text-[12px] leading-[1.5] text-brand-ink no-underline hover:bg-brand-line">
      <span className="min-w-0">{children}</span>
      <ExternalLink className="mt-0.5 size-3 shrink-0 text-brand-ink-2" />
    </Link>
  );
}
