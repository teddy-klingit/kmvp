import { FORMAT_CATALOG, formatsFor, type DeliverableKind } from "@/lib/brief-studio/formats";

/**
 * Reads what the client actually wrote: the kind of deliverable, the channel, formats, markets, dates, a budget,
 * an objective and a quoted key message. Deterministic, so the studio fills these in even when the brief agent
 * is unavailable; anything found here is the client's own answer.
 */

export type ParsedRequest = {
  /** What the client wrote. */
  raw: string;
  kind: DeliverableKind;
  projectType: "CAMPAIGN" | "SINGLE_ASSET" | "PRESENTATION" | "MOTION_VIDEO" | "DEVELOPMENT" | "BRAND_GUIDELINES" | "OTHER";
  channel: string | null;
  formats: string[];
  markets: string[];
  deadline: Date | null;
  budgetCredits: number | null;
  objective: string | null;
  keyMessage: string | null;
  successMetric: string | null;
  mustHaves: string[];
};

const KIND_RULES: [DeliverableKind, RegExp][] = [
  ["brand", /brand guidelines|guidelines|visual identity|new logo|logo design/i],
  ["deck", /\bdeck\b|presentation|slides|pitch/i],
  ["web", /landing page|website|web ?page|microsite/i],
  ["email", /\bemails?\b|newsletter/i],
  ["ads", /\bads?\b|advert|paid|campaign|banners?/i],
  ["social", /\bposts?\b|social|instagram|tiktok|stor(y|ies)|reels?|carousel/i],
  ["video", /video|film|motion|animation|commercial/i],
];

const PROJECT_TYPE: Record<DeliverableKind, ParsedRequest["projectType"]> = {
  ads: "CAMPAIGN",
  social: "CAMPAIGN",
  email: "CAMPAIGN",
  deck: "PRESENTATION",
  video: "MOTION_VIDEO",
  web: "DEVELOPMENT",
  brand: "BRAND_GUIDELINES",
  other: "OTHER",
};

const CHANNELS: [string, RegExp][] = [
  ["Instagram", /instagram|\big\b/i],
  ["Meta", /\bmeta\b|facebook|\bfb\b/i],
  ["TikTok", /tik ?tok/i],
  ["LinkedIn", /linked ?in/i],
  ["YouTube", /you ?tube/i],
  ["Google", /google|display network|search ads/i],
  ["Snapchat", /snap(chat)?/i],
  ["Pinterest", /pinterest/i],
];

export const MARKETS: { name: string; code: string; aliases: RegExp }[] = [
  { name: "Sweden", code: "SE", aliases: /sweden|swedish/i },
  { name: "Norway", code: "NO", aliases: /norway|norwegian/i },
  { name: "Denmark", code: "DK", aliases: /denmark|danish/i },
  { name: "Finland", code: "FI", aliases: /finland|finnish/i },
  { name: "Germany", code: "DE", aliases: /germany|german\b|\bdach\b/i },
  { name: "United Kingdom", code: "UK", aliases: /united kingdom|\bbritain|\bengland/i },
  { name: "United States", code: "US", aliases: /united states|\bamerica\b|\busa\b/i },
  { name: "Netherlands", code: "NL", aliases: /netherlands|dutch|holland/i },
  { name: "France", code: "FR", aliases: /france|french/i },
  { name: "Spain", code: "ES", aliases: /spain|spanish/i },
  { name: "Italy", code: "IT", aliases: /italy|italian/i },
  { name: "Poland", code: "PL", aliases: /poland|polish/i },
];

export const marketCode = (name: string) => MARKETS.find((m) => m.name === name)?.code ?? name.slice(0, 2).toUpperCase();

const OBJECTIVES: [RegExp, string][] = [
  [/app[- ]?installs?|installs?|downloads?/i, "Drive app installs"],
  [/win[- ]?back|re-?engage|reactivat|lapsed/i, "Win back lapsed users"],
  [/sign[- ]?ups?|leads?|registrations?/i, "Drive sign-ups"],
  [/\bsales\b|\bsell\b|conversions?|purchases?|revenue|black friday/i, "Drive sales"],
  [/awareness|reach|launch(ing)?\b/i, "Build awareness"],
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function futureDate(month: number, day: number, now: Date) {
  const d = new Date(now.getFullYear(), month, day);
  if (d.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) d.setFullYear(d.getFullYear() + 1);
  return d;
}

export function parseDeadline(text: string, now = new Date()): Date | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dayMonth = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
  if (dayMonth) return futureDate(MONTHS.indexOf(dayMonth[2].toLowerCase().slice(0, 3)), Number(dayMonth[1]), now);
  const monthDay = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (monthDay) return futureDate(MONTHS.indexOf(monthDay[1].toLowerCase().slice(0, 3)), Number(monthDay[2]), now);
  const weeks = text.match(/\bin\s+(\d+|two|three|four)\s+weeks?\b/i);
  if (weeks) {
    const n = { two: 2, three: 3, four: 4 }[weeks[1].toLowerCase()] ?? Number(weeks[1]);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n * 7);
  }
  const weekday = text.match(/\b(?:by|on|before|next)\s+(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[2].toLowerCase());
    let add = (target - now.getDay() + 7) % 7 || 7;
    if (weekday[1] || /next\s+\w+day/i.test(weekday[0])) add += add < 7 ? 7 : 0;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + add);
  }
  return null;
}

