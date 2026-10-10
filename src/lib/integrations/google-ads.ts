import { prisma } from "@/lib/prisma";
import { ownsLiveAds } from "@/lib/integrations/live-ads-owner";

const API_VERSION = "v25";
const API = `https://googleads.googleapis.com/${API_VERSION}`;

export type GoogleAdsCampaignInsight = {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  conversions: number;
  costPerConversion: number | null;
};

export type GoogleAdsInsightsResult =
  | { ok: true; accountName: string; currency: string; campaigns: GoogleAdsCampaignInsight[] }
  | { ok: false; reason: "not_connected" | "not_configured" | "api_error"; message?: string };

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;

  await prisma.integrationConnection.update({
    where: { provider: "google-ads" },
    data: { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000) },
  });
  return data.access_token;
}

// Google access tokens last ~1h (far shorter than Meta's/LinkedIn's), so this
// actively refreshes via the stored refresh_token rather than just falling
// back to "reconnect" on expiry.
async function getValidAccessToken(): Promise<string | null> {
  const connection = await prisma.integrationConnection.findUnique({ where: { provider: "google-ads" } });
  if (!connection) return null;

  const nearExpiry = !connection.expiresAt || connection.expiresAt.getTime() < Date.now() + 60_000;
  if (!nearExpiry) return connection.accessToken;
  if (!connection.refreshToken) return null;

  return refreshAccessToken(connection.refreshToken);
}

function gAdsHeaders(token: string, loginCustomerId?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
  return headers;
}

