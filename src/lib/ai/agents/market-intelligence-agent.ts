import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";

const IdeaSchema = z.object({
  title: z.string().describe("Short punchy idea name, e.g. 'Checkout-moment story ads'"),
  detail: z.string().describe("1-2 sentences: the concrete creative/campaign idea, and why it's timely given the signals"),
});

const SuggestedCompetitorSchema = z.object({
  name: z.string().describe("The brand/company name, as it should be searched in ad libraries"),
  evidence: z.string().describe("Why this looks like a relevant competitor — cite the specific headline or signal it came from"),
});

const MarketIntelligenceSchema = z.object({
  summary: z.string().describe("1-2 sentence synthesis of what's happening in this category right now, grounded in the actual signals given"),
  assumptions: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe("Inferred takeaways about competitor strategy or market conditions — reasoned from the signals, not generic industry platitudes"),
  ideas: z
    .array(IdeaSchema)
    .min(2)
    .max(4)
    .describe("Concrete creative/campaign ideas for this specific client, connected to what their own top-performing formats already are where relevant"),
  suggestedCompetitors: z
    .array(SuggestedCompetitorSchema)
    .max(3)
    .describe(
      "Brands mentioned in the news headlines that look like genuine competitors but are NOT already in the known competitors list — empty array if none found. Never suggest a brand already being tracked, and never invent a brand not actually named in the headlines."
    ),
});

export type MarketIntelligenceAnalysis = z.infer<typeof MarketIntelligenceSchema>;

export async function synthesizeMarketIntelligence(args: {
  clientId: string;
  clientName: string;
  industry: string | null;
  competitorBrands: string[];
  newsHeadlines: { title: string; source: string | null }[];
  competitorAds: { brand: string; platform: "Meta" | "LinkedIn"; bodyText: string | null }[];
  ownTopFormat: { format: string; platform: string; ctr: number } | null;
}) {
  const system = `You are the Market Intelligence agent at Klingit, a creative agency. You're given real, current signals about a client's competitive category — recent news headlines, live competitor ad activity pulled from Meta's and LinkedIn's Ad Libraries, and the client's own best-performing creative formats. Your job is to read these signals and produce a short synthesis: what's actually happening, what you can reasonably infer about competitor strategy, 2-4 concrete creative ideas worth briefing next, and any brands mentioned in the news that look like competitors but aren't already tracked. Ground every claim in the specific signals given — never invent data points, and don't pad with generic industry advice that could apply to any client.`;

  const parts = [
    `Client: ${args.clientName}`,
    `Industry: ${args.industry ?? "Not specified"}`,
    `Known competitors: ${args.competitorBrands.length ? args.competitorBrands.join(", ") : "None on file"}`,
    "",
  ];

  if (args.newsHeadlines.length) {
    parts.push("RECENT INDUSTRY NEWS:");
    args.newsHeadlines.forEach((h) => parts.push(`- "${h.title}"${h.source ? ` (${h.source})` : ""}`));
    parts.push("");
  } else {
    parts.push("RECENT INDUSTRY NEWS: none available right now.", "");
  }

  if (args.competitorAds.length) {
    parts.push("LIVE COMPETITOR ADS (from Meta and LinkedIn Ad Libraries):");
    args.competitorAds.forEach((a) => parts.push(`- ${a.brand} (${a.platform}): "${a.bodyText ?? "(no text preview)"}"`));
    parts.push("");
  } else {
    parts.push("LIVE COMPETITOR ADS: not available yet (Ad Library access pending).", "");
  }

  if (args.ownTopFormat) {
    parts.push(
      `THE CLIENT'S OWN BEST-PERFORMING FORMAT: ${args.ownTopFormat.format} on ${args.ownTopFormat.platform} at ${args.ownTopFormat.ctr}% CTR — use this as a hook for ideas where it makes sense.`
    );
  }

  parts.push("", "Produce the summary, assumptions, ideas, and any suggested competitors now.");

  return runAgentTask({
    agentKey: "market_intel_agent",
    clientId: args.clientId,
    system,
    prompt: parts.join("\n"),
    schema: MarketIntelligenceSchema,
    summarize: (data) => `${data.assumptions.length} assumption(s), ${data.ideas.length} idea(s), ${data.suggestedCompetitors.length} suggested competitor(s)`,
  });
}

const AnswerSchema = z.object({
  answer: z.string().describe("Direct 2-4 sentence answer, grounded only in the signals given. If the signals don't cover it, say so instead of guessing."),
});

