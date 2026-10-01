import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { attachGeneratedImage } from "@/lib/ai/agents/self-serve/attach-image";
import type { Client, BrandOS } from "@/generated/prisma";

const ImageGenSchema = z.object({
  concept: z.string().describe("1-2 sentences describing what the image shows and why it fits the brief"),
  imagePrompt: z
    .string()
    .describe(
      "A single, detailed, ready-to-paste prompt for an image or illustration generation tool — specific about subject, style, lighting, color, and composition, written using the brand's actual imagery/illustration style. No text or typography should appear in the image unless the idea explicitly asks for it."
    ),
  styleTags: z.array(z.string()).min(3).max(8).describe("Short style keywords, e.g. 'minimal', 'high-contrast', 'editorial photography'"),
  negativePrompt: z.string().describe("What to explicitly avoid in the generated image, to stay on-brand"),
  aspectRatioSuggestion: z.string().describe("e.g. '1:1 for feed', '9:16 for Stories/Reels', '16:9 for a blog header'"),
});

export type ImageGen = z.infer<typeof ImageGenSchema>;

export async function generateSelfServeImage(args: {
  clientId: string;
  requestedByUserId: string;
  client: Pick<Client, "name" | "industry" | "brandSummary">;
  brandOS: BrandOS | null;
  idea: string;
}) {
  const system = `You are the Image Gen agent at Klingit, a creative agency. A client is using you directly to generate a standalone on-brand image or illustration — not an ad, no headline or CTA baked in, just a genuinely on-brand visual for whatever they need it for (a blog header, a presentation, a general illustration, an icon-style graphic, background art). Ground the imagery style, color palette, and composition in the brand context you're given rather than defaulting to generic stock-photo aesthetics.`;

  const prompt = `${buildBrandContext(args.client, args.brandOS)}

IDEA: ${args.idea}

Produce an image for this.`;

  const result = await runAgentTask({
    agentKey: "image_gen_agent",
    clientId: args.clientId,
    requestedByUserId: args.requestedByUserId,
    system,
    prompt,
    schema: ImageGenSchema,
    summarize: (data) => `Generated image: ${data.concept.slice(0, 60)}`,
  });

  return attachGeneratedImage(result);
}
