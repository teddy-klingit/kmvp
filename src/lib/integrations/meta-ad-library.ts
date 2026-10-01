const META_API_VERSION = "v21.0";
const REACHED_COUNTRIES = ["US", "GB", "SE", "NO", "DK"];

export type AdLibraryAd = {
  id: string;
  pageName: string;
  bodyText: string | null;
  startDate: string | null;
  platforms: string[];
  snapshotUrl: string;
};

export type AdLibraryResult =
  | { ok: true; brand: string; ads: AdLibraryAd[] }
  | { ok: false; brand: string; reason: "not_configured" | "api_error"; message?: string };

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function searchBrand(brand: string, token: string): Promise<AdLibraryResult> {
  const params = new URLSearchParams({
    search_terms: brand,
    ad_type: "ALL",
    ad_reached_countries: JSON.stringify(REACHED_COUNTRIES),
    fields: "id,page_name,ad_creative_bodies,ad_delivery_start_time,publisher_platforms,ad_snapshot_url",
    // search_terms is a full-text match across ad copy, not an advertiser
    // lookup — a search for "Nike" or "Afterpay" surfaces any unrelated
    // advertiser whose ad copy just mentions the brand (a reseller, a "buy
    // now pay later with Afterpay" checkout mention). Meta's page-lookup
    // endpoints need a permission we don't have, so we over-fetch and filter
    // client-side by page name instead of trusting the raw match.
    limit: "25",
    access_token: token,
  });

  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/ads_archive?${params.toString()}`, {
    next: { revalidate: 3600 },
  });
  const data = await res.json();

  if (!res.ok) {
    return { ok: false, brand, reason: "api_error", message: data?.error?.message ?? "Ad Library request failed." };
  }

  const normalizedBrand = normalize(brand);
  const ads: AdLibraryAd[] = (data.data ?? [])
    .filter((row: Record<string, unknown>) => {
      const pageName = normalize(String(row.page_name ?? ""));
      return pageName.includes(normalizedBrand) || normalizedBrand.includes(pageName);
    })
    .slice(0, 3)
    .map((row: Record<string, unknown>) => ({
      id: String(row.id),
      pageName: String(row.page_name ?? brand),
      bodyText: Array.isArray(row.ad_creative_bodies) ? (row.ad_creative_bodies[0] as string) ?? null : null,
      startDate: (row.ad_delivery_start_time as string) ?? null,
      platforms: (row.publisher_platforms as string[]) ?? [],
      snapshotUrl: String(row.ad_snapshot_url ?? ""),
    }));

  return { ok: true, brand, ads };
}

export async function getCompetitorAdLibraryActivity(brands: string[]): Promise<AdLibraryResult[]> {
  // The Ad Library API rejects system-user tokens outright, even from an
  // ID-verified Business — it only accepts a token from a verified real
  // person, so this is deliberately separate from META_ADS_ACCESS_TOKEN.
  const token = process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  if (!token) {
    return brands.map((brand) => ({ ok: false, brand, reason: "not_configured" as const }));
  }

  return Promise.all(brands.map((brand) => searchBrand(brand, token)));
}
