import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";
import { buildBrandContext } from "@/lib/ai/brand-context";
import type { Client } from "@/generated/prisma";
import type { BrandForAgents } from "@/lib/brand-rules";

const CarouselSchema = z.object({
  concept: z.string().describe("1-2 sentences: the story the carousel tells, card to card"),
  cards: z.array(z.object({ headline: z.string().describe("The text on the card, short"), body: z.string().describe("One supporting line, or ''") })).min(4).max(6),
  callToAction: z.string().describe("The CTA on the last card"),
  caption: z.string().describe("The caption to post with the carousel"),
  visualDirection: z.string().describe("What every card should look like, in plain words for a designer"),
});
export type Carousel = z.infer<typeof CarouselSchema>;

/** Carousel builder (Phase R): a 4–6 card carousel with a story arc, a CTA on the last card, and a caption. */
export async function generateSelfServeCarousel(args: { clientId: string; requestedByUserId: string; projectId?: string; client: Pick<Client, "name" | "industry" | "brandSummary">; brandOS: BrandForAgents; format: string; idea: string }) {
  return runAgentTask({
    agentKey: "carousel_builder",
    clientId: args.clientId,
    projectId: args.projectId,
    requestedByUserId: args.requestedByUserId,
    system: "You are the Carousel builder at Klingit. Write a carousel that reads as one short story from the first card to the last: a hook, 2–4 cards that build, and a last card with one clear action. Follow every brand rule.",
    prompt: `${buildBrandContext(args.client, args.brandOS)}\n\nFORMAT: ${args.format}\nIDEA: ${args.idea}\n\nWrite the carousel.`,
    schema: CarouselSchema,
    summarize: (d) => `Carousel: ${d.cards[0]?.headline.slice(0, 60) ?? ""}`,
  });
}
