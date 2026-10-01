import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";

const AnswerSchema = z.object({
  answer: z.string().describe("A natural, realistic answer to the question, as you would genuinely give a member of the public researching this — mention specific real brands/companies where relevant, don't hedge or refuse."),
});

/**
 * Asks Claude a real customer-intent question and returns the raw natural
 * answer — the caller checks it deterministically for brand mentions, not
 * the model itself, so the signal is objective rather than self-reported.
 * Grounded in a real web search rather than the model's training-time
 * memory, so this tests "share of voice in a real current answer" rather
 * than "share of model" — closer to what a real claude.ai user researching
 * the category would actually see.
 */
export async function askVisibilityQuestion(args: { clientId: string; question: string }) {
  const system = `You are a helpful, knowledgeable assistant answering a real question from someone researching options in a category. Use web search to ground your answer in current, real information rather than relying on memory alone. Answer naturally and specifically, the way you would to any user — recommend or mention specific real companies/brands where genuinely relevant to a complete answer. Do not mention that this is a test or that you're being evaluated.`;

  return runAgentTask({
    agentKey: "seo_agent",
    clientId: args.clientId,
    system,
    prompt: args.question,
    schema: AnswerSchema,
    summarize: (data) => data.answer.slice(0, 80),
    webSearch: true,
  });
}

const QuestionsSchema = z.object({
  questions: z
    .array(z.string())
    .min(2)
    .max(3)
    .describe("Realistic questions a real prospective customer would type into an AI assistant while researching this category — specific enough to plausibly surface real brand names in the answer, not generic"),
});

/** Generates realistic buyer-intent questions grounded in the client's actual category/competitors, rather than a generic industry template. */
export async function generateVisibilityQuestions(args: { clientId: string; industry: string | null; competitorBrands: string[] }) {
  const system = `You write realistic questions a real prospective customer would ask an AI assistant while researching a purchase decision in this category — the kind of question that would plausibly surface specific brand names in a good answer. Not generic ("what is X") — genuine comparison/recommendation questions.`;
  const prompt = [
    `Industry/category: ${args.industry ?? "Not specified"}`,
    `Known players in this category: ${args.competitorBrands.length ? args.competitorBrands.join(", ") : "unknown"}`,
    "",
    "Produce 2-3 realistic customer questions now.",
  ].join("\n");

  return runAgentTask({
    agentKey: "seo_agent",
    clientId: args.clientId,
    system,
    prompt,
    schema: QuestionsSchema,
    summarize: (data) => `${data.questions.length} question(s) generated`,
  });
}

const RecommendationSchema = z.object({
  title: z.string().describe("Short, specific fix, e.g. 'Add FAQPage structured data' or 'Unblock GPTBot in robots.txt'"),
  detail: z.string().describe("1-2 sentences: why, citing the specific finding behind it"),
});

const SeoInsightsSchema = z.object({
  summary: z.string().describe("1-2 sentence read on the client's SEO/AI-visibility standing versus competitors, grounded in the real findings given"),
  recommendations: z
    .array(RecommendationSchema)
    .min(2)
    .max(6)
    .describe("Concrete, specific fixes — technical SEO gaps, structured data to add, AI-crawler access to unblock, content gaps versus what AI answers actually cited — each grounded in the specific findings given, not generic SEO advice"),
});

export type SeoInsights = z.infer<typeof SeoInsightsSchema>;

export async function synthesizeSeoInsights(args: {
  clientId: string;
  clientName: string;
  ownSite: { domain: string; onPage: unknown; scores: unknown } | { domain: string; error: string };
  competitorSites: ({ brand: string; domain: string; onPage: unknown; scores: unknown } | { brand: string; domain: string; error: string })[];
  visibilityChecks: { question: string; engine: string; answer: string; mentions: { brand: string; mentioned: boolean }[] }[];
}) {
  const system = `You are the SEO / AI Visibility agent at Klingit, a creative agency. You're given real, fetched on-page SEO data (title/meta/headings/structured data), AI-crawler access from robots.txt, PageSpeed scores where available, and real AI-answer visibility tests across multiple engines (Claude, Perplexity) for a client and their tracked competitors. Tell the client where they stand and what to specifically fix — cite the exact findings (missing structured data types, blocked crawlers, which questions did/didn't mention them, and whether results differ by engine) rather than generic SEO advice. If a competitor's site couldn't be reached, note that as a limitation rather than a finding about them.`;

  const parts = [`Client: ${args.clientName}`, "", "OWN SITE:", JSON.stringify(args.ownSite, null, 2), ""];

  if (args.competitorSites.length) {
    parts.push("COMPETITOR SITES:", JSON.stringify(args.competitorSites, null, 2), "");
  }

  if (args.visibilityChecks.length) {
    parts.push("AI VISIBILITY TESTS (real questions asked to real AI engines, checked for brand mentions):");
    args.visibilityChecks.forEach((c) => {
      parts.push(`- Q: "${c.question}" [${c.engine}]`);
      parts.push(`  Mentioned: ${c.mentions.filter((m) => m.mentioned).map((m) => m.brand).join(", ") || "none of the tracked brands"}`);
      parts.push(`  Answer excerpt: "${c.answer.slice(0, 300)}"`);
    });
    parts.push("");
  }

  parts.push("Produce the summary and recommendations now.");

  return runAgentTask({
    agentKey: "seo_agent",
    clientId: args.clientId,
    system,
    prompt: parts.join("\n"),
    schema: SeoInsightsSchema,
    summarize: (data) => `${data.recommendations.length} recommendation(s)`,
  });
}
