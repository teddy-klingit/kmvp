import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { anthropic, AGENT_MODEL } from "@/lib/ai/client";
import { prisma } from "@/lib/prisma";

type RunAgentTaskArgs<T> = {
  /** Agent.key in the catalog, e.g. "brief_agent" */
  agentKey: string;
  projectId?: string;
  clientId?: string;
  /** Set when a client triggered this run themselves via a self-service agent, rather than an internal pipeline run. */
  requestedByUserId?: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Derives the short human-readable decision line shown in the audit log. */
  summarize?: (data: T) => string;
  /** Grounds the answer in a real web search instead of only the model's parametric knowledge — costs more tokens/latency, use where the answer needs to reflect current reality. */
  webSearch?: boolean;
};

type RunAgentTaskResult<T> = { ok: true; data: T; runId: string } | { ok: false; error: string };

/**
 * Calls Claude for one agent task, logging the attempt as an AgentRun either
 * way — this is what feeds the ops Agents library, agent detail run history,
 * and the decision/audit log with real activity instead of seed data.
 */
export async function runAgentTask<T>({
  agentKey,
  projectId,
  clientId,
  requestedByUserId,
  system,
  prompt,
  schema,
  summarize,
  webSearch,
}: RunAgentTaskArgs<T>): Promise<RunAgentTaskResult<T>> {
  const agent = await prisma.agent.findUnique({ where: { key: agentKey } });
  if (!agent) {
    return { ok: false, error: `Unknown agent key "${agentKey}"` };
  }
  // Kill switch: an Admin set this agent to Disabled, so nothing may run it (no call, no run logged).
  if (agent.status === "DISABLED") {
    return { ok: false, error: `${agent.name} is disabled. An Admin can turn it back on in Agents.` };
  }

  const startedAt = Date.now();

  try {
    const response = await anthropic.messages.parse({
      model: AGENT_MODEL,
      max_tokens: webSearch ? 8192 : 4096,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: zodOutputFormat(schema) },
      ...(webSearch ? { tools: [{ type: "web_search_20260318", name: "web_search", max_uses: 3 }] } : {}),
    });

    if (!response.parsed_output) {
      throw new Error("Claude did not return a parseable structured output.");
    }

    const data = response.parsed_output;

    const run = await prisma.agentRun.create({
      data: {
        agentId: agent.id,
        projectId,
        clientId,
        requestedByUserId,
        input: { prompt },
        output: data as object,
        status: "SUCCESS",
        decision: summarize?.(data) ?? null,
        durationMs: Date.now() - startedAt,
      },
    });

    return { ok: true, data, runId: run.id };
  } catch (err) {
    const message = describeAnthropicError(err);

    await prisma.agentRun.create({
      data: {
        agentId: agent.id,
        projectId,
        clientId,
        requestedByUserId,
        input: { prompt },
        output: { error: message },
        status: "FAILED",
        decision: message,
        durationMs: Date.now() - startedAt,
      },
    });

    return { ok: false, error: message };
  }
}

function describeAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Anthropic API key is missing or invalid. Set ANTHROPIC_API_KEY in .env.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Anthropic API — try again shortly.";
  }
  if (err instanceof Anthropic.NotFoundError) {
    return "Model not found — check the configured model ID.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Could not reach the Anthropic API — check your network connection.";
  }
  if (err instanceof Anthropic.APIError) {
    return `Anthropic API error (${err.status}): ${err.message}`;
  }
  return err instanceof Error ? err.message : "Unknown error calling the agent.";
}
