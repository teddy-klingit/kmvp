/**
 * The Brief studio's question bank, per deliverable type (README: "the question framework"): the channels a type
 * runs on, the formats each channel takes (and how each is priced on the Price List), and the wording and
 * options of every question. Config, not logic: planner.ts decides what to ask and when.
 */

export type DeliverableKind = "ads" | "video" | "web" | "print" | "social" | "email" | "deck" | "brand" | "other";
type Tier = "LOW" | "MEDIUM" | "HIGH";

/** A format a channel takes, priced as a Price List deliverable type (null = not on the price list yet). */
export type FormatDef = { id: string; label: string; channel: string; priceType: string | null; tiers: [Tier, Tier]; matches: RegExp };

export const CHANNEL_GROUPS: { group: string; channels: string[] }[] = [
  { group: "Social", channels: ["Meta", "TikTok", "LinkedIn", "Snapchat"] },
  { group: "Other digital", channels: ["Search & display", "YouTube / CTV"] },
  { group: "Offline", channels: ["Print", "Out-of-home", "In-store"] },
];

const SOCIAL_POST = "Social post (static)";
const CUTDOWN = "Video cutdown (<30s)";

export const FORMATS: FormatDef[] = [
  { id: "meta_stories", label: "Stories 9:16", channel: "Meta", priceType: SOCIAL_POST, tiers: ["MEDIUM", "HIGH"], matches: /^(story|stories)\b|story 9:16/i },
  { id: "meta_reels", label: "Reels 9:16", channel: "Meta", priceType: CUTDOWN, tiers: ["MEDIUM", "HIGH"], matches: /reel|video 9:16/i },
  { id: "meta_feed", label: "Feed 1:1", channel: "Meta", priceType: SOCIAL_POST, tiers: ["LOW", "MEDIUM"], matches: /static|feed|1:1/i },
  { id: "meta_carousel", label: "Carousel", channel: "Meta", priceType: SOCIAL_POST, tiers: ["MEDIUM", "HIGH"], matches: /carousel/i },
  { id: "tiktok_infeed", label: "TikTok in-feed", channel: "TikTok", priceType: CUTDOWN, tiers: ["MEDIUM", "HIGH"], matches: /tiktok/i },
  { id: "tiktok_spark", label: "Spark ads", channel: "TikTok", priceType: CUTDOWN, tiers: ["LOW", "MEDIUM"], matches: /spark/i },
  { id: "linkedin_single", label: "Single image", channel: "LinkedIn", priceType: SOCIAL_POST, tiers: ["LOW", "MEDIUM"], matches: /single image/i },
  { id: "linkedin_carousel", label: "Document carousel", channel: "LinkedIn", priceType: SOCIAL_POST, tiers: ["MEDIUM", "HIGH"], matches: /document/i },
  { id: "linkedin_video", label: "LinkedIn video", channel: "LinkedIn", priceType: CUTDOWN, tiers: ["MEDIUM", "HIGH"], matches: /linkedin video/i },
  { id: "snap_ad", label: "Snap ad 9:16", channel: "Snapchat", priceType: CUTDOWN, tiers: ["LOW", "MEDIUM"], matches: /snap/i },
  { id: "display_set", label: "Display banners", channel: "Search & display", priceType: SOCIAL_POST, tiers: ["LOW", "MEDIUM"], matches: /banner|\d+\s*[×x]\s*\d+/i },
  { id: "search_ads", label: "Search ads", channel: "Search & display", priceType: "Email copy", tiers: ["LOW", "MEDIUM"], matches: /search ad/i },
  { id: "yt_bumper", label: "Bumper 6s", channel: "YouTube / CTV", priceType: CUTDOWN, tiers: ["LOW", "MEDIUM"], matches: /bumper/i },
  { id: "yt_instream", label: "In-stream 15s", channel: "YouTube / CTV", priceType: CUTDOWN, tiers: ["MEDIUM", "HIGH"], matches: /in-?stream/i },
  { id: "ctv_30", label: "CTV 30s", channel: "YouTube / CTV", priceType: "Full video production", tiers: ["HIGH", "HIGH"], matches: /ctv|tv spot|30s/i },
  { id: "print_ad", label: "Print ad", channel: "Print", priceType: null, tiers: ["MEDIUM", "HIGH"], matches: /print/i },
  { id: "ooh_poster", label: "Poster", channel: "Out-of-home", priceType: null, tiers: ["MEDIUM", "HIGH"], matches: /poster|billboard/i },
  { id: "dooh", label: "Digital out-of-home", channel: "Out-of-home", priceType: CUTDOWN, tiers: ["MEDIUM", "HIGH"], matches: /dooh|digital out/i },
  { id: "pos", label: "Point of sale", channel: "In-store", priceType: null, tiers: ["MEDIUM", "HIGH"], matches: /point of sale|pos\b|in-?store/i },
  // Channel-less deliverable types.
  { id: "film", label: "Brand film", channel: "Video", priceType: "Full video production", tiers: ["HIGH", "HIGH"], matches: /film|commercial/i },
  { id: "cutdowns", label: "Cutdowns", channel: "Video", priceType: CUTDOWN, tiers: ["LOW", "MEDIUM"], matches: /cutdown/i },
  { id: "landing", label: "Landing page", channel: "Web", priceType: "Landing page build", tiers: ["MEDIUM", "HIGH"], matches: /landing|web ?page/i },
  { id: "email", label: "Email", channel: "Email", priceType: "Email copy", tiers: ["LOW", "MEDIUM"], matches: /email|newsletter/i },
  { id: "deck", label: "Deck, about 10 slides", channel: "Deck", priceType: "PPT slide", tiers: ["MEDIUM", "MEDIUM"], matches: /deck|slides/i },
  { id: "guidelines", label: "Brand guidelines", channel: "Brand", priceType: "Brand guidelines deck", tiers: ["HIGH", "HIGH"], matches: /guidelines/i },
];

