import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";

const RecommendationSchema = z.object({
  title: z.string().describe("Short, specific action, e.g. 'Scale AR - NO - Brand' or 'Cut spend on 2608 | SE | Awareness'"),
  detail: z.string().describe("1-2 sentences: why, citing the specific real numbers behind the recommendation"),
});

const PerformanceInsightsSchema = z.object({
  summary: z.string().describe("1-2 sentence read on what's actually happening across the connected ad accounts right now, grounded in the real numbers given"),
  recommendations: z
    .array(RecommendationSchema)
    .min(2)
    .max(5)
    .describe("Concrete actions — scale a specific campaign, cut/investigate an underperformer, shift budget between platforms, double down on a creative format — each grounded in the specific numbers given, not generic advice"),
});

export type PerformanceInsights = z.infer<typeof PerformanceInsightsSchema>;

export async function synthesizePerformanceInsights(args: {
  clientId: string;
  clientName: string;
  platformCampaigns: { platform: string; accountName: string; currency: string; campaignName: string; impressions: number; clicks: number; ctr: number; spend: number }[];
  ownFormatBreakdown: { format: string; ctr: number; assetCount: number }[];
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

  parts.push("Produce the summary and recommendations now.");

  return runAgentTask({
    agentKey: "performance_agent",
    clientId: args.clientId,
    system,
    prompt: parts.join("\n"),
    schema: PerformanceInsightsSchema,
    summarize: (data) => `${data.recommendations.length} recommendation(s)`,
  });
}
