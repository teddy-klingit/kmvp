import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";

const EstimateLineItemSchema = z.object({
  itemKey: z.string().describe("The [key] of one price list item, copied EXACTLY from the list below — never invented"),
  quantity: z.number().int().min(1).max(200).describe("How many units, in the item's unit (per post, per slide, per page…)"),
  detail: z.string().describe("One line of scope detail specific to this project, e.g. '3 posts for LinkedIn and Instagram'"),
});

const UnresolvedNeedSchema = z.object({
  description: z.string().describe("A deliverable this project genuinely needs that has no matching price list item"),
  reason: z.string().describe("Why it doesn't match, e.g. no item for video production"),
});

const EstimateGenerationSchema = z.object({
  lineItems: z
    .array(EstimateLineItemSchema)
    .max(10)
    .describe("Only deliverables with a real match on the price list — never guess a number for something that isn't listed"),
  unresolvedNeeds: z
    .array(UnresolvedNeedSchema)
    .max(6)
    .describe("Deliverables this project needs that aren't on the list: a PM quotes them. Never estimate a number"),
  notes: z.string().describe("A short client-facing note explaining the scope, in a friendly but professional tone"),
});

export type EstimateGeneration = z.infer<typeof EstimateGenerationSchema>;

export type PriceListEntry = { key: string; name: string; category: string | null; unit: string | null; credits: number | null; status: string };

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
  /** From brandSourcesForAgents(): titles + links only. */
  linkedSources?: string;
  priceList: PriceListEntry[];
}) {
  const typeLabel = PROJECT_TYPE_LABEL[args.projectType] ?? args.projectType;

  const priceListText =
    args.priceList.length > 0
      ? args.priceList.map((p) => `- [${p.key}] ${p.name} (${p.category ?? "Other"}) — ${p.unit ?? "per item"} — ${p.status === "quote" ? "PM quotes" : `${p.credits} credits${p.status === "estimate" ? ", PM confirms" : ""}`}`).join("\n")
      : "(The price list is empty — put everything this project needs into unresolvedNeeds.)";

  const system = `You are the Estimate agent at Klingit, a creative agency that works across ad campaigns, single assets, presentations/decks, motion/video, dev/build requests, and brand work. You do NOT invent your own hours or costs anymore — every line item must be priced using the agency's price list, which is the only source of truth for cost. For each deliverable this project needs, pick the matching price list item by its [key] EXACTLY as written, and say how many units are needed in that item's unit. Credits are fixed per item: never adjust them. If something this project genuinely needs has no real match in the price list — not even a rough one — do not force a match and do not guess a cost: put it in unresolvedNeeds instead with a short reason, so a human prices it manually. Never fabricate a price list entry that isn't shown to you.`;

  const prompt = `Client: ${args.clientName}
Project type: ${typeLabel}
Brand context: ${args.brandSummary ?? "No brand context on file yet."}
${args.linkedSources ? `${args.linkedSources}\n` : ""}
What they need and why: ${args.goals ?? "—"}
Who it's for: ${args.targetAudience ?? "—"}
Success metrics: ${args.successMetrics ?? "—"}
Deliverable notes from client: ${args.deliverablesNotes ?? "None specified — infer a sensible scope from the objective."}

PRICE LIST ([key] item (category) — unit — credits):
${priceListText}

Scope this ${typeLabel} project using ONLY items from the price list above, by their [key]. Project management time is added separately: don't add it. Anything genuinely needed that isn't listed goes in unresolvedNeeds, not a guessed line item. Also write a short note to the client explaining the estimate.`;

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
