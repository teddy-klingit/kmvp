import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";

const ReportSchema = z.object({
  takeaways: z
    .array(
      z.object({
        title: z.string().describe("The finding in under 10 words, plain language, e.g. 'Beach hero was the best post of the week'"),
        detail: z.string().describe("One short line with the exact numbers behind it"),
      })
    )
    .min(1)
    .max(3)
    .describe("The 1-3 things worth knowing about this period, most important first. Only from the data given; never invent a number, a trend or a comparison that isn't in the data."),
});

/**
 * The performance agent writing a weekly or monthly report's takeaways (Reports.dc.html). It is told
 * exactly which numbers belong to the period and which are "as of today" (live ad accounts read the last
 * 30 days), so it never presents a 30-day figure as the week's.
 */
export async function synthesizeReportTakeaways(args: {
  clientId: string;
  clientName: string;
  kind: "WEEKLY" | "MONTHLY";
  periodLabel: string;
  postsInPeriod: { title: string; platform: string; contentType: string | null; engagementRate: number | null; impressions: number | null }[];
  sowMinimum: number | null;
  paid: { platform: string; campaignName: string; ctr: number; spend: number; currency: string; clicks: number; impressions: number }[];
  assets: { name: string; project: string; format: string; ctr: number }[];
  signals: { type: string; title: string }[];
}) {
  const system = `You are the Performance agent at Klingit, a creative agency, writing the ${args.kind === "WEEKLY" ? "weekly" : "monthly"} report a client reads first. Give at most 3 takeaways, most important first, each a plain-language title and one short line with the exact numbers. Use only the data given. Paid figures are the connected ad accounts' last 30 days as of today, not just this period: say "last 30 days" when you use them. Cite currencies by their code, never "$".`;
  const parts = [`Client: ${args.clientName}`, `Report: ${args.periodLabel}`, ""];
  parts.push(`POSTS PUBLISHED IN THE PERIOD: ${args.postsInPeriod.length}${args.sowMinimum ? ` (SOW minimum for the period: ${args.sowMinimum})` : " (no SOW minimum set)"}`);
  args.postsInPeriod.forEach((p) => parts.push(`- "${p.title}" (${p.platform}${p.contentType ? `, ${p.contentType}` : ""}): ${p.engagementRate ?? "n/a"}% engagement, ${p.impressions ?? "n/a"} impressions`));
  parts.push("");
  if (args.paid.length) {
    parts.push("PAID CAMPAIGNS, LAST 30 DAYS AS OF TODAY:");
    args.paid.forEach((c) => parts.push(`- [${c.platform}] "${c.campaignName}": ${c.impressions} impressions, ${c.clicks} clicks, ${c.ctr}% CTR, ${c.spend} ${c.currency}`));
    parts.push("");
  }
  if (args.assets.length) {
    parts.push("DELIVERED CREATIVE, MEASURED CTR:");
    args.assets.forEach((a) => parts.push(`- "${a.name}" (${a.project} · ${a.format}): ${a.ctr}% CTR`));
    parts.push("");
  }
  if (args.signals.length) {
    parts.push("MARKET SIGNALS IN THE PERIOD:");
    args.signals.forEach((s) => parts.push(`- [${s.type}] ${s.title}`));
    parts.push("");
  }
  parts.push("Write the takeaways now.");

  return runAgentTask({
    agentKey: "performance_agent",
    clientId: args.clientId,
    system,
    prompt: parts.join("\n"),
    schema: ReportSchema,
    summarize: (d) => `${args.periodLabel}: ${d.takeaways.length} takeaway(s)`,
  });
}
