import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";

/**
 * The Performance agent (Insights v2): structured items, never paragraphs on the page. Each takeaway and each
 * "What to do" item is one short line, one number and one action; the longer reasoning lives in `why`, shown
 * behind "Why?". Numbers must come from the data given (src/lib/insights/number-guard.ts drops any that don't).
 */

/** Where a takeaway's action can send the client inside Insights (see takeawayHref). */
export const TAKEAWAY_VIEWS = ["performance", "creative", "market", "competitors", "trends", "audience", "seo"] as const;
export const TAKEAWAY_TAGS = ["Performance", "Creative", "Fatigue", "Spend", "Market", "Audience"] as const;

const CompareSchema = z.object({
  label: z.string().describe("2–4 words, e.g. 'Story 9:16', 'Live Meta ads', 'Trailing avg'"),
  value: z.number().describe("The number itself, copied from the data given (a CTR as 6.1, money as 3822)"),
  display: z.string().describe("How to show it, e.g. '6.1%', 'SEK 3,822'"),
});

const TakeawaySchema = z.object({
  tag: z.enum(TAKEAWAY_TAGS),
  metric: z.string().describe("The one big number, e.g. '0.08%', '2.9×', '−44%'. Only a number from the data, or a ratio or change between two of them."),
  headline: z.string().describe("The finding in at most 6 words, e.g. 'Stories beat statics'"),
  compare: z.array(CompareSchema).min(2).max(3).describe("The 2–3 numbers behind it, for its mini chart, most important first. Copied from the data given."),
  action: z.object({
    kind: z.enum(["brief", "view"]).describe("brief = start new work about this; view = look at the evidence first"),
    label: z.string().describe("2–4 word button label, e.g. 'Brief more stories', 'See campaigns'"),
    view: z.enum(TAKEAWAY_VIEWS).nullable().describe("For kind=view: which Insights view shows the evidence. Null for kind=brief."),
  }),
  why: z.string().describe("2–4 sentences of reasoning citing the exact numbers. Shown only behind 'Why?'."),
});

const ActionSchema = z.object({
  headline: z.string().describe("What to do, at most 8 words, e.g. 'Put Story 9:16 creative into the NO campaign'"),
  chip: z.string().describe("The one number behind it, e.g. '6.1% vs 0.09%', 'SEK 18 per click'. From the data given."),
  why: z.string().describe("2–3 sentences of reasoning with the numbers. Shown only behind 'Why?'."),
  brief: z.string().describe("One line a creative team could start from, e.g. 'Story 9:16 versions of the NO awareness ads'"),
});

const PerformanceInsightsSchema = z.object({
  summary: z.string().describe("One sentence on what's happening across the ad accounts right now."),
  takeaways: z.array(TakeawaySchema).min(1).max(3).describe("This week's 1–3 most important findings, most important first."),
  actions: z.array(ActionSchema).min(1).max(3).describe("'What to do': 1–3 concrete actions, most valuable first."),
});

export type Takeaway = z.infer<typeof TakeawaySchema>;
export type PerformanceAction = z.infer<typeof ActionSchema>;
export type PerformanceInsights = z.infer<typeof PerformanceInsightsSchema>;

export type CampaignFacts = {
  platform: string;
  accountName: string;
  currency: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  /** From the daily data: CTR over the last 7 days and the 23 days before. */
  ctrLast7?: number | null;
  ctrTrailing?: number | null;
};

export function performancePrompt(args: {
  clientName: string;
  platformCampaigns: CampaignFacts[];
  ownFormatBreakdown: { format: string; ctr: number; assetCount: number }[];
  assets?: { name: string; project: string; format: string; ctr: number }[];
  marketSignals?: { type: string; title: string; summary: string; publishedAt: Date }[];
}) {
  const parts = [`Client: ${args.clientName}`, ""];
  if (args.platformCampaigns.length) {
    parts.push("LIVE CAMPAIGNS, LAST 30 DAYS (from the connected ad accounts):");
    args.platformCampaigns.forEach((c) =>
      parts.push(
        `- [${c.platform} · ${c.accountName}] "${c.campaignName}": ${c.impressions} impressions, ${c.clicks} clicks, ${c.ctr}% CTR, ${c.spend} ${c.currency} spent` +
          (c.ctrLast7 != null && c.ctrTrailing != null ? `; CTR last 7 days ${c.ctrLast7}% vs ${c.ctrTrailing}% the 23 days before` : "")
      )
    );
    parts.push("");
  } else {
    parts.push("LIVE CAMPAIGNS: no ad accounts connected yet.", "");
  }
  if (args.ownFormatBreakdown.length) {
    parts.push("DELIVERED CREATIVE, AVERAGE CTR BY FORMAT:");
    args.ownFormatBreakdown.forEach((f) => parts.push(`- ${f.format}: ${f.ctr}% across ${f.assetCount} asset(s)`));
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
  parts.push("Produce the summary, this week's takeaways and what to do now.");
  return parts.join("\n");
}

export async function synthesizePerformanceInsights(args: { clientId: string; prompt: string }) {
  const system = `You are the Performance agent at Klingit, a creative agency. You read the client's real ad data and delivered creative and say what's happening and what to do. Write for a busy client: every item is one short line, one number and one action; put the reasoning in "why". Every number you use must come from the data given (or be a ratio or a change between two of them). Use the currency code given (never "$"). Never invent a number, a trend or a campaign.`;
  return runAgentTask({
    agentKey: "performance_agent",
    clientId: args.clientId,
    system,
    prompt: args.prompt,
    schema: PerformanceInsightsSchema,
    summarize: (data) => `${data.takeaways.length} takeaway(s), ${data.actions.length} action(s)`,
  });
}