export async function answerMarketIntelligenceQuestion(args: {
  clientId: string;
  clientName: string;
  industry: string | null;
  competitorBrands: string[];
  question: string;
  recentSignals: { title: string; summary: string; type: string }[];
  ownTopFormat: { format: string; platform: string; ctr: number } | null;
  liveCampaigns?: { platform: string; campaignName: string; ctr: number; impressions: number; spend: number; currency: string }[];
  seoSummary?: string | null;
}) {
  const system = `You are the Market Intelligence agent at Klingit, a creative agency. A client is asking you a specific, ad-hoc question — it could be about their competitive landscape, their own live ad performance, or their SEO/AI-search visibility standing. Answer directly in 2-4 sentences, grounded only in the specific signals given below — never invent data points, use the currency code given for any spend figures (never assume USD or use a "$" sign), and explicitly say when you don't have enough real signal to answer confidently rather than speculating as fact.`;

  const parts = [
    `Client: ${args.clientName}`,
    `Industry: ${args.industry ?? "Not specified"}`,
    `Known competitors: ${args.competitorBrands.length ? args.competitorBrands.join(", ") : "None on file"}`,
    "",
  ];

  if (args.recentSignals.length) {
    parts.push("RECENT SIGNALS ON FILE:");
    args.recentSignals.forEach((s) => parts.push(`- [${s.type}] ${s.title} — ${s.summary}`));
    parts.push("");
  } else {
    parts.push("RECENT SIGNALS ON FILE: none yet.", "");
  }

  if (args.ownTopFormat) {
    parts.push(`THE CLIENT'S OWN BEST-PERFORMING FORMAT: ${args.ownTopFormat.format} on ${args.ownTopFormat.platform} at ${args.ownTopFormat.ctr}% CTR.`, "");
  }

  if (args.liveCampaigns?.length) {
    parts.push("LIVE AD CAMPAIGNS (from connected ad accounts):");
    args.liveCampaigns.forEach((c) => parts.push(`- [${c.platform}] "${c.campaignName}": ${c.ctr}% CTR, ${c.impressions} impressions, ${c.spend} ${c.currency} spent`));
    parts.push("");
  }

  if (args.seoSummary) {
    parts.push(`SEO / AI VISIBILITY STANDING: ${args.seoSummary}`, "");
  }

  parts.push(`QUESTION: ${args.question}`);

  return runAgentTask({
    agentKey: "market_intel_agent",
    clientId: args.clientId,
    system,
    prompt: parts.join("\n"),
    schema: AnswerSchema,
    summarize: (data) => data.answer.slice(0, 80),
  });
}

const CompetitorProfileSchema = z.object({
  profiles: z.array(
    z.object({
      brand: z.string(),
      positioning: z.string().describe("1-2 sentence read on this competitor's current angle/strategy, grounded in their actual ad copy and volume"),
      activityLevel: z.enum(["High", "Medium", "Low"]).describe("Relative to the other tracked competitors, based on ad volume and recent new-ad activity"),
      themes: z
        .array(z.object({ theme: z.string().describe("Short label, e.g. 'Trust & compliance'"), evidence: z.string().describe("The specific ad text or signal this theme is drawn from") }))
        .min(1)
        .max(3),
    })
  ),
});

/** One profile per brand — reads real ad samples/volume instead of just re-listing ads. */
export async function synthesizeCompetitorProfiles(args: {
  clientId: string;
  competitorBrands: string[];
  adsByBrand: { brand: string; platform: "Meta" | "LinkedIn"; bodyText: string | null; totalAds: number | null }[];
  recentSignals: { title: string; summary: string }[];
}) {
  const system = `You are the Market Intelligence agent at Klingit, a creative agency. You're given real ad samples and volume data for a client's tracked competitors, pulled from Meta's and LinkedIn's Ad Libraries. For EACH competitor brand listed, produce a short positioning read, an activity level relative to the other competitors, and 1-3 messaging themes each backed by a specific piece of evidence from the data given. Ground everything in the actual data — never invent ad copy or claims a brand didn't make. If a brand has no ad data available, say so plainly in the positioning field rather than guessing at their strategy.`;

  const parts = [`Tracked competitors: ${args.competitorBrands.join(", ")}`, ""];

  if (args.adsByBrand.length) {
    parts.push("AD DATA BY BRAND:");
    for (const brand of args.competitorBrands) {
      const rows = args.adsByBrand.filter((a) => a.brand === brand);
      if (rows.length === 0) {
        parts.push(`- ${brand}: no ad data available.`);
        continue;
      }
      rows.forEach((r) => {
        const volume = r.totalAds !== null ? ` (${r.totalAds} total live ads on ${r.platform})` : "";
        parts.push(`- ${brand} [${r.platform}]${volume}: "${r.bodyText ?? "(no text preview)"}"`);
      });
    }
    parts.push("");
  }

  if (args.recentSignals.length) {
    parts.push("RECENT SIGNALS:");
    args.recentSignals.forEach((s) => parts.push(`- ${s.title} — ${s.summary}`));
    parts.push("");
  }

  parts.push("Produce one profile per tracked competitor now.");

  return runAgentTask({
    agentKey: "market_intel_agent",
    clientId: args.clientId,
    system,
    prompt: parts.join("\n"),
    schema: CompetitorProfileSchema,
    summarize: (data) => `${data.profiles.length} competitor profile(s)`,
  });
}

