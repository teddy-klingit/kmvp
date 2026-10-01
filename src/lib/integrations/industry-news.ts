export type NewsItem = {
  title: string;
  link: string;
  source: string | null;
  publishedAt: Date | null;
};

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : "";
}

function clean(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

export async function getIndustryNews(query: string, limit = 6): Promise<NewsItem[]> {
  if (!query) return [];

  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];

    const xml = await res.text();
    const chunks = xml.split("<item>").slice(1).map((c) => c.split("</item>")[0]);

    return chunks.slice(0, limit).map((chunk) => {
      const rawTitle = clean(extractTag(chunk, "title"));
      const link = clean(extractTag(chunk, "link"));
      const pubDateRaw = extractTag(chunk, "pubDate");
      const sourceMatch = chunk.match(/<source url="[^"]*">([^<]*)<\/source>/);
      const source = sourceMatch ? clean(sourceMatch[1]) : null;
      const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
      const publishedAt = pubDateRaw ? new Date(pubDateRaw) : null;

      return { title, link, source, publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : null };
    });
  } catch {
    return [];
  }
}