export const formatsForChannels = (channels: string[]) => FORMATS.filter((f) => channels.includes(f.channel));
export const formatByLabel = (label: string) => FORMATS.find((f) => f.label.toLowerCase() === label.trim().toLowerCase()) ?? FORMATS.find((f) => f.matches.test(label)) ?? null;

/** Units a deck or a single page counts as, against the ideas × sizes of everything else. */
export const UNITS_PER_FORMAT: Record<string, number> = { deck: 10, landing: 1, guidelines: 1, film: 1 };

export type QuestionText = { question: string; hint?: string; options: { id: string; label: string }[]; footnote?: string };

export type KindBank = {
  /** Where the work runs: asked first when the message doesn't say. Empty = the type has one fixed channel. */
  channels: string[];
  fixedChannel?: string;
  noun: string;
  whyNow: QuestionText;
  objective: QuestionText & { metricFor: Record<string, string> };
  /** {brand} is replaced. */
  barrier: QuestionText;
  keyMessage: Omit<QuestionText, "options">;
  proofOffer: Omit<QuestionText, "options">;
  cta: QuestionText;
  material: QuestionText;
};

const WHY_NOW: QuestionText = {
  question: "Why now?",
  options: [
    { id: "launch", label: "A launch" },
    { id: "offer", label: "An offer with dates" },
    { id: "tired", label: "Our ads are tired" },
    { id: "seasonal", label: "A seasonal moment" },
    { id: "competitor", label: "A competitor move" },
  ],
};

const MATERIAL: QuestionText = {
  question: "Do you have the material, or should Klingit make it?",
  options: [
    { id: "client", label: "We have product shots" },
    { id: "klingit", label: "Klingit creates the visuals" },
    { id: "shoot", label: "We need a shoot" },
  ],
  footnote: "Changes the estimate, shown on the right",
};

const BARRIER: QuestionText = { question: "What do people get wrong about {brand} today?", hint: "This is what the work needs to change", options: [] };

const ADS_OBJECTIVE = {
  question: "What should the ads achieve?",
  options: [
    { id: "installs", label: "App installs" },
    { id: "sales", label: "Sales" },
    { id: "awareness", label: "Awareness" },
    { id: "winback", label: "Win back old users" },
  ],
  metricFor: { installs: "lower cost per install", sales: "return on ad spend", awareness: "reach and ad recall lift", winback: "reactivated users" },
};