const TrendBriefSchema = z.object({
  takeaway: z.string().describe("1-2 sentence synthesis of what's actually shaping this category right now"),
  themes: z
    .array(z.object({ theme: z.string().describe("Short label, e.g. 'Regulatory pressure on disclosure'"), articleTitles: z.array(z.string()).min(1).max(4) }))
    .min(2)
    .max(4)
    .describe("Recurring themes across the headlines given, each backed by the specific article titles it's drawn from"),
});

/** Groups raw headlines into themes with a takeaway, instead of a flat article list. */
export async function synthesizeTrendBrief(args: {
  clientId: string;
  clientName: string;
  industry: string | null;
  newsHeadlines: { title: string; source: string | null }[];
}) {
  const system = `You are the Market Intelligence agent at Klingit, a creative agency. You're given recent news headlines about a client's category. Group them into 2-4 recurring themes (not just a category re-summary) and write a 1-2 sentence takeaway on what's actually shaping the category right now. Every theme must cite the specific article title(s) it's drawn from — never invent a headline or attribute a theme to an article that doesn't support it.`;

  const parts = [
    `Client: ${args.clientName}`,
    `Industry: ${args.industry ?? "Not specified"}`,
    "",
    "RECENT HEADLINES:",
    ...args.newsHeadlines.map((h) => `- "${h.title}"${h.source ? ` (${h.source})` : ""}`),
    "",
    "Produce the takeaway and themes now.",
  ];

  return runAgentTask({
    agentKey: "market_intel_agent",
    clientId: args.clientId,
    system,
    prompt: parts.join("\n"),
    schema: TrendBriefSchema,
    summarize: (data) => `${data.themes.length} theme(s)`,
  });
}

const BenchmarkSchema = z.object({
  estimatedLow: z.number().describe("Estimated low end of the category CTR range, as a percentage number e.g. 3.2"),
  estimatedHigh: z.number().describe("Estimated high end of the category CTR range, as a percentage number e.g. 6.8"),
  rationale: z.string().describe("1-2 sentences on how this estimate was derived — must read as a reasoned estimate, not a claim of measured data"),
});

/** An explicit AI ESTIMATE of category performance — never presented as measured data. */
export async function estimateCategoryBenchmark(args: {
  clientId: string;
  industry: string | null;
  competitorBrands: string[];
  competitorContext: string[];
  ownFormat: string;
  ownCtr: number;
}) {
  const system = `You are the Market Intelligence agent at Klingit, a creative agency. You do not have access to real third-party CTR benchmark data. Given the client's own measured performance and whatever context is available about their competitors' activity, produce a REASONED ESTIMATE of the likely category CTR range for a comparable format — grounded in general knowledge of digital ad performance for this category, and clearly caveat in the rationale that this is an estimate, not measured data. Never claim this is sourced from real benchmark data.`;

  const parts = [
    `Industry: ${args.industry ?? "Not specified"}`,
    `Client's own measured performance: ${args.ownFormat} at ${args.ownCtr}% CTR`,
    `Tracked competitors: ${args.competitorBrands.length ? args.competitorBrands.join(", ") : "None on file"}`,
    ...(args.competitorContext.length ? ["", "Competitor context:", ...args.competitorContext.map((c) => `- ${c}`)] : []),
    "",
    "Produce the estimated range and rationale now.",
  ];

  return runAgentTask({
    agentKey: "market_intel_agent",
    clientId: args.clientId,
    system,
    prompt: parts.join("\n"),
    schema: BenchmarkSchema,
    summarize: (data) => `Est. ${data.estimatedLow}-${data.estimatedHigh}% CTR`,
  });
}
