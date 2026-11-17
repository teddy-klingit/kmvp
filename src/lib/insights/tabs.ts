/**
 * Phase X v2: Insights is 8 tabs in 4 blocks (Overview · Your channels · Your sales · Your market). One list drives
 * the Insights menu, the mobile chips, each tab's header (crumb, title, the question it answers) and the redirects'
 * targets. Safe to import in client components.
 */
export type TabKey = "overview" | "paid" | "organic" | "website" | "email" | "sales" | "competitors" | "trends";
export type SegmentKey = "channels" | "sales" | "market";

export const SEGMENTS: Record<SegmentKey, { label: string; sub: string; bar: string; tint: string }> = {
  channels: { label: "Your channels", sub: "What you publish and pay for", bar: "#B455B6", tint: "#F8EEF8" },
  sales: { label: "Your sales", sub: "What it brings in", bar: "#8D9E47", tint: "#F2F6E4" },
  market: { label: "Your market", sub: "What happens around you", bar: "#5B6FB0", tint: "#EEF1FA" },
};

export type Tab = {
  key: TabKey;
  label: string;
  href: string;
  segment: SegmentKey | null;
  /** The menu's sub-line when the client has none of the tab's sources yet. */
  sources: string;
  question: string;
};

export const TABS: Tab[] = [
  { key: "overview", label: "Overview", href: "/insights", segment: null, sources: "The month in one page", question: "How is our marketing doing, and are we on track for our goals?" },
  { key: "paid", label: "Paid ads", href: "/insights/paid", segment: "channels", sources: "Meta · Google · LinkedIn", question: "What do our ads cost, what do they bring, and what should we change?" },
  { key: "organic", label: "Organic social", href: "/insights/organic", segment: "channels", sources: "Instagram · TikTok · LinkedIn", question: "Are our own channels growing, and what content works?" },
  { key: "website", label: "Website & search", href: "/insights/website", segment: "channels", sources: "GA4 · Search Console", question: "Do people find us, and does the website turn visits into sales?" },
  { key: "email", label: "Email", href: "/insights/email", segment: "channels", sources: "Klaviyo", question: "Do our newsletters and automatic emails sell?" },
  { key: "sales", label: "Sales", href: "/insights/sales", segment: "sales", sources: "Shopify · HubSpot", question: "What did marketing bring in, and from where?" },
  { key: "competitors", label: "Competitors", href: "/insights/competitors", segment: "market", sources: "Brands you track", question: "What are competitors doing, and are we ahead or behind?" },
  { key: "trends", label: "Trends", href: "/insights/trends", segment: "market", sources: "Your category", question: "What's rising that we could use, and what's coming up?" },
];

/** The tab a path belongs to ("/insights/paid/…" → Paid ads); anything else under /insights is the Overview. */
export function tabFor(pathname: string): Tab {
  return TABS.find((t) => t.href !== "/insights" && (pathname === t.href || pathname.startsWith(t.href + "/"))) ?? TABS[0];
}

/** Old Insights addresses (still stored in findings, opportunities and notifications) → the tab that took them over. */
const OLD: [string, string][] = [
  ["/insights/performance", "/insights/paid"],
  ["/insights/audience", "/insights/organic"],
  ["/insights/revenue", "/insights/sales"],
  ["/insights/seo", "/insights/website"],
  ["/insights/market/competitors", "/insights/competitors"],
  ["/insights/market/trends", "/insights/trends"],
  ["/insights/market", "/insights/competitors"],
  ["/insights/community", "/insights/organic#community"],
];
const isUnder = (href: string, path: string) => href === path || /^[/?#]/.test(href.slice(path.length)) && href.startsWith(path);

export function canonicalInsightsHref(href: string): string {
  for (const [from, to] of OLD) if (isUnder(href, from)) return to + href.slice(from.length);
  return href;
}

/** A tab's address plus the old ones that now lead to it, for matching stored links ("/insights/sales" → also "/insights/revenue"). */
export function hrefAliases(href: string): string[] {
  return [href, ...OLD.filter(([, to]) => to.split("#")[0] === href).map(([from]) => from)];
}
