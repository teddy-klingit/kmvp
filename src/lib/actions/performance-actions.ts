"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { getMetaAdAccountInsights } from "@/lib/integrations/meta-ads";
import { getLinkedInAdInsights } from "@/lib/integrations/linkedin-ads";
import { getGoogleAdsAccountInsights } from "@/lib/integrations/google-ads";
import { buildPlatformCampaigns } from "@/lib/performance";
import { buildSamplePlatformCampaigns } from "@/lib/integrations/sample-data";
import { synthesizePerformanceInsights } from "@/lib/ai/agents/performance-agent";

export type GeneratePerformanceInsightsState = { error?: string | null };

export async function generatePerformanceInsightsAction(
  _prev: GeneratePerformanceInsightsState,
  _formData: FormData
): Promise<GeneratePerformanceInsightsState> {
  const viewer = await getPortalViewer();
  const client = viewer.client;

  const assets = await prisma.asset.findMany({ where: { clientId: client.id, performanceCtr: { not: null } } });

  // A pitch/demo client's Performance tab never reads Klingit's own real
  // connected ad accounts — the AI brief must be grounded in the same
  // sample data the UI shows, not a leak of unrelated real client spend.
  const platformCampaigns = client.isSampleAccount
    ? await buildSamplePlatformCampaigns(client.id)
    : buildPlatformCampaigns(
        ...(await Promise.all([getMetaAdAccountInsights(), getLinkedInAdInsights(), getGoogleAdsAccountInsights()]))
      );

  const formatMap = new Map<string, { total: number; count: number }>();
  for (const a of assets) {
    if (a.performanceCtr === null) continue;
    const entry = formatMap.get(a.format) ?? { total: 0, count: 0 };
    entry.total += a.performanceCtr;
    entry.count += 1;
    formatMap.set(a.format, entry);
  }
  const ownFormatBreakdown = Array.from(formatMap.entries()).map(([format, { total, count }]) => ({
    format,
    ctr: Math.round((total / count) * 10) / 10,
    assetCount: count,
  }));

  if (platformCampaigns.length === 0 && ownFormatBreakdown.length === 0) {
    return { error: "No performance data available yet — connect an ad account or wait for delivered assets to have measured CTR." };
  }

  const result = await synthesizePerformanceInsights({
    clientId: client.id,
    clientName: client.name,
    platformCampaigns,
    ownFormatBreakdown,
  });

  if (!result.ok) return { error: result.error };

  await prisma.performanceBrief.upsert({
    where: { clientId: client.id },
    update: { summary: result.data.summary, recommendations: result.data.recommendations, generatedAt: new Date() },
    create: { clientId: client.id, summary: result.data.summary, recommendations: result.data.recommendations },
  });

  revalidatePath("/insights");
  return { error: null };
}
