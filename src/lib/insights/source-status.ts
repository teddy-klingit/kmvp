import { prisma } from "@/lib/prisma";
import { loadPaidMedia } from "@/lib/insights-data";
import type { TabKey } from "@/lib/insights/tabs";

/**
 * Phase X v2: which sources each Insights tab reads, and which of them need attention, for the menu's orange
 * dots, its sub-lines, the freshness line and "Sources & connections · N issues".
 */
const TABS_OF: Record<string, TabKey[]> = {
  Meta: ["paid", "organic"],
  Google: ["paid"],
  LinkedIn: ["paid", "organic"],
  TikTok: ["paid", "organic"],
  GA4: ["website"],
  "Search Console": ["website"],
  Klaviyo: ["email", "sales"],
  Shopify: ["sales"],
  HubSpot: ["sales"],
  Offline: ["sales"],
};

const NAME: Record<string, string> = { Google: "Google Ads", Offline: "Store sales" };
const ATTENTION = new Set(["needs_reconnect", "error"]);
const LIVE = new Set(["connected", "setting_up"]);

export type SourceStatus = { source: string; name: string; tabs: TabKey[]; state: "ok" | "attention"; note: string | null; since: Date | null };

export async function insightsSourceStatus(clientId: string) {
  const [rows, paid] = await Promise.all([
    prisma.dataSource.findMany({ where: { clientId }, select: { source: true, status: true, lastError: true, lastSyncAt: true, updatedAt: true } }),
    loadPaidMedia(clientId),
  ]);
  const byKey = new Map<string, SourceStatus>();
  for (const r of rows) {
    if (!LIVE.has(r.status) && !ATTENTION.has(r.status)) continue;
    const attention = ATTENTION.has(r.status);
    byKey.set(r.source, { source: r.source, name: NAME[r.source] ?? r.source, tabs: TABS_OF[r.source] ?? [], state: attention ? "attention" : "ok", note: attention ? (r.lastError ?? "Needs reconnecting") : null, since: attention ? r.updatedAt : r.lastSyncAt });
  }
  // Ad accounts read through the ad integrations count as connected even without a Phase V source row.
  for (const p of paid.connected) if (!byKey.has(p)) byKey.set(p, { source: p, name: NAME[p] ?? p, tabs: TABS_OF[p] ?? ["paid"], state: "ok", note: null, since: null });
  const sources = [...byKey.values()];
  const attention = sources.filter((s) => s.state === "attention");
  const dots: Partial<Record<TabKey, string>> = {};
  for (const s of attention) for (const t of s.tabs) dots[t] ??= `${s.name}: ${s.note ?? "needs attention"}`;
  const lastSync = sources.map((s) => (s.state === "ok" ? s.since : null)).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return { sources, attention, dots, lastSync };
}

/** The menu's sub-line per tab: the client's own sources for it, or the usual ones when it has none yet. */
export function tabSourceLine(sources: SourceStatus[], tab: TabKey, fallback: string) {
  // Organic reach comes from the pages themselves, not the ad accounts: keep the usual list there.
  if (tab === "organic" || tab === "overview" || tab === "competitors" || tab === "trends") return fallback;
  const names = sources.filter((s) => s.tabs.includes(tab) && s.source !== "Offline").map((s) => s.name.replace(/ Ads$/, ""));
  return names.length ? [...new Set(names)].join(" · ") : fallback;
}
