import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";

/** Each section's editor format, so a draft opens straight in the standard textarea. */
const FORMAT: Record<string, string> = {
  "our-brand": "2-3 plain sentences.",
  vision: "1-2 sentences.",
  mission: "1-2 sentences.",
  "core-values": "3-5 lines, each 'Title | one-sentence meaning'.",
  usps: "3-5 lines, one reason per line.",
  "market-position": "2-4 sentences naming the real competitors where known.",
  "target-audience": "2-3 lines, each 'Name | age range | one-sentence description | trait, trait, trait'.",
  "services-products": "2-3 sentences naming the actual products/services.",
};

const DraftSchema = z.object({
  drafts: z.array(
    z.object({
      section: z.string().describe("The section slug, exactly as given"),
      content: z.string().describe("The draft, in that section's format"),
      basis: z.string().describe("In under 15 words, what this draft is based on, e.g. 'klarna.com and your brand summary'"),
    })
  ),
});

/**
 * The Brand OS agent drafting Brand IQ platform sections for the client to review. Grounded in what we
 * actually have: the brand summary, the sections already written, the client's website (via web search) and
 * the titles of linked sources (their contents are never fetched). It must say what each draft is based on.
 */
export async function draftBrandSections(args: {
  clientId: string;
  clientName: string;
  industry: string | null;
  website: string | null;
  written: { label: string; text: string }[];
  sources: string;
  sections: { slug: string; label: string; prompt: string }[];
}) {
  const system = `You are the Brand OS agent at Klingit, a creative agency. Draft the requested sections of a client's brand & message platform so the client can review and edit them. Use only what you can verify: the facts given, the client's own website (search it), and well-known public facts about the brand. Never invent numbers, awards or claims. Keep the client's voice plain and specific. These are drafts: the client decides what is saved.`;
  const parts = [
    `Brand: ${args.clientName}`,
    `Industry: ${args.industry ?? "not given"}`,
    `Website: ${args.website ?? "not given"}`,
    "",
    "ALREADY WRITTEN (stay consistent with it):",
    ...(args.written.length ? args.written.map((w) => `- ${w.label}: ${w.text}`) : ["- Nothing yet."]),
    "",
    args.sources || "LINKED SOURCES: none.",
    "",
    "DRAFT THESE SECTIONS:",
    ...args.sections.map((s) => `- ${s.slug} (${s.label}): ${s.prompt} Format: ${FORMAT[s.slug] ?? "1-3 sentences."}`),
  ];
  return runAgentTask({
    agentKey: "brand_os",
    clientId: args.clientId,
    system,
    prompt: parts.join("\n"),
    schema: DraftSchema,
    webSearch: Boolean(args.website),
    summarize: (d) => `Drafted ${d.drafts.length} Brand IQ section(s) for review`,
  });
}