export const QUESTION_BANK: Record<DeliverableKind, KindBank> = {
  ads: {
    channels: CHANNEL_GROUPS.flatMap((g) => g.channels),
    noun: "ads",
    whyNow: WHY_NOW,
    objective: ADS_OBJECTIVE,
    barrier: { ...BARRIER, hint: "This is what the ads need to change" },
    keyMessage: { question: "What's the one thing people should remember?", hint: "Pick one or write your own" },
    proofOffer: { question: "What's the offer or proof point?", hint: "The exact wording, if you have it" },
    cta: {
      question: "What should people do after seeing it?",
      options: [
        { id: "install", label: "Install the app" },
        { id: "shop", label: "Shop now" },
        { id: "signup", label: "Sign up" },
        { id: "learn", label: "Learn more" },
      ],
    },
    material: MATERIAL,
  },
  social: {
    channels: ["Meta", "TikTok", "LinkedIn", "Snapchat"],
    noun: "posts",
    whyNow: WHY_NOW,
    objective: {
      question: "What should the posts do?",
      options: [
        { id: "engagement", label: "Grow engagement" },
        { id: "awareness", label: "Awareness" },
        { id: "sales", label: "Drive sales" },
        { id: "community", label: "Build the community" },
      ],
      metricFor: { engagement: "engagement rate", awareness: "reach", sales: "clicks to the shop", community: "followers and replies" },
    },
    barrier: BARRIER,
    keyMessage: { question: "What's the one thing people should remember?", hint: "Pick one or write your own" },
    proofOffer: { question: "Is there an offer or a proof point to feature?" },
    cta: { question: "What should people do next?", options: [{ id: "follow", label: "Follow us" }, { id: "shop", label: "Shop now" }, { id: "comment", label: "Comment or share" }, { id: "learn", label: "Learn more" }] },
    material: MATERIAL,
  },
  video: {
    channels: ["YouTube / CTV", "Meta", "TikTok"],
    noun: "video",
    whyNow: WHY_NOW,
    objective: {
      question: "What should the video achieve?",
      options: [{ id: "awareness", label: "Awareness" }, { id: "explain", label: "Explain the product" }, { id: "launch", label: "Launch something new" }, { id: "sales", label: "Sales" }],
      metricFor: { awareness: "view-through rate and recall", explain: "completed views", launch: "reach in launch week", sales: "clicks to the shop" },
    },
    barrier: BARRIER,
    keyMessage: { question: "What's the one thing people should remember?", hint: "Pick one or write your own" },
    proofOffer: { question: "What's the proof or offer in the video?" },
    cta: { question: "How should it end?", options: [{ id: "install", label: "Install the app" }, { id: "visit", label: "Visit the site" }, { id: "brand", label: "Brand end card only" }] },
    material: { ...MATERIAL, options: [{ id: "client", label: "We have footage" }, { id: "klingit", label: "Klingit animates it" }, { id: "shoot", label: "We need a shoot" }] },
  },
  web: {
    channels: [],
    fixedChannel: "Web",
    noun: "landing page",
    whyNow: WHY_NOW,
    objective: {
      question: "What should the page achieve?",
      options: [{ id: "signups", label: "Sign-ups" }, { id: "sales", label: "Sales" }, { id: "launch", label: "Launch something new" }, { id: "leads", label: "Leads" }],
      metricFor: { signups: "sign-up conversion rate", sales: "conversion rate", launch: "visits and time on page", leads: "form completions" },
    },
    barrier: BARRIER,
    keyMessage: { question: "What should the headline promise?", hint: "Pick one or write your own" },
    proofOffer: { question: "What proof goes on the page?", hint: "An offer, numbers, reviews" },
    cta: { question: "What's the main button?", options: [{ id: "signup", label: "Sign up" }, { id: "buy", label: "Buy now" }, { id: "download", label: "Download the app" }, { id: "contact", label: "Contact sales" }] },
    material: MATERIAL,
  },
  print: {
    channels: ["Print", "Out-of-home", "In-store"],
    noun: "print and out-of-home",
    whyNow: WHY_NOW,
    objective: {
      question: "What should it achieve?",
      options: [{ id: "awareness", label: "Awareness" }, { id: "store", label: "Footfall to stores" }, { id: "launch", label: "Launch something new" }, { id: "sales", label: "Sales" }],
      metricFor: { awareness: "reach and recall", store: "store visits", launch: "reach in launch week", sales: "sales in the period" },
    },
    barrier: BARRIER,
    keyMessage: { question: "What's the one thing people should remember?", hint: "Pick one or write your own" },
    proofOffer: { question: "What's the offer or proof point?" },
    cta: { question: "What should people do?", options: [{ id: "visit", label: "Visit a store" }, { id: "scan", label: "Scan the QR code" }, { id: "install", label: "Install the app" }] },
    material: MATERIAL,
  },
  email: {
    channels: [],
    fixedChannel: "Email",
    noun: "emails",
    whyNow: WHY_NOW,
    objective: {
      question: "What should the emails do?",
      options: [{ id: "sales", label: "Sales" }, { id: "winback", label: "Win back old users" }, { id: "onboarding", label: "Onboard new users" }, { id: "news", label: "Share news" }],
      metricFor: { sales: "revenue per email", winback: "reactivated users", onboarding: "activation rate", news: "open and click rate" },
    },
    barrier: BARRIER,
    keyMessage: { question: "What's the one thing people should remember?", hint: "Pick one or write your own" },
    proofOffer: { question: "What's the offer or proof point?" },
    cta: { question: "What's the button?", options: [{ id: "shop", label: "Shop now" }, { id: "install", label: "Open the app" }, { id: "learn", label: "Read more" }] },
    material: MATERIAL,
  },
  deck: {
    channels: [],
    fixedChannel: "Deck",
    noun: "deck",
    whyNow: { question: "Why now?", options: [{ id: "pitch", label: "A pitch or meeting" }, { id: "board", label: "A board or investor update" }, { id: "launch", label: "A launch" }, { id: "event", label: "An event" }] },
    objective: {
      question: "What is the deck for?",
      options: [{ id: "pitch", label: "Win a pitch or a deal" }, { id: "investors", label: "Update investors" }, { id: "internal", label: "Align the team" }],
      metricFor: { pitch: "the deal or next meeting", investors: "a clear yes on the plan", internal: "everyone on the same page" },
    },
    barrier: { question: "What do they doubt today?", hint: "The objection the deck has to answer", options: [] },
    keyMessage: { question: "What's the one thing they should leave with?", hint: "Pick one or write your own" },
    proofOffer: { question: "What proof will you show?", hint: "Numbers, cases, quotes" },
    cta: { question: "What should they do after?", options: [{ id: "meeting", label: "Book a follow-up" }, { id: "approve", label: "Approve the plan" }, { id: "sign", label: "Sign" }] },
    material: { ...MATERIAL, options: [{ id: "client", label: "We have the content and data" }, { id: "klingit", label: "Klingit writes and designs it" }] },
  },
  brand: {
    channels: [],
    fixedChannel: "Brand",
    noun: "brand guidelines",
    whyNow: { question: "Why now?", options: [{ id: "rebrand", label: "A rebrand" }, { id: "growth", label: "We're growing fast" }, { id: "agencies", label: "New partners and agencies" }] },
    objective: { question: "What should the guidelines fix?", options: [{ id: "consistency", label: "Consistency everywhere" }, { id: "speed", label: "Faster production" }, { id: "rollout", label: "Roll out a new look" }], metricFor: { consistency: "fewer off-brand assets", speed: "time to first draft", rollout: "every team on the new look" } },
    barrier: { question: "Where does the brand go wrong today?", options: [] },
    keyMessage: { question: "How should the brand feel, in one line?", hint: "Pick one or write your own" },
    proofOffer: { question: "Anything the guidelines must cover?" },
    cta: { question: "Who uses them first?", options: [{ id: "internal", label: "Our own team" }, { id: "agencies", label: "Agencies and partners" }, { id: "everyone", label: "Everyone" }] },
    material: MATERIAL,
  },
  other: {
    channels: CHANNEL_GROUPS.flatMap((g) => g.channels),
    noun: "work",
    whyNow: WHY_NOW,
    objective: ADS_OBJECTIVE,
    barrier: BARRIER,
    keyMessage: { question: "What's the one thing people should remember?", hint: "Pick one or write your own" },
    proofOffer: { question: "What's the offer or proof point?" },
    cta: { question: "What should people do after seeing it?", options: [{ id: "install", label: "Install the app" }, { id: "shop", label: "Shop now" }, { id: "learn", label: "Learn more" }] },
    material: MATERIAL,
  },
};

