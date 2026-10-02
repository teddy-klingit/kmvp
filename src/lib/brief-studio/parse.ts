import { FORMATS, CHANNEL_GROUPS, QUESTION_BANK, type DeliverableKind } from "@/lib/brief-studio/question-bank";

/**
 * Reads what the client actually wrote: the kind of deliverable, the channels and formats, how many ideas, markets,
 * dates, why now, the objective, a call to action, a quoted key message, must-include and must-avoid, and a budget
 * ceiling only if they mention one. Deterministic, so the studio fills these in even when the brief agent is
 * unavailable; anything found here is the client's own answer.
 */

export type ParsedRequest = {
  /** What the client wrote. */
  raw: string;
  kind: DeliverableKind;
  projectType: "CAMPAIGN" | "SINGLE_ASSET" | "PRESENTATION" | "MOTION_VIDEO" | "DEVELOPMENT" | "BRAND_GUIDELINES" | "OTHER";
  channels: string[];
  formats: string[];
  ideasCount: number | null;
  markets: string[];
  deadline: Date | null;
  budgetCredits: number | null;
  objectiveId: string | null;
  objective: string | null;
  whyNowId: string | null;
  ctaId: string | null;
  keyMessage: string | null;
  metric: string | null;
  mustInclude: string[];
  mustAvoid: string[];
};

const KIND_RULES: [DeliverableKind, RegExp][] = [
  ["brand", /brand guidelines|guidelines|visual identity|new logo|logo design/i],
  ["deck", /\bdeck\b|presentation|slides|pitch/i],
  ["web", /landing page|website|web ?page|microsite/i],
  ["email", /\bemails?\b|newsletter/i],
  ["print", /\bprint\b|out-of-home|\booh\b|billboard|poster|in-store|point of sale/i],
  ["ads", /\bads?\b|advert|paid|campaign|banners?/i],
  ["social", /\bposts?\b|social|always[- ]on|instagram|tiktok|stor(y|ies)|reels?|carousel/i],
  ["video", /video|film|motion|animation|commercial/i],
];

const PROJECT_TYPE: Record<DeliverableKind, ParsedRequest["projectType"]> = {
  ads: "CAMPAIGN",
  social: "CAMPAIGN",
  email: "CAMPAIGN",
  print: "CAMPAIGN",
  deck: "PRESENTATION",
  video: "MOTION_VIDEO",
  web: "DEVELOPMENT",
  brand: "BRAND_GUIDELINES",
  other: "OTHER",
};

const CHANNELS: [string, RegExp][] = [
  ["Meta", /\bmeta\b|facebook|\bfb\b|instagram|\big\b/i],
  ["TikTok", /tik ?tok/i],
  ["LinkedIn", /linked ?in/i],
  ["Snapchat", /snap(chat)?\b/i],
  ["Search & display", /google|display|search ads?|programmatic/i],
  ["YouTube / CTV", /you ?tube|\bctv\b|connected tv|\btv\b/i],
  ["Print", /\bprint\b|newspaper|magazine/i],
  ["Out-of-home", /out-of-home|\bd?ooh\b|billboard|poster/i],
  ["In-store", /in-store|point of sale|\bpos\b/i],
];

const WHY_NOW_CUES: [string, RegExp][] = [
  ["seasonal", /black friday|christmas|holiday|summer|easter|back to school|q4/i],
  ["launch", /launch|new product|introduc/i],
  ["offer", /\boffer\b|\d+\s*% off|discount|promo/i],
  ["tired", /tired|fatigue|stale|refresh/i],
  ["competitor", /competitor|rival/i],
];

const CTA_CUES: [string, RegExp][] = [
  ["install", /install the app|download the app|app store|get the app/i],
  ["shop", /shop now|\bbuy\b|\bshop\b/i],
  ["signup", /sign[- ]?up|register/i],
];

