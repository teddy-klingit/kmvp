import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";
import { buildBrandContext } from "@/lib/ai/brand-context";
import type { Client, BrandOS } from "@/generated/prisma";

const BriefDraftSchema = z.object({
  title: z.string().describe("A short, specific project title for this brief"),
  objective: z.string().describe("1-2 sentences on what this piece of work needs to achieve"),
  targetAudience: z.string().describe("Who this is for, grounded in the brand's real audience where known"),
  keyMessage: z.string().describe("The single most important thing the audience should take away"),
  toneNotes: z.string().describe("How this should sound, referencing the brand's actual voice attributes and tone rules"),
  deliverables: z.array(z.string()).min(2).max(6).describe("Concrete deliverables, e.g. '3x Instagram Reels, 15-20s'"),
  suggestedChannels: z.array(z.string()).min(1).max(5),
  callToAction: z.string(),
});

export type BriefDraft = z.infer<typeof BriefDraftSchema>;

export async function generateSelfServeBrief(args: {
  clientId: string;
  requestedByUserId: string;
  client: Pick<Client, "name" | "industry" | "brandSummary">;
  brandOS: BrandOS | null;
  idea: string;
  goal: string;
}) {
  const system = `You are the Brief Generator at Klingit, a creative agency. A client is using this tool themselves — without an account manager in the loop — to turn a rough idea into a ready-to-use creative brief they can hand to their own team or straight to Klingit for production. Ground every section in the brand context you're given; don't invent a generic brief that could belong to any company. Be concrete and specific, not vague or filler.`;

  const prompt = `${buildBrandContext(args.client, args.brandOS)}

WHAT THE CLIENT WANTS TO MAKE:
${args.idea}

WHAT THEY'RE TRYING TO ACHIEVE:
${args.goal}

Write a complete creative brief for this.`;

  return runAgentTask({
    agentKey: "brief_generator_agent",
    clientId: args.clientId,
    requestedByUserId: args.requestedByUserId,
    system,
    prompt,
    schema: BriefDraftSchema,
    summarize: (data) => `Generated brief: ${data.title}`,
  });
}
