import { runBigQuery } from "@/lib/integrations/bigquery";

const DATASET = "bigquery-public-data.google_ads_transparency_center.creative_stats";

export type GoogleCompetitorAd = { creativeId: string; pageUrl: string; format: string; topic: string | null };

export type GoogleCompetitorAdsResult =
  | { ok: true; brand: string; total: number; ads: GoogleCompetitorAd[] }
  | { ok: false; brand: string; reason: "not_configured" | "not_found" | "api_error"; message?: string };

function sqlEscape(value: string) {
  return value.replace(/'/g, "\\'");
}

/**
 * Exact (case-insensitive) match on advertiser_disclosed_name ONLY — a fuzzy
 * LIKE match was tested and returns pure noise (dozens of unrelated
 * companies whose name happens to contain the brand as a substring, e.g.
 * searching "affirm" surfaces "Affirming Autism Ltd", "Trans Affirmation
 * Unit SL", etc., none of them the real company). This dataset is also
 * EU/EEA-scoped (Digital Services Act transparency requirement) so a brand
 * with no EU Google Ads presence will legitimately return nothing — that's
 * shown as "not_found", not treated as an error.
 */
async function searchBrand(brand: string): Promise<GoogleCompetitorAdsResult> {
  const escaped = sqlEscape(brand.toLowerCase());

  const countResult = await runBigQuery(
    `SELECT COUNT(DISTINCT creative_id) AS total FROM \`${DATASET}\` WHERE LOWER(advertiser_disclosed_name) = '${escaped}'`
  );
  if (!countResult.ok) {
    return { ok: false, brand, reason: countResult.reason === "not_configured" ? "not_configured" : "api_error", message: countResult.reason === "not_configured" ? undefined : countResult.message };
  }

  const total = Number(countResult.rows[0]?.total ?? 0);
  if (total === 0) return { ok: false, brand, reason: "not_found" };

  const sampleResult = await runBigQuery(
    `SELECT creative_id, creative_page_url, ad_format_type, topic FROM \`${DATASET}\` WHERE LOWER(advertiser_disclosed_name) = '${escaped}' ORDER BY creative_id LIMIT 3`
  );
  if (!sampleResult.ok) {
    return { ok: false, brand, reason: "api_error", message: sampleResult.reason === "not_configured" ? undefined : sampleResult.message };
  }

  const ads: GoogleCompetitorAd[] = sampleResult.rows.map((row) => ({
    creativeId: String(row.creative_id),
    pageUrl: String(row.creative_page_url),
    format: String(row.ad_format_type ?? "UNKNOWN"),
    topic: row.topic ? String(row.topic) : null,
  }));

  return { ok: true, brand, total, ads };
}

export async function getGoogleCompetitorAds(brands: string[]): Promise<GoogleCompetitorAdsResult[]> {
  return Promise.all(brands.map((brand) => searchBrand(brand)));
}
