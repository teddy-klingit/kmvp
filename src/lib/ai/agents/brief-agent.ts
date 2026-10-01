import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";

const BriefAnalysisSchema = z.object({
  summary: z.string().describe("A concise 1-2 sentence summary of the brief"),
  gaps: z
    .array(z.string())
    .describe(
      "Specific, actionable gaps or ambiguities in the brief that would block accurate scoping — empty array if the brief is genuinely ready for production. Be a genuinely critical reviewer, not rubber-stamping."
    ),
  qualityScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("0-100 score for how complete and specific this brief is for scoping and production"),
  suggestedReplies: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe(
      "2-4 short, first-person quick replies the client could tap to send their account team right now — phrased as things the CLIENT would say (e.g. 'I'll get you the budget range by Friday', 'We don't have brand assets ready yet', 'That covers everything — please go ahead'). Tailor them to the specific gaps found; always include one that means 'send it as-is, no more info right now'."
    ),
});

export type BriefAnalysis = z.infer<typeof BriefAnalysisSchema>;

export async function analyzeBrief(args: {
  projectId: string;
  clientId: string;
  clientName: string;
  projectType: string;
  brandSummary: string | null;
  briefText: string;
}) {
  const typeLabel = PROJECT_TYPE_LABEL[args.projectType] ?? args.projectType;

  const system = `You are the Brief agent at Klingit, a creative agency that produces marketing and creative work using a mix of human specialists and AI agents. Requests span far more than ad campaigns — a project can be a single asset, a presentation deck, a motion/video piece, a dev/build request, brand guidelines work, or anything else a client asks for. Your job is to review a client's brief before it goes to estimation and production, and flag anything genuinely missing, vague, or contradictory FOR THIS SPECIFIC TYPE OF WORK. What counts as a gap differs by type — a deck needs a slide count and audience, a dev request needs technical scope and platform, a video needs length and format. Be specific and practical — a producer should be able to act on each gap you list. Don't invent problems that aren't there; if the brief is solid, say so and return an empty gaps array.`;

  const prompt = `Client: ${args.clientName}
Project type: ${typeLabel}
Brand context: ${args.brandSummary ?? "No brand context on file yet."}

THE FULL BRIEF (client's own words plus any Q&A so far):
${args.briefText}

Review this brief for a ${typeLabel} project. Summarize it in your own words, list any real gaps that would block accurate scoping for this specific type of work, score its overall readiness from 0-100, and suggest a few quick replies the client could tap to respond.`;

  return runAgentTask({
    agentKey: "brief_agent",
    projectId: args.projectId,
    clientId: args.clientId,
    system,
    prompt,
    schema: BriefAnalysisSchema,
    summarize: (data) =>
      data.gaps.length > 0
        ? `Reviewed brief — ${data.gaps.length} gap${data.gaps.length === 1 ? "" : "s"} flagged, readiness ${data.qualityScore}/100`
        : `Reviewed brief — ready for production (${data.qualityScore}/100)`,
  });
}
