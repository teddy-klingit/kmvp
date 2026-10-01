import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";

const EstimateLineItemSchema = z.object({
  deliverableType: z
    .string()
    .describe("Must be copied EXACTLY (same spelling/casing) from one of the price list entries provided below — never invented"),
  complexityTier: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .describe("Must match a tier that actually exists for this deliverableType in the price list below"),
  quantity: z.number().int().min(1).max(50),
  detail: z.string().describe("One line of scope detail specific to this project, e.g. '3 formats for LinkedIn and Instagram'"),
});

const UnresolvedNeedSchema = z.object({
  description: z.string().describe("A deliverable this project genuinely needs that has no matching price list entry"),
  reason: z.string().describe("Why it doesn't match — e.g. no entry exists for this deliverable type, or none of its tiers fit"),
});

const EstimateGenerationSchema = z.object({
  lineItems: z
    .array(EstimateLineItemSchema)
    .max(8)
    .describe("Only deliverables that have a real match in the price list — never guess a cost for something that isn't listed"),
  unresolvedNeeds: z
    .array(UnresolvedNeedSchema)
    .max(5)
    .describe("Deliverables this project needs that aren't priced yet — leave these for a human to price manually, do not estimate a cost"),
  notes: z.string().describe("A short client-facing note explaining the scope, in a friendly but professional tone"),
});

export type EstimateGeneration = z.infer<typeof EstimateGenerationSchema>;

export type PriceListEntry = { deliverableType: string; complexityTier: "LOW" | "MEDIUM" | "HIGH"; creditCost: number };

export async function generateEstimate(args: {
  projectId: string;
  clientId: string;
  clientName: string;
  projectType: string;
  brandSummary: string | null;
  goals: string | null;
  targetAudience: string | null;
  successMetrics: string | null;
  deliverablesNotes: string | null;
  priceList: PriceListEntry[];
}) {
  const typeLabel = PROJECT_TYPE_LABEL[args.projectType] ?? args.projectType;

  const priceListText =
    args.priceList.length > 0
      ? args.priceList.map((p) => `- ${p.deliverableType} — ${p.complexityTier} — ${p.creditCost}c`).join("\n")
      : "(The price list is empty — put everything this project needs into unresolvedNeeds.)";

  const system = `You are the Estimate agent at Klingit, a creative agency that works across ad campaigns, single assets, presentations/decks, motion/video, dev/build requests, and brand work. You do NOT invent your own hours or costs anymore — every line item must be priced using the agency's price list, which is the only source of truth for cost. For each deliverable this project needs, pick the closest matching (deliverable type, complexity tier) pair from the price list EXACTLY as written, and say how many of it is needed. If something this project genuinely needs has no real match in the price list — not even a rough one — do not force a match and do not guess a cost: put it in unresolvedNeeds instead with a short reason, so a human prices it manually. Never fabricate a price list entry that isn't shown to you.`;

  const prompt = `Client: ${args.clientName}
Project type: ${typeLabel}
Brand context: ${args.brandSummary ?? "No brand context on file yet."}

What they need and why: ${args.goals ?? "—"}
Who it's for: ${args.targetAudience ?? "—"}
Success metrics: ${args.successMetrics ?? "—"}
Deliverable notes from client: ${args.deliverablesNotes ?? "None specified — infer a sensible scope from the objective."}

PRICE LIST (deliverable type — complexity tier — credit cost):
${priceListText}

Scope this ${typeLabel} project using ONLY deliverable types and tiers from the price list above. Anything genuinely needed that isn't listed goes in unresolvedNeeds, not a guessed line item. Also write a short note to the client explaining the estimate.`;

  return runAgentTask({
    agentKey: "estimate_agent",
    projectId: args.projectId,
    clientId: args.clientId,
    system,
    prompt,
    schema: EstimateGenerationSchema,
    summarize: (data) =>
      data.unresolvedNeeds.length > 0
        ? `Priced ${data.lineItems.length} line item${data.lineItems.length === 1 ? "" : "s"} — ${data.unresolvedNeeds.length} need${data.unresolvedNeeds.length === 1 ? "s" : ""} manual pricing`
        : `Priced ${data.lineItems.length} line item${data.lineItems.length === 1 ? "" : "s"} from the price list`,
  });
}