const OBJECTIVE_IDS: [RegExp, string, string][] = [
  [/app[- ]?installs?|\binstalls?\b|downloads?/i, "installs", "Drive app installs"],
  [/win[- ]?back|re-?engage|reactivat|lapsed/i, "winback", "Win back lapsed users"],
  [/sign[- ]?ups?|leads?|registrations?/i, "signups", "Drive sign-ups"],
  [/\bsales\b|\bsell\b|conversions?|purchases?|revenue|black friday/i, "sales", "Drive sales"],
  [/awareness|reach/i, "awareness", "Build awareness"],
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
  const bank = QUESTION_BANK[kind];
  const channels = bank.fixedChannel ? [bank.fixedChannel] : CHANNELS.filter(([, re]) => re.test(text)).map(([c]) => c);
  // Formats only for a channel that's known (or for channel-less types), so nothing is suggested before the channel.
  const formats = FORMATS.filter((f) => channels.includes(f.channel) && f.matches.test(text) && !(f.channel === "Meta" && /tiktok/i.test(f.label))).map((f) => f.label);
  const ideas = text.match(/\b(\d+|two|three|four|five|six)\s+(ideas?|concepts?|variants?|versions?)\b/i);
  const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6 };
  const budget = text.match(/(?:budget|up to|max(?:imum)?|ceiling)[^\d]{0,12}(\d{1,4})\s*credits?/i) ?? text.match(/(\d{1,4})\s*credits?\s*(?:budget|max)/i);
  const quoted = text.match(/[“"']([^“”"']{8,160})[”"']/);
  const objective = OBJECTIVE_IDS.find(([re]) => re.test(text));
  const ctr = text.match(/(\d+(?:[.,]\d+)?)\s*%\s*ctr|ctr\s*(?:of|above|over)?\s*(\d+(?:[.,]\d+)?)\s*%/i);
  const mustInclude = [/disclaimer|legal line|terms/i.test(text) && "Legal disclaimer", /logo/i.test(text) && kind !== "brand" && "Logo lockup"].filter((x): x is string => Boolean(x));
  const avoid = [...text.matchAll(/\b(?:no|avoid|without|don't use|do not use)\s+([a-z][a-z -]{2,30})/gi)].map((m) => m[1].trim()).filter((x) => !/^(fees|interest|more|one|need|budget)/i.test(x));

  return {
    raw: text,
    kind,
    projectType: PROJECT_TYPE[kind],
    channels,
    formats,
    ideasCount: ideas ? (words[ideas[1].toLowerCase()] ?? Number(ideas[1])) : null,
    markets: parseMarkets(text),
    deadline: parseDeadline(text, now),
    budgetCredits: budget ? Number(budget[1]) : null,
    objectiveId: objective?.[1] ?? null,
    objective: objective?.[2] ?? null,
    whyNowId: WHY_NOW_CUES.find(([, re]) => re.test(text))?.[0] ?? null,
    ctaId: CTA_CUES.find(([, re]) => re.test(text))?.[0] ?? null,
    keyMessage: quoted ? quoted[1].trim() : null,
    metric: ctr ? `Beat ${(ctr[1] ?? ctr[2]).replace(",", ".")}% CTR` : null,
    mustInclude,
    mustAvoid: avoid,
  };
}

export const ALL_CHANNELS = CHANNEL_GROUPS.flatMap((g) => g.channels);

/** "Everyday buys app-install ads, SE + NO": rebuilt from the slots until the client renames the brief. */
export function briefTitle(args: { kind: DeliverableKind; channels: string[]; objectiveId: string | null; markets: string[]; text?: string; idea?: string | null }) {
  if (args.kind === "other" && !args.channels.length && args.text?.trim()) {
    const words = args.text.trim().replace(/\s+/g, " ").split(" ").slice(0, 6).join(" ").replace(/[.,;:!?]+$/, "");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  const noun = QUESTION_BANK[args.kind].noun;
  const purpose = args.objectiveId ? ({ installs: "app-install", sales: "sales", awareness: "awareness", signups: "sign-up", winback: "win-back" } as Record<string, string>)[args.objectiveId] ?? null : null;
  const channel = args.channels.length === 1 && !QUESTION_BANK[args.kind].fixedChannel ? args.channels[0] : null;
  const head = [args.idea ?? channel, purpose, noun].filter(Boolean).join(" ");
  const title = head.charAt(0).toUpperCase() + head.slice(1);
  const codes = args.markets.map(marketCode);
  return codes.length && codes.length <= 3 ? `${title}, ${codes.join(" + ")}` : codes.length ? `${title}, ${codes.length} markets` : title;
}
