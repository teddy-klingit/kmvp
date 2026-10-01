import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { attachGeneratedImage } from "@/lib/ai/agents/self-serve/attach-image";
import type { Client, BrandOS } from "@/generated/prisma";

const AdConceptSchema = z.object({
  concept: z.string().describe("1-2 sentences describing the creative concept"),
  headline: z.string().describe("The exact headline text — this will be rendered directly onto the ad image, not just written as copy"),
  bodyCopy: z.string().describe("Short supporting line, only if the format has room for it — this also renders onto the image"),
  callToAction: z.string().describe("The exact CTA button text — this will be rendered directly onto the ad image, e.g. 'Apply now', 'See open roles'"),
  caption: z.string().describe("The social caption to post ALONGSIDE the ad image when it's published — not text that appears on the image itself"),
  visualDirection: z.string().describe("What the background visual should show — composition, subject, mood — in plain language for a designer"),
  imagePrompt: z
    .string()
    .describe(
      "A single, detailed, ready-to-paste prompt for an image-generation tool that produces a FINISHED AD, not a plain photo — it must explicitly instruct the model to render the exact headline and CTA text legibly within the image (specify their wording, placement, and typography style), on top of the visual direction below, written using the brand's actual imagery/illustration style and color palette"
    ),
  styleTags: z.array(z.string()).min(3).max(8).describe("Short style keywords, e.g. 'minimal', 'high-contrast', 'editorial photography'"),
  negativePrompt: z.string().describe("What to explicitly avoid in the generated image, to stay on-brand"),
  aspectRatioSuggestion: z.string().describe("e.g. '1:1 for feed', '9:16 for Stories/Reels'"),
});

export type AdConcept = z.infer<typeof AdConceptSchema>;

export async function generateSelfServeAdConcept(args: {
  clientId: string;
  requestedByUserId: string;
  client: Pick<Client, "name" | "industry" | "brandSummary">;
  brandOS: BrandOS | null;
  format: string;
  idea: string;
}) {
  const system = `You are the Ad gen agent at Klingit, a creative agency. A client is using you directly to produce a genuinely finished, ready-to-run ad — not a mood-board photo someone still needs to add text to. The generated image must be the actual ad creative: headline and call-to-action text rendered legibly and on-brand directly within the image, exactly as a real ${args.format} ad would look when it's live. Write the image-generation prompt so it explicitly spells out the exact wording, placement, and typography style for that on-image text, on top of a background visual described in the brand's own imagery/illustration style. Separately, write a social caption meant to run ALONGSIDE the ad when it's posted — that caption is not part of the image.`;

  const prompt = `${buildBrandContext(args.client, args.brandOS)}

FORMAT: ${args.format}
IDEA: ${args.idea}

Produce a full, finished ad concept for this — the image must show the actual ad with headline and CTA text baked in, plus a separate social caption for posting it.`;

  const result = await runAgentTask({
    agentKey: "ad_gen",
    clientId: args.clientId,
    requestedByUserId: args.requestedByUserId,
    system,
    prompt,
    schema: AdConceptSchema,
    summarize: (data) => `Generated ad: ${data.headline.slice(0, 60)}`,
  });

  return attachGeneratedImage(result);
}
