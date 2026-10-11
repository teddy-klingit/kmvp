import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";
import { buildBrandContext } from "@/lib/ai/brand-context";
import type { Agent, BrandOS, Client } from "@/generated/prisma";

const CustomSkillSchema = z.object({
  title: z.string().describe("A short title for what was made"),
  text: z.string().describe("The output itself, ready to use, formatted with line breaks"),
});

/**
 * A client's custom skill (built by Klingit from an agreed spec, src/lib/skills.ts publishCustomSkill): runs the spec
 * against the client's Brand OS and their input. Charged as a skill run like any other.
 */
export async function runCustomSkill(args: { agent: Agent; clientId: string; requestedByUserId: string; client: Pick<Client, "name" | "industry" | "brandSummary">; brandOS: BrandOS | null; input: string }) {
  const system = `You are "${args.agent.name}", a skill Klingit built for ${args.client.name}. Do exactly what this spec says, in the brand's own voice, and nothing else.\n\n${args.agent.description}`;
  return runAgentTask({
    agentKey: args.agent.key,
    clientId: args.clientId,
    requestedByUserId: args.requestedByUserId,
    system,
    prompt: `${buildBrandContext(args.client, args.brandOS)}\n\nINPUT FROM THE CLIENT:\n${args.input}`,
    schema: CustomSkillSchema,
    summarize: (d) => d.title,
  });
}
