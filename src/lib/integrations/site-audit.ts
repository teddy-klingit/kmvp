export type OnPageChecks = {
  hasTitle: boolean;
  titleLength: number;
  hasMetaDescription: boolean;
  metaDescriptionLength: number;
  h1Count: number;
  structuredDataTypes: string[];
  hasSitemap: boolean;
  aiCrawlerAccess: Record<string, "allowed" | "blocked">;
};

export type SiteAuditResult = { ok: true; domain: string; onPage: OnPageChecks } | { ok: false; domain: string; message: string };

const AI_CRAWLERS = ["GPTBot", "Google-Extended", "PerplexityBot", "ClaudeBot", "CCBot", "anthropic-ai"];

/** Best-effort robots.txt parser — handles exact bot blocks and a "*" wildcard fallback, not the full RFC (e.g. path-specific Allow/Disallow beyond "/"). Good enough to answer "can AI crawlers reach this site at all". */
function parseRobotsBlocks(robotsTxt: string): Map<string, boolean> {
  const blocks = new Map<string, boolean>();
  let currentAgents: string[] = [];
  let groupClosed = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) {
      groupClosed = true;
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (groupClosed) currentAgents = [];
      groupClosed = false;
      const agent = value.toLowerCase();
      currentAgents.push(agent);
      if (!blocks.has(agent)) blocks.set(agent, false);
    } else {
      groupClosed = true;
      if (key === "disallow" && value === "/") {
        for (const a of currentAgents) blocks.set(a, true);
      }
    }
  }
  return blocks;
}

function checkRobotsAccess(blocks: Map<string, boolean>, bot: string): "allowed" | "blocked" {
  const key = bot.toLowerCase();
  if (blocks.has(key)) return blocks.get(key) ? "blocked" : "allowed";
  if (blocks.has("*")) return blocks.get("*") ? "blocked" : "allowed";
  return "allowed";
}

export async function auditSiteOnPage(domain: string): Promise<SiteAuditResult> {
  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  const base = url.replace(/\/$/, "");

  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { ok: false, domain, message: `Site returned HTTP ${res.status}.` };
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? "";

    const metaMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    const metaDescription = metaMatch?.[1]?.trim() ?? "";

    const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;

    const structuredDataTypes = new Set<string>();
    for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const data = JSON.parse(m[1]);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item?.["@type"]) structuredDataTypes.add(String(item["@type"]));
          if (Array.isArray(item?.["@graph"])) {
            for (const g of item["@graph"]) if (g?.["@type"]) structuredDataTypes.add(String(g["@type"]));
          }
        }
      } catch {
        continue; // malformed JSON-LD block, skip
      }
    }

    const hasSitemap = await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(5000) })
      .then((r) => r.ok)
      .catch(() => false);

    const aiCrawlerAccess: Record<string, "allowed" | "blocked"> = {};
    const robotsTxt = await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(5000) })
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null);
    const blocks = robotsTxt !== null ? parseRobotsBlocks(robotsTxt) : new Map<string, boolean>();
    for (const bot of AI_CRAWLERS) aiCrawlerAccess[bot] = checkRobotsAccess(blocks, bot);

    return {
      ok: true,
      domain,
      onPage: {
        hasTitle: title.length > 0,
        titleLength: title.length,
        hasMetaDescription: metaDescription.length > 0,
        metaDescriptionLength: metaDescription.length,
        h1Count,
        structuredDataTypes: Array.from(structuredDataTypes),
        hasSitemap,
        aiCrawlerAccess,
      },
    };
  } catch (err) {
    return { ok: false, domain, message: err instanceof Error ? err.message : "Could not reach site." };
  }
}
