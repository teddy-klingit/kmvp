import { prisma } from "@/lib/prisma";
import { ownsLiveAds } from "@/lib/integrations/live-ads-owner";

/**
 * Settings → Connections (nav v3, 09): the apps Klingit reads from, per client. Files & docs are the Brand OS
 * sources (BrandConnection with a source app key); ad accounts and "your own AI model" are BrandConnection rows
 * too, keyed below. Status: CONNECTED | NEEDS_RECONNECT | REQUESTED (asked Klingit to connect) | DISCONNECTED.
 */
export const AD_ACCOUNTS = [
  { key: "meta_ads", name: "Meta Ads", description: "Performance for Insights and the Output library", monogram: "M", live: "meta" as const },
  { key: "tiktok_ads", name: "TikTok Ads", description: "Performance for Insights and the Output library", monogram: "TT", live: null },
  { key: "google_ads", name: "Google Ads", description: "Search and display performance", monogram: "G", live: "google-ads" as const },
  { key: "linkedin_ads", name: "LinkedIn Ads", description: "B2B campaigns", monogram: "in", live: "linkedin" as const },
];
export const AI_MODELS = [
  { key: "claude", name: "Claude (Anthropic)", description: "Use your own Claude account for skills and assistants", monogram: "A", keyPrefix: "sk-ant-" },
  { key: "openai", name: "OpenAI", description: "Use your own OpenAI account", monogram: "O", keyPrefix: "sk-" },
];

export type ConnectionMeta = { folders?: number; accounts?: string; workspace?: string; lastSyncAt?: string; note?: string; last4?: string; apiKey?: string };

/** The client's ad accounts, connected (including the platform's live accounts when this client owns them). */
export async function connectedAdAccounts(clientId: string) {
  const rows = await prisma.brandConnection.findMany({ where: { clientId, app: { in: AD_ACCOUNTS.map((a) => a.key) }, status: "CONNECTED" }, select: { app: true } });
  const keys = new Set(rows.map((r) => r.app));
  for (const a of AD_ACCOUNTS) if (a.live && (await ownsLiveAds(clientId, a.live))) keys.add(a.key);
  return keys;
}
