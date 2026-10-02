import { prisma } from "@/lib/prisma";

const LI_VERSION = "202510";
const LI_API = "https://api.linkedin.com/rest";

export type LinkedInCampaignInsight = {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  conversions: number;
  costPerConversion: number | null;
};

export type LinkedInInsightsResult =
  | { ok: true; accountName: string; currency: string; campaigns: LinkedInCampaignInsight[] }
  | { ok: false; reason: "not_connected" | "api_error"; message?: string };

function liHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": LI_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

async function getValidAccessToken(): Promise<string | null> {
  const connection = await prisma.integrationConnection.findUnique({ where: { provider: "linkedin" } });
  if (!connection) return null;
  // Access tokens are ~60 days; we don't refresh proactively here — a connection
  // past its expiry just falls back to the "reconnect" state on next fetch.
  if (connection.expiresAt && connection.expiresAt.getTime() < Date.now()) return null;
  return connection.accessToken;
}

/**
 * The connected LinkedIn user's personal token can see ad accounts entirely
 * unrelated to this agency (their own role on someone else's account) — auto
 * "pick the first active account" surfaced a completely different business
 * once, the same failure mode we hit with Google Ads' account discovery. So
 * an explicit LINKEDIN_AD_ACCOUNT_ID is preferred, matching how Meta's own
 * account ID is configured; search is only a fallback if none is set.
 */
