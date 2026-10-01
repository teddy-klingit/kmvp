import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";

const FeedbackClassificationSchema = z.object({
  priority: z.enum(["High", "Medium", "Low"]).describe("How urgently production should act on this"),
  taskSummary: z
    .string()
    .describe("A short, actionable task for the production team derived from the client's comment, e.g. 'Revise Social_v2 and _v3, increase headline size 20%'"),
});

export type FeedbackClassification = z.infer<typeof FeedbackClassificationSchema>;

export async function classifyFeedback(args: {
  projectId: string;
  clientId: string;
  clientName: string;
  brandSummary: string | null;
  commentBody: string;
}) {
  const system = `You are the Feedback agent at Klingit, a creative agency. Turn a client's free-text comment on delivered creative into a structured, actionable production task with a priority. High = blocks approval or is brand-critical; Medium = should be addressed before final delivery; Low = nice-to-have or purely positive feedback with no required action.`;

  const prompt = `Client: ${args.clientName}
Brand context: ${args.brandSummary ?? "No brand context on file yet."}

Client comment: "${args.commentBody}"

Classify this into a priority and a concrete task for the production team.`;

  return runAgentTask({
    agentKey: "feedback_agent",
    projectId: args.projectId,
    clientId: args.clientId,
    system,
    prompt,
    schema: FeedbackClassificationSchema,
    summarize: (data) => `${data.priority} priority — ${data.taskSummary}`,
  });
}
