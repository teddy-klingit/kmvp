import { prisma } from "@/lib/prisma";

const LI_VERSION = "202510";

export type LinkedInAd = {
  adUrl: string;
  advertiserName: string;
};

export type LinkedInAdLibraryResult =
  | { ok: true; brand: string; total: number; ads: LinkedInAd[] }
  | { ok: false; brand: string; reason: "not_connected" | "api_error"; message?: string };

async function searchBrand(brand: string, token: string): Promise<LinkedInAdLibraryResult> {
  const params = new URLSearchParams({ q: "criteria", advertiser: brand, count: "3" });

  const res = await fetch(`https://api.linkedin.com/rest/adLibrary?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LI_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { ok: false, brand, reason: "api_error", message: data?.message ?? `LinkedIn Ad Library request failed (${res.status}).` };
  }

  const data = await res.json();
  const ads: LinkedInAd[] = (data.elements ?? []).map((row: { adUrl: string; details?: { advertiser?: { advertiserName?: string } } }) => ({
    adUrl: row.adUrl,
    advertiserName: row.details?.advertiser?.advertiserName ?? brand,
  }));

  return { ok: true, brand, total: data.paging?.total ?? ads.length, ads };
}

export async function getLinkedInCompetitorAds(brands: string[]): Promise<LinkedInAdLibraryResult[]> {
  const connection = await prisma.integrationConnection.findUnique({ where: { provider: "linkedin" } });
  if (!connection) {
    return brands.map((brand) => ({ ok: false, brand, reason: "not_connected" as const }));
  }

  return Promise.all(brands.map((brand) => searchBrand(brand, connection.accessToken)));
}
