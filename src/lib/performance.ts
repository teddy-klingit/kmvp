import type { MetaInsightsResult } from "@/lib/integrations/meta-ads";
import type { LinkedInInsightsResult } from "@/lib/integrations/linkedin-ads";
import type { GoogleAdsInsightsResult } from "@/lib/integrations/google-ads";

export type PlatformCampaign = {
  platform: string;
  accountName: string;
  currency: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  conversions: number;
  costPerConversion: number | null;
  thumbnailUrl?: string | null;
};

export function buildPlatformCampaigns(
  meta: MetaInsightsResult,
  linkedIn: LinkedInInsightsResult,
  google: GoogleAdsInsightsResult
): PlatformCampaign[] {
  return [
    ...(meta.ok ? meta.campaigns.map((c) => ({ platform: "Meta", accountName: meta.accountName, currency: meta.currency, ...c })) : []),
    ...(linkedIn.ok ? linkedIn.campaigns.map((c) => ({ platform: "LinkedIn", accountName: linkedIn.accountName, currency: linkedIn.currency, ...c })) : []),
    ...(google.ok ? google.campaigns.map((c) => ({ platform: "Google", accountName: google.accountName, currency: google.currency, ...c })) : []),
  ];
}

/**
 * Headline numbers across all live platforms — spend and conversions add
 * cleanly, CTR must be recomputed from the totals rather than averaged
 * per-campaign. Cost-per-conversion deliberately only divides by the spend
 * of campaigns that actually have conversion tracking: most accounts only
 * have it configured on one platform, and blending in untracked platforms'
 * spend would make "58k per conversion" look like a real number instead of
 * a tracking gap.
 *
 * Ad accounts can be in different currencies (agency accounts routinely are)
 * — summing raw numbers across currencies produces a number that LOOKS like
 * money but isn't, so totalSpend/blendedCostPerConversion are only returned
 * when every campaign shares one currency. Otherwise the caller gets
 * `mixedCurrencies: true` and a per-currency breakdown instead.
 */
export function summarizePlatformCampaigns(campaigns: PlatformCampaign[]) {
  const currencies = new Set(campaigns.map((c) => c.currency));
  const mixedCurrencies = currencies.size > 1;
  const currency = campaigns[0]?.currency ?? "USD";

  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalConversions = Math.round(campaigns.reduce((s, c) => s + c.conversions, 0) * 100) / 100;
  const blendedCtr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 1000) / 10 : 0;

  if (mixedCurrencies) {
    const spendByCurrency = Array.from(currencies).map((cur) => ({
      currency: cur,
      amount: Math.round(campaigns.filter((c) => c.currency === cur).reduce((s, c) => s + c.spend, 0) * 100) / 100,
    }));
    return { mixedCurrencies: true as const, currency, spendByCurrency, totalConversions, blendedCtr, blendedCostPerConversion: null, conversionTrackingIsPartial: false };
  }

  const totalSpend = Math.round(campaigns.reduce((s, c) => s + c.spend, 0) * 100) / 100;
  const trackedSpend = campaigns.filter((c) => c.conversions > 0).reduce((s, c) => s + c.spend, 0);

  return {
    mixedCurrencies: false as const,
    currency,
    totalSpend,
    totalConversions,
    blendedCtr,
    blendedCostPerConversion: totalConversions > 0 ? Math.round((trackedSpend / totalConversions) * 100) / 100 : null,
    conversionTrackingIsPartial: totalConversions > 0 && trackedSpend < totalSpend,
  };
}

/** Weighted CTR per platform (total clicks / total impressions), not a naive average of per-campaign CTRs — so a campaign with 10 impressions doesn't skew the number as much as one with 30,000. */
export function ctrByLivePlatform(campaigns: PlatformCampaign[]) {
  const map = new Map<string, { impressions: number; clicks: number; count: number }>();
  for (const c of campaigns) {
    const entry = map.get(c.platform) ?? { impressions: 0, clicks: 0, count: 0 };
    entry.impressions += c.impressions;
    entry.clicks += c.clicks;
    entry.count += 1;
    map.set(c.platform, entry);
  }
  return Array.from(map.entries())
    .map(([key, { impressions, clicks, count }]) => ({
      key,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : 0,
      count,
    }))
    .sort((a, b) => b.ctr - a.ctr);
}
