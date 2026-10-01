"use client";

import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/utils";
import type { PlatformCampaign } from "@/lib/performance";
import { Radio, TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, Minus, Lightbulb } from "lucide-react";

type InsightTone = "good" | "bad" | "neutral";
type Insight = { text: string; tone: InsightTone };

const TONE_ICON: Record<InsightTone, typeof CheckCircle2> = { good: CheckCircle2, bad: AlertTriangle, neutral: Minus };
const TONE_CLASS: Record<InsightTone, string> = { good: "text-success-foreground", bad: "text-ink", neutral: "text-muted-foreground" };

/** Deterministic, rule-based read on one campaign against the rest of the
 * account — no AI call needed, since "is this CTR/cost good?" is just a
 * comparison against the account's own average. */
function buildInsights(campaign: PlatformCampaign, avgCtr: number, avgCostPerConversion: number | null): { insights: Insight[]; recommendation: string } {
  const insights: Insight[] = [];

  if (avgCtr > 0) {
    const ctrDeltaPct = Math.round(((campaign.ctr - avgCtr) / avgCtr) * 100);
    if (ctrDeltaPct >= 20) {
      insights.push({ text: `CTR is ${ctrDeltaPct}% above the account average (${avgCtr.toFixed(1)}%) — creative and targeting are resonating.`, tone: "good" });
    } else if (ctrDeltaPct <= -20) {
      insights.push({ text: `CTR is ${Math.abs(ctrDeltaPct)}% below the account average (${avgCtr.toFixed(1)}%) — worth a fresh look at creative or targeting.`, tone: "bad" });
    } else {
      insights.push({ text: `CTR is roughly in line with the account average (${avgCtr.toFixed(1)}%).`, tone: "neutral" });
    }
  }

  if (avgCostPerConversion && campaign.costPerConversion) {
    const costDeltaPct = Math.round(((campaign.costPerConversion - avgCostPerConversion) / avgCostPerConversion) * 100);
    if (costDeltaPct <= -15) {
      insights.push({ text: `Cost per conversion is ${Math.abs(costDeltaPct)}% cheaper than the account average — efficient spend.`, tone: "good" });
    } else if (costDeltaPct >= 15) {
      insights.push({ text: `Cost per conversion is ${costDeltaPct}% more expensive than the account average.`, tone: "bad" });
    }
  } else if (campaign.conversions === 0 && campaign.impressions >= 5000) {
    insights.push({ text: "No conversions tracked yet despite meaningful reach — confirm a conversion action is configured for this campaign.", tone: "neutral" });
  }

  const hasBad = insights.some((i) => i.tone === "bad");
  const hasGood = insights.some((i) => i.tone === "good");
  const recommendation = hasBad
    ? "Consider pausing, refreshing the creative, or reallocating budget toward stronger campaigns."
    : hasGood
      ? "A strong performer — consider increasing budget to scale it further."
      : "Performing in line with the rest of the account — no action needed right now.";

  return { insights, recommendation };
}

/**
 * Renders one campaign card (same look as the static grid used to render)
 * AND wires it up as a Dialog trigger — clicking it opens the full metric
 * breakdown, plus a rule-based read on what's good/bad about it and what to
 * do next, instead of only the always-visible summary row.
 */
export function CampaignDetailDialog({
  campaign,
  isStrong,
  isWeak,
  avgCtr,
  avgCostPerConversion,
}: {
  campaign: PlatformCampaign;
  isStrong: boolean;
  isWeak: boolean;
  avgCtr?: number;
  avgCostPerConversion?: number | null;
}) {
  const { insights, recommendation } = buildInsights(campaign, avgCtr ?? 0, avgCostPerConversion ?? null);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className="flex cursor-pointer gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-[var(--shadow-card)] transition-colors hover:border-accent/40 hover:bg-muted/40"
        >
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
            {campaign.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={campaign.thumbnailUrl} alt="" className="size-full object-cover" />
            ) : (
              <Radio className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-medium" title={campaign.campaignName}>
                {campaign.campaignName}
              </p>
              {(isStrong || isWeak) && (
                <span className={`flex shrink-0 items-center gap-0.5 text-[10px] font-medium ${isStrong ? "text-success-foreground" : "text-ink"}`}>
                  {isStrong ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {isStrong ? "Strong" : "Weak"}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>{campaign.impressions.toLocaleString()} impr.</span>
              <span>{campaign.clicks.toLocaleString()} clicks</span>
              <span className="font-medium text-foreground">{campaign.ctr}% CTR</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
              <span className="font-medium text-foreground">{formatMoney(campaign.spend, campaign.currency)} spent</span>
              {campaign.conversions > 0 ? (
                <span className="text-muted-foreground">
                  {campaign.conversions} conv. · {formatMoney(campaign.costPerConversion ?? 0, campaign.currency)}/conv.
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
              {campaign.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={campaign.thumbnailUrl} alt="" className="size-full object-cover" />
              ) : (
                <Radio className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate">{campaign.campaignName}</DialogTitle>
              <DialogDescription>
                {campaign.platform} · {campaign.accountName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-paper p-3">
            <p className="text-lg font-semibold">{campaign.impressions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Impressions</p>
          </div>
          <div className="rounded-lg border border-border bg-paper p-3">
            <p className="text-lg font-semibold">{campaign.clicks.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Clicks</p>
          </div>
          <div className="rounded-lg border border-border bg-paper p-3">
            <p className="text-lg font-semibold">{campaign.ctr}%</p>
            <p className="text-xs text-muted-foreground">Click-through rate</p>
          </div>
          <div className="rounded-lg border border-border bg-paper p-3">
            <p className="text-lg font-semibold">{formatMoney(campaign.spend, campaign.currency)}</p>
            <p className="text-xs text-muted-foreground">Spend (30d)</p>
          </div>
          {campaign.conversions > 0 && (
            <>
              <div className="rounded-lg border border-border bg-paper p-3">
                <p className="text-lg font-semibold">{campaign.conversions}</p>
                <p className="text-xs text-muted-foreground">Conversions</p>
              </div>
              <div className="rounded-lg border border-border bg-paper p-3">
                <p className="text-lg font-semibold">{formatMoney(campaign.costPerConversion ?? 0, campaign.currency)}</p>
                <p className="text-xs text-muted-foreground">Cost / conversion</p>
              </div>
            </>
          )}
        </div>

        {insights.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-paper p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Lightbulb className="size-3.5 text-ink" />
              Insights &amp; tips
            </p>
            <div className="flex flex-col gap-1.5">
              {insights.map((insight, i) => {
                const Icon = TONE_ICON[insight.tone];
                return (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    <Icon className={`mt-0.5 size-3.5 shrink-0 ${TONE_CLASS[insight.tone]}`} />
                    <p className="text-muted-foreground">{insight.text}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-1 border-t border-border pt-2 text-xs font-medium text-foreground">{recommendation}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