export const CLOSING = {
  question: "Anything else they should know?",
  options: [
    { id: "avoid", label: "What it must not look like" },
    { id: "competitor", label: "A competitor ad we liked" },
    { id: "legal", label: "Claims legal must check" },
    { id: "approver", label: "Who signs off" },
  ],
  done: "No, that is everything",
};

/** What each closing chip opens: a short follow-up that fills a nice-to-have. */
export const CLOSING_FOLLOW_UP: Record<string, { key: "mustAvoid" | "competitorExamples" | "proofOffer" | "approver"; question: string; hint?: string }> = {
  avoid: { key: "mustAvoid", question: "What must it not look like?", hint: "Styles, words or clichés to stay away from" },
  competitor: { key: "competitorExamples", question: "Which competitor ad did you like?", hint: "Paste a link or describe it, or attach it below" },
  legal: { key: "proofOffer", question: "Which claims does legal need to check?", hint: "Rates, fees, terms per market" },
  approver: { key: "approver", question: "Who signs off, and how many rounds of feedback?", hint: "e.g. Elin Berg, 2 rounds" },
};

export const LANGUAGE_FOR: Record<string, string> = {
  Sweden: "Swedish",
  Norway: "Norwegian",
  Denmark: "Danish",
  Finland: "Finnish",
  Germany: "German",
  "United Kingdom": "English",
  "United States": "English",
  Netherlands: "Dutch",
  France: "French",
  Spain: "Spanish",
  Italy: "Italian",
  Poland: "Polish",
};
