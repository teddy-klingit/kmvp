import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { domainForBrand } from "@/lib/brand-domains";
import { getCompetitorAdLibraryActivity } from "@/lib/integrations/meta-ad-library";
import { getLinkedInCompetitorAds } from "@/lib/integrations/linkedin-ad-library";
import { loadMeasuredAssets } from "@/lib/insights-data";
import { loadDaily, parseRange, pct } from "@/lib/insights/daily";
import { CHANNEL_COLOR, newAdsByChannel } from "@/lib/insights/signals";
import { addSuggestedCompetitorAction, dismissSuggestedCompetitorAction, generateMarketIntelligenceAction, trackCompetitorAction } from "@/lib/actions/market-intelligence-actions";
import { BrandAvatar } from "@/components/ui/avatar";
import { PageGrid } from "@/components/ds/page-grid";
import { pillClass } from "@/components/ds/button";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { ChartCard, SkeletonChart } from "@/components/insights/cards";
import { BarList, Legend, StackBar } from "@/components/insights/charts";
import { SERIES } from "@/components/insights/tokens";

const CHANNELS = ["Meta", "Google", "LinkedIn"] as const;
const firstSentence = (s: string) => s.split(/(?<=[.!?])\s/)[0];

/**
 * Market → Competitors (InsightsCompetitors.dc.html): a row per competitor (new-ad count, a channel stack bar,
 * a one-line positioning read, its latest ads); on the side your CTR vs the category (an AI estimate, tagged as
 * one), share of new ads and "Track another brand". New ads are counted from stored ad-library checks only.
 */
