import { prisma } from "@/lib/prisma";
import { liveContract } from "@/lib/contracts";

/**
 * What a client's platform plan includes (Phase V). Clients on a contract read its platform plan; clients still on an
 * old plan map to the new ones (Starter and Growth → Pro, Scale and Enterprise → Enterprise, Basic → Basic). Never
 * used to hide data a client already had: only new Phase V features are gated.
 */
export type PlatformTier = "basic" | "pro" | "enterprise";

const OLD_TIER: Record<string, PlatformTier> = { BASIC: "basic", STARTER: "pro", GROWTH: "pro", SCALE: "enterprise", ENTERPRISE: "enterprise" };

export async function platformTier(clientId: string): Promise<PlatformTier> {
  const contract = await liveContract(clientId);
  const key = contract?.platformPlanKey;
  if (key === "basic" || key === "pro" || key === "enterprise") return key;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { planTier: true } });
  return OLD_TIER[client?.planTier ?? "BASIC"] ?? "basic";
}

export const FEATURES = {
  /** Every plan: connect sources, the Revenue tab's tiles and funnels. */
  revenueTiles: "basic",
  /** The channel / campaign / market table and "Work that brought revenue". */
  revenueTable: "pro",
  revenueWork: "pro",
  /** Choosing the credit model, campaign mapping and the offline sales upload. */
  attributionChoice: "enterprise",
  campaignMapping: "enterprise",
  offlineUpload: "enterprise",
} as const satisfies Record<string, PlatformTier>;
export type Feature = keyof typeof FEATURES;

const RANK: Record<PlatformTier, number> = { basic: 0, pro: 1, enterprise: 2 };
export const tierIncludes = (tier: PlatformTier, feature: Feature) => RANK[tier] >= RANK[FEATURES[feature]];
export const tierLabel = (t: PlatformTier) => (t === "basic" ? "Basic" : t === "pro" ? "Pro" : "Enterprise");

export async function entitlements(clientId: string) {
  const tier = await platformTier(clientId);
  return { tier, has: (f: Feature) => tierIncludes(tier, f), needs: (f: Feature) => tierLabel(FEATURES[f]) };
}
