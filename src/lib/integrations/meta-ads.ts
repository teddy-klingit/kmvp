const META_API_VERSION = "v21.0";

export type MetaCampaignInsight = {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  conversions: number;
  costPerConversion: number | null;
  thumbnailUrl: string | null;
};

export type MetaInsightsResult =
  | { ok: true; accountName: string; currency: string; campaigns: MetaCampaignInsight[] }
  | { ok: false; reason: "not_configured" | "api_error"; message?: string };

// In rough priority order — Meta splits "a lead happened" across several
// near-duplicate action_types depending on the source (on-page form vs
// pixel vs pure count); take the first that's present rather than summing,
// which would double-count the same lead under two labels.
const LEAD_ACTION_TYPES = ["lead", "onsite_web_lead", "offsite_conversion.fb_pixel_lead"];

async function fetchCreativeThumbnails(accountId: string, token: string): Promise<Map<string, string>> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${accountId}/ads?fields=campaign_id,creative{thumbnail_url}&effective_status=["ACTIVE"]&limit=100&access_token=${token}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return new Map();
  const data = await res.json();
  const thumbnails = new Map<string, string>();
  for (const ad of data.data ?? []) {
    const campaignId = ad.campaign_id;
    const thumbnailUrl = ad.creative?.thumbnail_url;
    // First ad wins per campaign — good enough for a representative preview.
    if (campaignId && thumbnailUrl && !thumbnails.has(campaignId)) thumbnails.set(campaignId, thumbnailUrl);
  }
  return thumbnails;
}

export async function getMetaAdAccountInsights(): Promise<MetaInsightsResult> {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !accountId) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const [accountRes, insightsRes, thumbnails] = await Promise.all([
      fetch(`https://graph.facebook.com/${META_API_VERSION}/${accountId}?fields=name,currency&access_token=${token}`, {
        next: { revalidate: 3600 },
      }),
      fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${accountId}/insights?level=campaign&fields=campaign_id,campaign_name,impressions,clicks,ctr,spend,actions,cost_per_action_type&date_preset=last_30d&limit=25&access_token=${token}`,
        { next: { revalidate: 3600 } }
      ),
      fetchCreativeThumbnails(accountId, token),
    ]);

    const accountData = await accountRes.json();
    const insightsData = await insightsRes.json();

    if (!accountRes.ok || !insightsRes.ok) {
      const message = insightsData?.error?.message ?? accountData?.error?.message ?? "Meta API request failed.";
      return { ok: false, reason: "api_error", message };
    }

    const campaigns: MetaCampaignInsight[] = (insightsData.data ?? []).map((row: Record<string, unknown>) => {
      const actions = (row.actions as { action_type: string; value: string }[] | undefined) ?? [];
      const costPerAction = (row.cost_per_action_type as { action_type: string; value: string }[] | undefined) ?? [];
      const leadType = LEAD_ACTION_TYPES.find((t) => actions.some((a) => a.action_type === t));
      const conversions = leadType ? Number(actions.find((a) => a.action_type === leadType)?.value ?? 0) : 0;
      const costPerConversion = leadType
        ? Number(costPerAction.find((a) => a.action_type === leadType)?.value ?? 0) || null
        : null;

      return {
        campaignId: String(row.campaign_id),
        campaignName: String(row.campaign_name),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        ctr: Math.round(Number(row.ctr ?? 0) * 100) / 100,
        spend: Math.round(Number(row.spend ?? 0) * 100) / 100,
        conversions,
        costPerConversion,
        thumbnailUrl: thumbnails.get(String(row.campaign_id)) ?? null,
      };
    });

    return { ok: true, accountName: accountData.name ?? "Meta Ads Account", currency: accountData.currency ?? "USD", campaigns };
  } catch (err) {
    return { ok: false, reason: "api_error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}

export type DailyRow = { campaignId: string; campaignName: string; date: string; impressions: number; clicks: number; spend: number; conversions: number };
export type DailyResult = { ok: true; accountName: string; currency: string; rows: DailyRow[] } | { ok: false; reason: "not_configured" | "not_connected" | "api_error"; message?: string };

/** One row per campaign per day (time_increment=1) for the last `days` days, following Meta's paging. */
export async function getMetaDailyInsights(days = 90): Promise<DailyResult> {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) return { ok: false, reason: "not_configured" };
  try {
    const accountRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${accountId}?fields=name,currency&access_token=${token}`);
    const account = await accountRes.json();
    if (!accountRes.ok) return { ok: false, reason: "api_error", message: account?.error?.message ?? "Meta API request failed." };
    const until = new Date();
    const since = new Date(until.getTime() - (days - 1) * 86400000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    let url: string | null =
      `https://graph.facebook.com/${META_API_VERSION}/${accountId}/insights?level=campaign&time_increment=1` +
      `&fields=campaign_id,campaign_name,impressions,clicks,spend,actions,date_start` +
      `&time_range=${encodeURIComponent(JSON.stringify({ since: iso(since), until: iso(until) }))}&limit=500&access_token=${token}`;
    const rows: DailyRow[] = [];
    for (let page = 0; url && page < 20; page++) {
      const res: Response = await fetch(url);
      const data = await res.json();
      if (!res.ok) return { ok: false, reason: "api_error", message: data?.error?.message ?? "Meta API request failed." };
      for (const row of (data.data ?? []) as Record<string, unknown>[]) {
        const actions = (row.actions as { action_type: string; value: string }[] | undefined) ?? [];
        const leadType = LEAD_ACTION_TYPES.find((t) => actions.some((a) => a.action_type === t));
        rows.push({
          campaignId: String(row.campaign_id),
          campaignName: String(row.campaign_name),
          date: String(row.date_start),
          impressions: Number(row.impressions ?? 0),
          clicks: Number(row.clicks ?? 0),
          spend: Number(row.spend ?? 0),
          conversions: leadType ? Number(actions.find((a) => a.action_type === leadType)?.value ?? 0) : 0,
        });
      }
      url = data.paging?.next ?? null;
    }
    return { ok: true, accountName: account.name ?? "Meta Ads Account", currency: account.currency ?? "USD", rows };
  } catch (err) {
    return { ok: false, reason: "api_error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}