export default async function MarketCompetitorsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = parseRange((await searchParams).range);
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const brands = jsonArray<string>(viewer.client.competitorBrands);

  const [meta, linkedIn, profiles, benchmark, suggestions, newAds, daily, { measured }] = await Promise.all([
    brands.length ? getCompetitorAdLibraryActivity(brands) : Promise.resolve([]),
    brands.length ? getLinkedInCompetitorAds(brands) : Promise.resolve([]),
    prisma.competitorProfile.findMany({ where: { clientId } }),
    prisma.performanceBenchmark.findUnique({ where: { clientId } }),
    prisma.suggestedCompetitor.findMany({ where: { clientId, status: "NEW" }, orderBy: { createdAt: "desc" } }),
    newAdsByChannel(clientId, days),
    loadDaily(clientId, 30),
    loadMeasuredAssets(clientId),
  ]);
  const profile = new Map(profiles.map((p) => [p.brand, p]));

  const rows = brands.map((brand) => {
    const counts = newAds.get(brand);
    const byChannel = CHANNELS.map((c) => ({ label: c, value: counts?.get(c) ?? 0, color: CHANNEL_COLOR[c] }));
    const m = meta.find((r) => r.brand === brand);
    const li = linkedIn.find((r) => r.brand === brand);
    const ads = [
      ...(li?.ok ? li.ads.slice(0, 3).map((a) => ({ href: a.adUrl, label: "LinkedIn ad" })) : []),
      ...(m?.ok ? m.ads.slice(0, 3).map((a) => ({ href: a.snapshotUrl, label: "Meta ad" })) : []),
    ].slice(0, 3);
    const checked = [m?.ok && "Meta", li?.ok && "LinkedIn"].filter((x): x is string => Boolean(x));
    return { brand, total: byChannel.reduce((a, c) => a + c.value, 0), tracked: counts !== undefined, byChannel, ads, checked, positioning: profile.get(brand)?.positioning ?? null };
  });
  const share = rows.filter((r) => r.total > 0);
  const shareTotal = share.reduce((a, r) => a + r.total, 0);
  const channelsUsed = CHANNELS.filter((c) => share.some((r) => r.byChannel.find((b) => b.label === c)!.value > 0));

  const live = daily.has ? daily.totals.ctr : null;
  const best = measured.length ? Math.max(...measured.map((a) => a.ctr)) : null;
  const benchRows = benchmark
    ? [
        ...(live !== null ? [{ label: "Your live ads", value: live, display: pct(live), tone: live < benchmark.estimatedLow ? ("orange" as const) : ("ink" as const) }] : []),
        { label: "Category estimate", value: (benchmark.estimatedLow + benchmark.estimatedHigh) / 2, display: `${benchmark.estimatedLow}–${benchmark.estimatedHigh}%`, tone: "grey" as const },
        ...(best !== null ? [{ label: "Your best creative", value: best, display: `${best}%`, tone: "ink" as const }] : []),
      ]
    : [];

  return (
    <PageGrid
      main={
        <>
          {suggestions.length > 0 && (
            <ChartCard flush title="Suggested competitors" meta={<span className="font-brand-mono text-[12px] text-brand-ink">{suggestions.length} NEW</span>}>
              <ul className="m-0 list-none p-0">
                {suggestions.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 border-b border-brand-line px-6 py-3.5 last:border-b-0">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px]">{s.name}</span>
                      <span className="truncate text-[12px] text-brand-ink-2">{s.evidence}</span>
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
              </ul>
            </ChartCard>
          )}

          {rows.length === 0 ? (
            <ChartCard title="New ads by channel">
              <SkeletonChart line="No competitors tracked yet. Add one on the right, or let the agent suggest some." action={<AgentButton action={generateMarketIntelligenceAction} label="Suggest competitors" pendingLabel="Reading…" />} />
            </ChartCard>
          ) : (
            <section aria-label="New ads by channel" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <h2 className="m-0 text-[22px] font-normal">New ads by channel</h2>
                <Legend items={CHANNELS.map((c) => ({ label: c, color: CHANNEL_COLOR[c] }))} />
              </div>
              {rows.map((r) => (
                <article key={r.brand} className="grid grid-cols-1 items-center gap-4 rounded-2xl bg-white px-6 py-5 @min-[640px]/col:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <span className="flex min-w-0 items-center gap-3">
                    <BrandAvatar name={r.brand} domain={domainForBrand(r.brand)} size="md" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[17px]">{r.brand}</span>
                      <span className="text-[13px] text-brand-mute">{r.tracked ? `${r.total} new ad${r.total === 1 ? "" : "s"} · ${days} days` : "Checked from your next visit"}</span>
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-2">
                    {r.total > 0 ? (
                      <span className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-brand-chip" role="img" aria-label={r.byChannel.map((c) => `${c.label} ${c.value}`).join(", ")}>
                        {r.byChannel.map((c) => (c.value > 0 ? <span key={c.label} title={`${c.label}: ${c.value}`} style={{ width: `${(c.value / r.total) * 100}%`, backgroundColor: c.color }} /> : null))}
                      </span>
                    ) : (
                      <span aria-hidden className="h-3 rounded-full bg-brand-chip" />
                    )}
                    {r.positioning ? (
                      <span className="line-clamp-2 text-[14px] leading-[1.45] text-brand-ink-2">{firstSentence(r.positioning)}</span>
                    ) : (
                      <AgentButton action={generateMarketIntelligenceAction} label="Generate a positioning read" pendingLabel="Reading…" align="start" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-wrap gap-2 @min-[640px]/col:justify-end">
                    {r.ads.length > 0 ? (
                      r.ads.map((a) => (
                        <Link key={a.href} href={a.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-brand-lavender-pale px-3 text-[12px] text-brand-ink no-underline hover:bg-brand-chip">
                          {a.label} <ExternalLink className="size-3" />
                        </Link>
                      ))
                    ) : (
                      <span className="text-[13px] text-brand-mute">{r.checked.length ? `No ads found on ${r.checked.join(" or ")}` : "Ad libraries not connected yet"}</span>
                    )}
                  </span>
                </article>
              ))}
            </section>
          )}
        </>
      }
      side={
        <>
          <ChartCard title="Your CTR vs category" action={benchmark ? <AgentButton action={generateMarketIntelligenceAction} label="Refresh" pendingLabel="Reading…" /> : undefined} table={{ columns: ["", "CTR"], rows: benchRows.map((b) => [b.label, b.display]) }}>
            {benchmark ? (
              <>
                <BarList rows={benchRows} labelWidth={140} compact />
                <span className="flex items-center gap-3">
                  <span className="shrink-0 rounded-full bg-brand-peach-pale px-2.5 py-1 text-[13px] text-brand-orange-text">AI estimate</span>
                  <span className="text-[13px] leading-[1.45] text-brand-mute">No third-party benchmark for this category</span>
                </span>
              </>
            ) : (
              <SkeletonChart line="An AI estimate of the category CTR, from your numbers and competitor context." action={<AgentButton action={generateMarketIntelligenceAction} label="Generate" pendingLabel="Reading…" />} />
            )}
          </ChartCard>

          <ChartCard title="Share of new ads" table={{ columns: ["Brand", "New ads"], rows: share.map((r) => [r.brand, r.total]) }}>
            {shareTotal > 0 ? (
              <>
                <StackBar segments={share.map((r, i) => ({ label: r.brand, value: r.total, display: `${Math.round((r.total / shareTotal) * 100)}%`, color: SERIES[i % SERIES.length] }))} />
                <span className="text-[13px] text-brand-mute">
                  {shareTotal} new ad{shareTotal === 1 ? "" : "s"} in {days} days{channelsUsed.length === 1 ? `, all on ${channelsUsed[0]}` : ""}
                </span>
              </>
            ) : (
              <SkeletonChart line={`No new competitor ads in the last ${days} days.`} />
            )}
          </ChartCard>

          <ChartCard title="Track another brand">
            <form action={trackCompetitorAction} className="flex gap-2">
              <label className="sr-only" htmlFor="track-brand">
                Brand name or website
              </label>
              <input id="track-brand" name="brand" required placeholder="Brand name or website" className="h-11 min-w-0 flex-1 rounded-full border border-brand-outline bg-white px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
              <button type="submit" className={pillClass("secondary", "sm")}>
                Add
              </button>
            </form>
          </ChartCard>
        </>
      }
    />
  );
}