async function gaqlSearch(token: string, customerId: string, query: string, loginCustomerId?: string) {
  const res = await fetch(`${API}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: gAdsHeaders(token, loginCustomerId ?? customerId),
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message ?? `Google Ads API request failed (${res.status}).`;
    throw new Error(message);
  }
  return data.results ?? [];
}

/**
 * Finds a real (non-manager) client account to pull performance from. The
 * OAuth-connected Google account may have access to unrelated
 * manager/client hierarchies beyond this agency's own — so this strongly
 * prefers an account that's DIRECTLY accessible and non-manager (i.e. one
 * the connected account owns outright) over drilling into some other
 * manager account's client list, which could otherwise surface an
 * unrelated business's data.
 */
async function findAccount(token: string): Promise<{ managerId: string; customerId: string; name: string; currency: string } | null> {
  const res = await fetch(`${API}/customers:listAccessibleCustomers`, { headers: gAdsHeaders(token) });
  if (!res.ok) return null;
  const data = await res.json();
  const accessibleIds: string[] = (data.resourceNames ?? []).map((rn: string) => rn.replace("customers/", ""));
  if (accessibleIds.length === 0) return null;

  // Pass 1: is any directly-accessible ID itself a real (non-manager) account?
  for (const id of accessibleIds) {
    try {
      const rows = await gaqlSearch(token, id, "SELECT customer.id, customer.descriptive_name, customer.manager, customer.currency_code FROM customer", id);
      const self = rows[0]?.customer as { manager?: boolean; id?: string; descriptiveName?: string; currencyCode?: string } | undefined;
      if (self && self.manager === false) {
        return { managerId: id, customerId: id, name: self.descriptiveName ?? "Google Ads Account", currency: self.currencyCode ?? "USD" };
      }
    } catch {
      continue;
    }
  }

  // Pass 2: fall back to the first real account found under any accessible manager.
  for (const managerId of accessibleIds) {
    try {
      const children = await gaqlSearch(
        token,
        managerId,
        "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.level, customer_client.currency_code FROM customer_client WHERE customer_client.level <= 2",
        managerId
      );
      const realAccount = children.find((row: { customerClient?: { manager?: boolean; id?: string } }) => row.customerClient?.manager === false);
      if (realAccount?.customerClient?.id) {
        return {
          managerId,
          customerId: String(realAccount.customerClient.id),
          name: realAccount.customerClient.descriptiveName ?? "Google Ads Account",
          currency: realAccount.customerClient.currencyCode ?? "USD",
        };
      }
    } catch {
      continue; // not a manager account (or no accessible children) — try the next accessible ID
    }
  }
  return null;
}

/** The live Google Ads account's campaigns, for the one client that owns it (live-ads-owner.ts). */
export async function getGoogleAdsAccountInsights(clientId: string): Promise<GoogleAdsInsightsResult> {
  if (!(await ownsLiveAds(clientId, "google-ads"))) return { ok: false, reason: "not_connected" };
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN || !process.env.GOOGLE_ADS_CLIENT_ID || !process.env.GOOGLE_ADS_CLIENT_SECRET) {
    return { ok: false, reason: "not_configured" };
  }

  const token = await getValidAccessToken();
  if (!token) return { ok: false, reason: "not_connected" };

  try {
    const account = await findAccount(token);
    if (!account) return { ok: false, reason: "api_error", message: "No accessible Google Ads client account found under this Manager Account." };

    const rows = await gaqlSearch(
      token,
      account.customerId,
      "SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED' ORDER BY metrics.impressions DESC LIMIT 25",
      account.managerId
    );

    const campaigns: GoogleAdsCampaignInsight[] = rows.map((row: { campaign?: { id?: string; name?: string }; metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: number; costPerConversion?: number } }) => {
      const impressions = Number(row.metrics?.impressions ?? 0);
      const clicks = Number(row.metrics?.clicks ?? 0);
      const conversions = Math.round(Number(row.metrics?.conversions ?? 0) * 100) / 100;
      return {
        campaignId: String(row.campaign?.id ?? "unknown"),
        campaignName: row.campaign?.name ?? "Campaign",
        impressions,
        clicks,
        ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
        spend: Math.round((Number(row.metrics?.costMicros ?? 0) / 1_000_000) * 100) / 100,
        conversions,
        costPerConversion: conversions > 0 ? Math.round((Number(row.metrics?.costPerConversion ?? 0) / 1_000_000) * 100) / 100 : null,
      };
    });

    return { ok: true, accountName: account.name, currency: account.currency, campaigns };
  } catch (err) {
    return { ok: false, reason: "api_error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** One row per campaign per day (segments.date in the SELECT) for the last `days` days. */
export async function getGoogleAdsDailyInsights(clientId: string, days = 90): Promise<import("@/lib/integrations/meta-ads").DailyResult> {
  if (!(await ownsLiveAds(clientId, "google-ads"))) return { ok: false, reason: "not_connected" };
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN || !process.env.GOOGLE_ADS_CLIENT_ID || !process.env.GOOGLE_ADS_CLIENT_SECRET) return { ok: false, reason: "not_configured" };
  const token = await getValidAccessToken();
  if (!token) return { ok: false, reason: "not_connected" };
  try {
    const account = await findAccount(token);
    if (!account) return { ok: false, reason: "api_error", message: "No accessible Google Ads client account found." };
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const rows = await gaqlSearch(
      token,
      account.customerId,
      `SELECT segments.date, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${iso(start)}' AND '${iso(end)}' AND campaign.status = 'ENABLED'`,
      account.managerId
    );
    return {
      ok: true,
      accountName: account.name,
      currency: account.currency,
      rows: rows.map((r: { segments?: { date?: string }; campaign?: { id?: string; name?: string }; metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: number } }) => ({
        campaignId: String(r.campaign?.id ?? "unknown"),
        campaignName: r.campaign?.name ?? "Campaign",
        date: r.segments?.date ?? "",
        impressions: Number(r.metrics?.impressions ?? 0),
        clicks: Number(r.metrics?.clicks ?? 0),
        spend: Math.round((Number(r.metrics?.costMicros ?? 0) / 1_000_000) * 100) / 100,
        conversions: Math.round(Number(r.metrics?.conversions ?? 0) * 100) / 100,
      })).filter((r: { date: string }) => r.date),
    };
  } catch (err) {
    return { ok: false, reason: "api_error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}
