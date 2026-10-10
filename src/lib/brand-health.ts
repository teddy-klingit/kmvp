import { prisma } from "@/lib/prisma";
import { ownsLiveAds } from "@/lib/integrations/live-ads-owner";
import { jsonArray } from "@/lib/utils";
import { platformStatus } from "@/lib/brand-completeness";
import { VISUAL_IDENTITY_FOLDERS, VISUAL_IDENTITY_CATEGORY } from "@/lib/brand-iq-taxonomy";
import { CONNECTABLE_APPS } from "@/lib/brand-sources";

/**
 * Brand health, 0–100: a weighted sum of five shares, computed from what's in Brand OS and connected. Never stored,
 * never invented. "Biggest lift" is the dimension with the most points left.
 */

export type HealthKey = "platform" | "visual" | "voice" | "sources" | "performance";

/** Weights are config: they sum to 100. */
export const BRAND_HEALTH_WEIGHTS: Record<HealthKey, number> = { platform: 35, visual: 20, voice: 20, sources: 10, performance: 15 };

const DIMENSIONS: { key: HealthKey; name: string; counts: string; fix: { label: string; href: string }; lift: string }[] = [
  { key: "platform", name: "Brand platform", counts: "Sections written", fix: { label: "Write the platform", href: "/assets/brand-platform" }, lift: "Writing the platform" },
  { key: "visual", name: "Visual identity", counts: "Colours, type, logo, imagery and more defined", fix: { label: "Add visual identity", href: "/assets/visual-identity" }, lift: "Filling in the visual identity" },
  { key: "voice", name: "Voice & tone", counts: "Voice, tone rules, words to use and to avoid", fix: { label: "Set the voice", href: "/assets/agents-templates/brand-os" }, lift: "Setting the voice and tone" },
  { key: "sources", name: "Sources", counts: "Apps with linked files", fix: { label: "Link sources", href: "/assets/sources" }, lift: "Linking your sources" },
  { key: "performance", name: "Performance data", counts: "Ad channels connected", fix: { label: "Connect channels", href: "/insights" }, lift: "Connecting your ad channels" },
];

export type HealthFacts = Record<HealthKey, { done: number; total: number }>;

export type BrandHealth = {
  score: number;
  label: "Weak" | "Fair" | "Good" | "Strong";
  dimensions: (Omit<(typeof DIMENSIONS)[number], "lift"> & { done: number; total: number; share: number; pointsLeft: number })[];
  biggestLift: { key: HealthKey; points: number; line: string } | null;
};

export function healthLabel(score: number): BrandHealth["label"] {
  return score >= 85 ? "Strong" : score >= 70 ? "Good" : score >= 40 ? "Fair" : "Weak";
}

export function computeBrandHealth(facts: HealthFacts): BrandHealth {
  const dimensions = DIMENSIONS.map((d) => {
    const { done, total } = facts[d.key];
    const share = total > 0 ? Math.min(1, done / total) : 0;
    return { key: d.key, name: d.name, counts: d.counts, fix: d.fix, done, total, share, pointsLeft: Math.round(BRAND_HEALTH_WEIGHTS[d.key] * (1 - share)) };
  });
  const score = Math.round(dimensions.reduce((s, d) => s + BRAND_HEALTH_WEIGHTS[d.key] * d.share, 0));
  const top = [...dimensions].sort((a, b) => b.pointsLeft - a.pointsLeft)[0];
  const biggestLift =
    top && top.pointsLeft > 0
      ? { key: top.key, points: top.pointsLeft, line: `Every agent reads your Brand OS. ${DIMENSIONS.find((d) => d.key === top.key)!.lift} is the biggest lift (+${top.pointsLeft}) and improves every output.` }
      : null;
  return { score, label: healthLabel(score), dimensions, biggestLift };
}

/** Bar colour by share: lime from 80%, ink from 40%, orange below (it's an action for the client). */
export function healthTone(share: number): "lime" | "ink" | "orange" {
  return share >= 0.8 ? "lime" : share >= 0.4 ? "ink" : "orange";
}

export async function loadBrandHealth(clientId: string) {
  const [client, brandOS, assets, sources, connections, linkedIn, googleAds] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { brandSummary: true } }),
    prisma.brandOS.findUnique({ where: { clientId } }),
    prisma.brandAsset.findMany({ where: { clientId }, select: { category: true } }),
    prisma.brandSource.findMany({ where: { clientId, archivedAt: null }, select: { app: true } }),
    prisma.brandConnection.findMany({ where: { clientId, status: "CONNECTED" }, select: { app: true } }),
    ownsLiveAds(clientId, "linkedin"),
    ownsLiveAds(clientId, "google-ads"),
  ]);
  const platform = platformStatus({ brandSummary: client.brandSummary, brandOS });
  const visualDone = VISUAL_IDENTITY_FOLDERS.filter((f) => {
    if (f.slug === "brand-colours") return jsonArray(brandOS?.approvedColors).length + jsonArray(brandOS?.colorPalette).length > 0;
    if (f.slug === "typography") return jsonArray(brandOS?.approvedTypography).length > 0;
    if (f.slug === "photography" && brandOS?.imageryStyle) return true;
    if (f.slug === "illustration" && brandOS?.illustrationStyle) return true;
    const category = VISUAL_IDENTITY_CATEGORY[f.slug];
    return category ? assets.some((a) => a.category === category) : false;
  }).length;
  const voice = [jsonArray(brandOS?.voiceAttributes), jsonArray(brandOS?.toneRules), jsonArray(brandOS?.dos), jsonArray(brandOS?.donts)].filter((l) => l.length > 0).length;
  const apps = new Set([...sources.map((s) => s.app), ...connections.map((c) => c.app)].filter((a) => a !== "web"));
  // Only ad accounts that belong to this client (live-ads-owner.ts), never the platform's.
  const meta = Boolean(process.env.META_ADS_ACCESS_TOKEN) && (await ownsLiveAds(clientId, "meta"));
  const channels = [meta, linkedIn, googleAds].filter(Boolean).length;
  return computeBrandHealth({
    platform: { done: platform.done, total: platform.total },
    visual: { done: visualDone, total: VISUAL_IDENTITY_FOLDERS.length },
    voice: { done: voice, total: 4 },
    sources: { done: apps.size, total: CONNECTABLE_APPS.length },
    performance: { done: channels, total: 3 },
  });
}