export function parseMarkets(text: string) {
  const found = new Set<string>();
  if (/nordics?|scandinavia/i.test(text)) ["Sweden", "Norway", "Denmark", "Finland"].forEach((m) => found.add(m));
  for (const m of MARKETS) {
    // Two-letter codes only in capitals ("SE + NO"), so "no" never reads as Norway.
    if (m.aliases.test(text) || new RegExp(`(^|[^A-Za-z])${m.code}([^A-Za-z]|$)`).test(text)) found.add(m.name);
  }
  return MARKETS.map((m) => m.name).filter((n) => found.has(n));
}

export function parseRequest(text: string, now = new Date()): ParsedRequest {
  const kind = KIND_RULES.find(([, re]) => re.test(text))?.[0] ?? "other";
  const channel = CHANNELS.find(([, re]) => re.test(text))?.[0] ?? null;

  const formats = formatsFor(kind)
    .filter((f) => {
      if (f.id === "stories") return /stor(y|ies)|9:16/i.test(text);
      if (f.id === "reels") return /reels?|video ads?|tiktok video/i.test(text);
      if (f.id === "static") return /static|feed posts?|1:1/i.test(text);
      if (f.id === "deck_short") return kind === "deck" && !/\b(2\d|[3-9]\d)\s*slides/i.test(text);
      if (f.id === "deck_long") return /\b(2\d|[3-9]\d)\s*slides/i.test(text);
      if (f.id === "landing" || f.id === "guidelines") return true;
      if (f.id === "film") return /\bfilm\b|commercial|full video|\btvc\b/i.test(text);
      return FORMAT_CATALOG.find((x) => x.id === f.id)!.matches.test(text) && f.matches.source !== "^$";
    })
    .map((f) => f.label);

  const budget = text.match(/(\d{1,4})\s*credits?/i);
  const quoted = text.match(/[“"']([^“”"']{8,160})[”"']/);
  const objective = OBJECTIVES.find(([re]) => re.test(text))?.[1] ?? null;
  const ctr = text.match(/(\d+(?:[.,]\d+)?)\s*%\s*ctr|ctr\s*(?:of|above|over)?\s*(\d+(?:[.,]\d+)?)\s*%/i);
  const mustHaves = [/disclaimer|legal|terms/i.test(text) && "Legal disclaimer", /logo/i.test(text) && kind !== "brand" && "Logo lockup", /price|pricing/i.test(text) && "Price and terms"].filter(
    (x): x is string => Boolean(x)
  );

  return {
    raw: text,
    kind,
    projectType: PROJECT_TYPE[kind],
    channel,
    formats,
    markets: parseMarkets(text),
    deadline: parseDeadline(text, now),
    budgetCredits: budget ? Number(budget[1]) : null,
    objective,
    keyMessage: quoted ? quoted[1].trim() : null,
    successMetric: ctr ? `Beat ${(ctr[1] ?? ctr[2]).replace(",", ".")}% CTR` : null,
    mustHaves,
  };
}

/** "Meta app-install ads, SE + NO" — rebuilt from the sections until the client renames the brief. */
export function briefTitle(args: { kind: DeliverableKind; channel: string | null; objective: string | null; markets: string[]; text?: string }) {
  // Nothing to name it by: the client's own first words.
  if (args.kind === "other" && !args.channel && args.text?.trim()) {
    const words = args.text.trim().replace(/\s+/g, " ").split(" ").slice(0, 6).join(" ").replace(/[.,;:!?]+$/, "");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  const noun: Record<DeliverableKind, string> = { ads: "ads", social: "posts", deck: "deck", video: "video", web: "landing page", email: "emails", brand: "brand guidelines", other: "brief" };
  const purpose = args.objective
    ? { "Drive app installs": "app-install", "Drive sales": "sales", "Build awareness": "awareness", "Drive sign-ups": "sign-up", "Win back lapsed users": "win-back" }[args.objective] ?? null
    : null;
  const head = [args.channel, purpose, noun[args.kind]].filter(Boolean).join(" ");
  const title = head.charAt(0).toUpperCase() + head.slice(1);
  const codes = args.markets.map(marketCode);
  return codes.length && codes.length <= 3 ? `${title}, ${codes.join(" + ")}` : codes.length ? `${title}, ${codes.length} markets` : title;
}
