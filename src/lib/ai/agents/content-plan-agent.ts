import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";

const SuggestionSchema = z.object({
  title: z.string().describe("Short, specific action, e.g. 'Shift 2 posts/week from Instagram to TikTok'"),
  rationale: z.string().describe("1-2 sentences citing the specific real numbers behind the suggestion — performance and, where relevant, business outcome trend"),
  platform: z.string().nullable().describe("The platform this suggestion targets, if it's platform-specific — null for a cross-platform suggestion"),
  suggestedVolumeChange: z.number().nullable().describe("Signed change to weekly volume for `platform`, e.g. 2 or -1 — null if this isn't a volume change (e.g. a content-type shift)"),
  sourceCadence: z
    .enum(["Weekly trend scan", "Monthly strategy recommendation"])
    .describe("'Weekly trend scan' for a fast-moving, timely opportunity; 'Monthly strategy recommendation' for a structural plan change grounded in a longer performance trend"),
});

const ContentPlanSuggestionsSchema = z.object({
  suggestions: z
    .array(SuggestionSchema)
    .min(1)
    .max(4)
    .describe("Concrete, grounded adjustments to the content plan — never generic advice, always tied to the specific numbers given"),
});

export type ContentPlanSuggestions = z.infer<typeof ContentPlanSuggestionsSchema>;

export async function generateContentPlanSuggestions(args: {
  clientId: string;
  clientName: string;
  planTargets: { platform: string; weeklyVolume: number }[];
  recentPosts: { platform: string; contentType: string | null; engagementRate: number | null; videoViews: number | null; impressions: number | null }[];
  followerTrend: { platform: string; followerCount: number; capturedAt: string }[];
  businessOutcomes: { periodStart: string; periodEnd: string; revenue: number | null; leadsGenerated: number | null }[];
}) {
  const system = `You are the Content Plan agent at Klingit, a creative agency. You're given a client's current content plan (weekly volume target per platform), real recent post performance, follower growth over time, and — where available — the client's own business outcomes (revenue/leads, not Klingit's billing). Your job is to propose specific, grounded adjustments to the plan: shift volume toward what's working, flag what isn't, or suggest a content-type change. Every suggestion must cite the actual numbers given. Never suggest a change with no supporting data. These are proposals for a human to approve or reject — never claim a change has been made.`;

  const parts = [`Client: ${args.clientName}`, ""];

  parts.push("CURRENT PLAN TARGETS (weekly volume per platform):");
  if (args.planTargets.length) {
    args.planTargets.forEach((t) => parts.push(`- ${t.platform}: ${t.weeklyVolume} posts/week`));
  } else {
    parts.push("- No plan targets set yet.");
  }
  parts.push("");

  parts.push("RECENT POST PERFORMANCE:");
  if (args.recentPosts.length) {
    args.recentPosts.forEach((p) =>
      parts.push(
        `- [${p.platform}${p.contentType ? ` · ${p.contentType}` : ""}] ${p.impressions ?? "?"} impressions, ${p.engagementRate ?? "?"}% engagement rate${p.videoViews ? `, ${p.videoViews} video views` : ""}`
      )
    );
  } else {
    parts.push("- No published posts with performance data yet.");
  }
  parts.push("");

  parts.push("FOLLOWER TREND:");
  if (args.followerTrend.length) {
    args.followerTrend.forEach((f) => parts.push(`- ${f.platform}: ${f.followerCount} followers as of ${f.capturedAt}`));
  } else {
    parts.push("- No follower snapshots recorded yet.");
  }
  parts.push("");

  if (args.businessOutcomes.length) {
    parts.push("BUSINESS OUTCOMES (client's own revenue/leads, manually reported):");
    args.businessOutcomes.forEach((o) =>
      parts.push(`- ${o.periodStart} to ${o.periodEnd}: ${o.revenue !== null ? `revenue ${o.revenue}` : "revenue n/a"}, ${o.leadsGenerated !== null ? `${o.leadsGenerated} leads` : "leads n/a"}`)
    );
    parts.push("");
  }

  parts.push("Propose the plan adjustments now.");

  return runAgentTask({
    agentKey: "content_plan_agent",
    clientId: args.clientId,
    system,
    prompt: parts.join("\n"),
    schema: ContentPlanSuggestionsSchema,
    summarize: (data) => `${data.suggestions.length} suggestion(s)`,
  });
}
