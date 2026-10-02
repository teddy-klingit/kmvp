import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";

const RecommendationSchema = z.object({
  title: z.string().describe("Short, specific action, e.g. 'Scale AR - NO - Brand' or 'Cut spend on 2608 | SE | Awareness'"),
  detail: z.string().describe("1-2 sentences: why, citing the specific real numbers behind the recommendation"),
});

/** Where a takeaway's action can send the client inside Insights (see takeawayHref). */
export const TAKEAWAY_VIEWS = ["performance", "creative", "market", "competitors", "trends", "audience", "seo"] as const;

const TakeawaySchema = z.object({
  title: z.string().describe("The finding in under 8 words, plain language, e.g. 'Stories beat statics almost 3 to 1'"),
  detail: z.string().describe("One sentence citing the exact numbers, names or brands behind it"),
  action: z.object({
    kind: z.enum(["brief", "view"]).describe("brief = the client should start new work about this; view = the client should look at the evidence first"),
    label: z.string().describe("2-4 word button label, e.g. 'Brief more stories', 'Brief a refresh', 'See their ads'"),
    view: z.enum(TAKEAWAY_VIEWS).nullable().describe("For kind=view: which Insights view shows the evidence. Null for kind=brief."),
  }),
});

const PerformanceInsightsSchema = z.object({
  summary: z.string().describe("1-2 sentence read on what's actually happening across the connected ad accounts right now, grounded in the real numbers given"),
  recommendations: z
    .array(RecommendationSchema)
    .min(2)
    .max(5)
    .describe("Concrete actions — scale a specific campaign, cut/investigate an underperformer, shift budget between platforms, double down on a creative format — each grounded in the specific numbers given, not generic advice"),
  takeaways: z
    .array(TakeawaySchema)
    .min(1)
    .max(3)
    .describe("This week's takeaways for the client's Insights overview: the 1-3 most important things, most important first, each with exactly one action. Only use the data given; never invent a number or a trend."),
});

export type Takeaway = z.infer<typeof TakeawaySchema>;

export type PerformanceInsights = z.infer<typeof PerformanceInsightsSchema>;



export async function synthesizePerformanceInsights(args: {
  clientId: string;
  clientName: string;
  platformCampaigns: { platform: string; accountName: string; currency: string; campaignName: string; impressions: number; clicks: number; ctr: number; spend: number }[];
  ownFormatBreakdown: { format: string; ctr: number; assetCount: number }[];
  /** Delivered assets with measured CTR, so takeaways can name specific creative. */
  assets?: { name: string; project: string; format: string; ctr: number }[];
  /** Market signals from the last 7 days (competitor ads, news, performance alerts). */
  marketSignals?: { type: string; title: string; summary: string; publishedAt: Date }[];
}) {
  const system = `You are the Performance agent at Klingit, a creative agency. You're given real, live campaign data pulled directly from the client's connected ad accounts (Meta, LinkedIn, Google Ads — whichever are connected), plus a breakdown of their delivered creative's measured CTR by format. Your job is to read these numbers and tell the client what's actually happening and what to do about it: which campaigns/platforms to scale, which to cut or investigate, which creative formats to double down on. Ground every recommendation in the specific numbers given — cite exact campaign names, CTRs, or spend figures using the currency code given for each account (never assume USD or use a "$" sign) — never give generic advice that doesn't reference the actual data.`;

  const parts = [`Client: ${args.clientName}`, ""];

  if (args.platformCampaigns.length) {
    parts.push("LIVE CAMPAIGN DATA (from connected ad accounts):");
    args.platformCampaigns.forEach((c) =>
      parts.push(`- [${c.platform} · ${c.accountName}] "${c.campaignName}": ${c.impressions} impressions, ${c.clicks} clicks, ${c.ctr}% CTR, ${c.spend} ${c.currency} spent`)
    );
    parts.push("");
  } else {
    parts.push("LIVE CAMPAIGN DATA: no ad accounts connected yet.", "");
  }

  if (args.ownFormatBreakdown.length) {
    parts.push("DELIVERED CREATIVE PERFORMANCE BY FORMAT:");
    args.ownFormatBreakdown.forEach((f) => parts.push(`- ${f.format}: ${f.ctr}% average CTR across ${f.assetCount} asset(s)`));
    parts.push("");
  }

  if (args.assets?.length) {
    parts.push("DELIVERED ASSETS WITH MEASURED CTR:");
    args.assets.forEach((a) => parts.push(`- "${a.name}" (${a.project} · ${a.format}): ${a.ctr}% CTR`));
    parts.push("");
  }

  if (args.marketSignals?.length) {
    parts.push("MARKET SIGNALS, LAST 7 DAYS:");
    args.marketSignals.forEach((m) => parts.push(`- [${m.type} · ${m.publishedAt.toISOString().slice(0, 10)}] ${m.title}: ${m.summary}`));
    parts.push("");
  }

  parts.push("Produce the summary, recommendations and this week's takeaways now.");

  return runAgentTask({
    agentKey: "performance_agent",
    clientId: args.clientId,
    system,
    prompt: parts.join("\n"),
    schema: PerformanceInsightsSchema,
    summarize: (data) => `${data.recommendations.length} recommendation(s), ${data.takeaways.length} takeaway(s)`,
  });
}
