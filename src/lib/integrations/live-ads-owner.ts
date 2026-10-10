import { prisma } from "@/lib/prisma";

/**
 * Klingit's live ad-account connections (Meta from env, LinkedIn and Google Ads from IntegrationConnection) are
 * platform-wide credentials. They belong to exactly ONE client: the connection's clientId, else the
 * LIVE_ADS_CLIENT_ID env var. Every fetch of live ad data asks this first, so no client — and no assistant
 * answering a client — ever sees another client's campaigns. Nobody configured = nobody reads them.
 */
export type LiveAdProvider = "meta" | "linkedin" | "google-ads";

export async function liveAdsOwner(provider: LiveAdProvider): Promise<string | null> {
  if (provider !== "meta") {
    const connection = await prisma.integrationConnection.findUnique({ where: { provider }, select: { clientId: true } });
    if (connection?.clientId) return connection.clientId;
  }
  return process.env.LIVE_ADS_CLIENT_ID || null;
}

export async function ownsLiveAds(clientId: string | null | undefined, provider: LiveAdProvider) {
  return Boolean(clientId) && (await liveAdsOwner(provider)) === clientId;
}