async function resolveAdAccount(token: string): Promise<{ id: string; name: string; currency: string } | null> {
  const explicitId = process.env.LINKEDIN_AD_ACCOUNT_ID;
  if (explicitId) {
    const res = await fetch(`${LI_API}/adAccounts/${explicitId}`, { headers: liHeaders(token) });
    if (res.ok) {
      const data = await res.json();
      return { id: explicitId, name: data.name ?? "LinkedIn Ads Account", currency: data.currency ?? "USD" };
    }
    // Account metadata isn't readable (e.g. the token isn't a direct member of
    // it, only app-level access was granted) — still usable for campaign data.
    // Currency is unknown in this case — costInLocalCurrency values from the
    // analytics call are still correct, we just can't label them confidently.
    return { id: explicitId, name: "LinkedIn Ads Account", currency: "USD" };
  }

  const res = await fetch(`${LI_API}/adAccounts?q=search&search=(status:(values:List(ACTIVE)))`, {
    headers: liHeaders(token),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const account = data.elements?.[0];
  if (!account) return null;
  return { id: String(account.id), name: account.name ?? "LinkedIn Ads Account", currency: account.currency ?? "USD" };
}

// Campaign endpoints require the account id in the URL path now — LinkedIn's
// own error message for the old ?ids=List(...) shape points at this new one.
async function fetchCampaignNames(token: string, accountId: string, campaignIds: string[]): Promise<Map<string, string>> {
  if (!campaignIds.length) return new Map();
  const url = `${LI_API}/adAccounts/${accountId}/adCampaigns?ids=List(${campaignIds.join(",")})`;
  const res = await fetch(url, { headers: liHeaders(token) });
  if (!res.ok) return new Map();
  const data = await res.json();
  const names = new Map<string, string>();
  for (const [id, campaign] of Object.entries(data.results ?? {})) {
    const name = (campaign as Record<string, unknown>)?.name;
    if (typeof name === "string") names.set(id, name);
  }
  return names;
}

async function fetchCampaignAnalytics(token: string, accountId: string): Promise<LinkedInCampaignInsight[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400000);
  const dateRange = `(start:(year:${start.getFullYear()},month:${start.getMonth() + 1},day:${start.getDate()}),end:(year:${end.getFullYear()},month:${end.getMonth() + 1},day:${end.getDate()}))`;

  // LinkedIn's Rest.li query parser needs List(...)/dateRange(...) parens and
  // commas literal, but the URN's colons inside List() must be percent-encoded
  // (urn%3Ali%3A...) — a plain URLSearchParams-encoded or fully-literal URL
  // both get a generic 400 ILLEGAL_ARGUMENT with no field-specific detail.
  const accountUrn = encodeURIComponent(`urn:li:sponsoredAccount:${accountId}`);
  const url =
    `${LI_API}/adAnalytics?q=statistics&pivots=List(CAMPAIGN)&dateRange=${dateRange}` +
    `&timeGranularity=ALL` +
    `&accounts=List(${accountUrn})` +
    `&fields=impressions,clicks,costInLocalCurrency,pivotValues,externalWebsiteConversions,oneClickLeads`;

  const res = await fetch(url, { headers: liHeaders(token) });
  if (!res.ok) throw new Error(`LinkedIn analytics request failed (${res.status})`);
  const data = await res.json();

  const rows = (data.elements ?? []) as Record<string, unknown>[];
  const campaignIds = rows.map((row) => {
    const urn = (row.pivotValues as string[])?.[0] ?? "";
    return urn.split(":").pop() ?? "";
  });
  const names = await fetchCampaignNames(token, accountId, campaignIds.filter(Boolean));

  return rows.map((row, i) => {
    const impressions = Number(row.impressions ?? 0);
    const clicks = Number(row.clicks ?? 0);
    const spend = Math.round(Number(row.costInLocalCurrency ?? 0) * 100) / 100;
    const id = campaignIds[i];
    const conversions = Number(row.externalWebsiteConversions ?? 0) + Number(row.oneClickLeads ?? 0);
    return {
      campaignId: id || "unknown",
      campaignName: names.get(id) ?? `Campaign ${id}`,
      impressions,
      clicks,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      spend,
      conversions,
      costPerConversion: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : null,
    };
  });
}

export async function getLinkedInAdInsights(): Promise<LinkedInInsightsResult> {
  const token = await getValidAccessToken();
  if (!token) return { ok: false, reason: "not_connected" };

  try {
    const account = await resolveAdAccount(token);
    if (!account) return { ok: false, reason: "api_error", message: "No active ad account found." };

    const campaigns = await fetchCampaignAnalytics(token, account.id);
    return { ok: true, accountName: account.name, currency: account.currency, campaigns };
  } catch (err) {
    return { ok: false, reason: "api_error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** One row per campaign per day (timeGranularity=DAILY) for the last `days` days. */
export async function getLinkedInDailyInsights(days = 90): Promise<import("@/lib/integrations/meta-ads").DailyResult> {
  const token = await getValidAccessToken();
  if (!token) return { ok: false, reason: "not_connected" };
  try {
    const account = await resolveAdAccount(token);
    if (!account) return { ok: false, reason: "api_error", message: "No active ad account found." };
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    const dateRange = `(start:(year:${start.getFullYear()},month:${start.getMonth() + 1},day:${start.getDate()}),end:(year:${end.getFullYear()},month:${end.getMonth() + 1},day:${end.getDate()}))`;
    const accountUrn = encodeURIComponent(`urn:li:sponsoredAccount:${account.id}`);
    const url =
      `${LI_API}/adAnalytics?q=statistics&pivots=List(CAMPAIGN)&dateRange=${dateRange}&timeGranularity=DAILY` +
      `&accounts=List(${accountUrn})&fields=impressions,clicks,costInLocalCurrency,pivotValues,externalWebsiteConversions,oneClickLeads,dateRange`;
    const res = await fetch(url, { headers: liHeaders(token) });
    if (!res.ok) return { ok: false, reason: "api_error", message: `LinkedIn analytics request failed (${res.status})` };
    const data = await res.json();
    const elements = (data.elements ?? []) as Record<string, unknown>[];
    const ids = [...new Set(elements.map((e) => ((e.pivotValues as string[])?.[0] ?? "").split(":").pop() ?? "").filter(Boolean))];
    const names = await fetchCampaignNames(token, account.id, ids);
    const rows = elements.map((e) => {
      const id = ((e.pivotValues as string[])?.[0] ?? "").split(":").pop() ?? "unknown";
      const d = (e.dateRange as { start?: { year: number; month: number; day: number } } | undefined)?.start;
      const date = d ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : "";
      return {
        campaignId: id,
        campaignName: names.get(id) ?? `Campaign ${id}`,
        date,
        impressions: Number(e.impressions ?? 0),
        clicks: Number(e.clicks ?? 0),
        spend: Math.round(Number(e.costInLocalCurrency ?? 0) * 100) / 100,
        conversions: Number(e.externalWebsiteConversions ?? 0) + Number(e.oneClickLeads ?? 0),
      };
    });
    return { ok: true, accountName: account.name, currency: account.currency, rows: rows.filter((r) => r.date) };
  } catch (err) {
    return { ok: false, reason: "api_error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}
