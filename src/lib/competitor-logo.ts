/**
 * Phase X 2b: a competitor's logo for Insights, taken once from its website when staff or the client save it in
 * "Edit competitors": the site's own icon (apple-touch-icon, then icon, then /favicon.ico), kept as a small data URL so
 * pages never call the competitor's site. Nothing usable → null, and the brand shows as a monogram.
 */
const MAX_BYTES = 100_000;
const TIMEOUT = 6000;

/** "https://www.plumeskin.com/se" → "plumeskin.com". Public host names only: no IPs, localhost or internal names. */
export function siteDomain(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  if (/^\d+(\.\d+){3}$/.test(host) || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)) return null;
  return host;
}

/** The icon links in a page's <head>, best first: apple-touch-icon, then icons (PNG/SVG before ICO). */
export function iconLinks(html: string, base: string): string[] {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? null;
  const scored = links
    .map((tag) => ({ rel: (attr(tag, "rel") ?? "").toLowerCase(), href: attr(tag, "href") }))
    .filter((l) => l.href && /\bicon\b/.test(l.rel))
    .map((l) => ({ href: new URL(l.href!, base).toString(), score: (l.rel.includes("apple-touch") ? 3 : 1) + (/\.(png|svg)(\?|$)/i.test(l.href!) ? 1 : 0) }));
  return scored.sort((a, b) => b.score - a.score).map((l) => l.href);
}

async function image(url: string): Promise<string | null> {
  if (!url.startsWith("https://")) return null;
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!res.ok || !/^image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|jpeg|webp|gif)$/.test(type)) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return null;
  return `data:${type};base64,${buf.toString("base64")}`;
}

export async function fetchSiteIcon(domain: string): Promise<string | null> {
  if (process.env.NODE_ENV === "test") return null;
  const base = `https://${domain}/`;
  try {
    const res = await fetch(base, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT), headers: { "User-Agent": "KlingitLogoFetch/1.0" } });
    const html = res.ok ? (await res.text()).slice(0, 200_000) : "";
    for (const href of [...iconLinks(html, res.url || base), new URL("/favicon.ico", base).toString()]) {
      const data = await image(href).catch(() => null);
      if (data) return data;
    }
  } catch {
    // Unreachable site: the monogram stays.
  }
  return null;
}

export type CompetitorSite = { domain: string | null; logo: string | null };
export type CompetitorSites = Record<string, CompetitorSite>;

export function sitesOf(json: unknown): CompetitorSites {
  return json && typeof json === "object" && !Array.isArray(json) ? (json as CompetitorSites) : {};
}
