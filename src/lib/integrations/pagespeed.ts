export type PageSpeedScores = {
  performanceScore: number;
  seoScore: number;
  accessibilityScore: number;
  bestPracticesScore: number;
};

export type PageSpeedResult = { ok: true; scores: PageSpeedScores } | { ok: false; reason: "not_configured" | "api_error"; message?: string };

export async function getPageSpeedScores(domain: string): Promise<PageSpeedResult> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };

  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  const params = new URLSearchParams({
    url,
    key: apiKey,
    strategy: "mobile",
  });
  ["performance", "seo", "accessibility", "best-practices"].forEach((c) => params.append("category", c));

  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`, {
      next: { revalidate: 86400 }, // scores don't need to be fresher than daily
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();

    if (!res.ok) {
      return { ok: false, reason: "api_error", message: data?.error?.message ?? `PageSpeed request failed (${res.status}).` };
    }

    const categories = data.lighthouseResult?.categories;
    if (!categories) return { ok: false, reason: "api_error", message: "PageSpeed response had no Lighthouse results." };

    return {
      ok: true,
      scores: {
        performanceScore: Math.round((categories.performance?.score ?? 0) * 100),
        seoScore: Math.round((categories.seo?.score ?? 0) * 100),
        accessibilityScore: Math.round((categories.accessibility?.score ?? 0) * 100),
        bestPracticesScore: Math.round((categories["best-practices"]?.score ?? 0) * 100),
      },
    };
  } catch (err) {
    return { ok: false, reason: "api_error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}
