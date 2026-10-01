import { prisma } from "@/lib/prisma";
import type { PlatformCampaign } from "@/lib/performance";
import { sampleImageUrl } from "@/lib/sample-image";

/**
 * Seeded paid-campaign data for a pitch/demo client (Client.isSampleAccount)
 * — built directly into PlatformCampaign's shape so it renders through the
 * exact same UI as real ad-platform data, just sourced from SampleAdCampaign
 * instead of a live Meta/LinkedIn/Google API call. Never falls back to
 * Klingit's own real connected accounts.
 */
export async function buildSamplePlatformCampaigns(clientId: string): Promise<PlatformCampaign[]> {
  const rows = await prisma.sampleAdCampaign.findMany({ where: { clientId }, orderBy: { spend: "desc" } });
  return rows.map((r) => ({
    platform: r.platform,
    accountName: r.accountName,
    currency: r.currency,
    campaignId: r.id,
    campaignName: r.campaignName,
    impressions: r.impressions,
    clicks: r.clicks,
    ctr: r.ctr,
    spend: r.spend,
    conversions: r.conversions,
    costPerConversion: r.costPerConversion,
    thumbnailUrl: sampleImageUrl(r.id),
  }));
}
