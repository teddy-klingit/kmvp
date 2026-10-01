import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";
import { buildBrandContext } from "@/lib/ai/brand-context";
import type { Client, BrandOS } from "@/generated/prisma";

type NicheCopyArgs = {
  clientId: string;
  requestedByUserId: string;
  client: Pick<Client, "name" | "industry" | "brandSummary">;
  brandOS: BrandOS | null;
  goal: string;
  keyPoints: string;
};

function buildPrompt(args: NicheCopyArgs, formatLine: string) {
  return `${buildBrandContext(args.client, args.brandOS)}

${formatLine}
GOAL: ${args.goal}
KEY POINTS TO INCLUDE: ${args.keyPoints}`;
}

const SYSTEM_PREFIX =
  "You are a specialist copywriter at Klingit, a creative agency. A client is using you directly, without a copywriter in the loop, to draft copy for their own brand. Write strictly in the brand's own voice — match the tone rules and voice attributes exactly, don't default to generic marketing copy.";

// ---------------------------------------------------------------------------
// LinkedIn post
// ---------------------------------------------------------------------------

const LinkedInPostSchema = z.object({
  hook: z.string().describe("The first line — must stand alone and earn the 'see more' click"),
  body: z.string().describe("The rest of the post, formatted with line breaks the way real LinkedIn posts are"),
  hashtags: z.array(z.string()).max(5),
});
export type LinkedInPost = z.infer<typeof LinkedInPostSchema>;

export async function generateLinkedInPost(args: NicheCopyArgs) {
  const system = `${SYSTEM_PREFIX} You specialize in LinkedIn posts specifically — first-line hooks that survive the truncation, short punchy paragraphs, a professional but human tone, no hashtag stuffing.`;
  return runAgentTask({
    agentKey: "linkedin_post_agent",
    clientId: args.clientId,
    requestedByUserId: args.requestedByUserId,
    system,
    prompt: buildPrompt(args, "FORMAT: LinkedIn post"),
    schema: LinkedInPostSchema,
    summarize: (data) => `Generated LinkedIn post: ${data.hook.slice(0, 60)}`,
  });
}

// ---------------------------------------------------------------------------
// Landing page copy
// ---------------------------------------------------------------------------

const LandingPageCopySchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  sections: z
    .array(z.object({ heading: z.string(), body: z.string() }))
    .min(2)
    .max(4)
    .describe("The page's main content sections, in order"),
  callToAction: z.string(),
});
export type LandingPageCopy = z.infer<typeof LandingPageCopySchema>;

export async function generateLandingPageCopy(args: NicheCopyArgs) {
  const system = `${SYSTEM_PREFIX} You specialize in landing page copy — a headline that states the value proposition in one breath, a subheadline that removes the first objection, scannable sections (not walls of text), and a call to action that matches the actual next step.`;
  return runAgentTask({
    agentKey: "landing_page_copy_agent",
    clientId: args.clientId,
    requestedByUserId: args.requestedByUserId,
    system,
    prompt: buildPrompt(args, "FORMAT: Landing page"),
    schema: LandingPageCopySchema,
    summarize: (data) => `Generated landing page copy: ${data.headline}`,
  });
}

// ---------------------------------------------------------------------------
// Instagram caption
// ---------------------------------------------------------------------------

const InstagramCaptionSchema = z.object({
  caption: z.string().describe("The full caption, including line breaks where a real Instagram caption would have them"),
  hashtags: z.array(z.string()).max(15),
  altText: z.string().describe("Accessible alt text describing the image this caption would run under"),
});
export type InstagramCaption = z.infer<typeof InstagramCaptionSchema>;

export async function generateInstagramCaption(args: NicheCopyArgs) {
  const system = `${SYSTEM_PREFIX} You specialize in Instagram captions — conversational, scroll-stopping opening line, appropriate emoji use only if it matches the brand's actual voice, a realistic hashtag mix (not generic spam tags), and real alt text.`;
  return runAgentTask({
    agentKey: "instagram_caption_agent",
    clientId: args.clientId,
    requestedByUserId: args.requestedByUserId,
    system,
    prompt: buildPrompt(args, "FORMAT: Instagram caption"),
    schema: InstagramCaptionSchema,
    summarize: (data) => `Generated Instagram caption: ${data.caption.slice(0, 60)}`,
  });
}

// ---------------------------------------------------------------------------
// Email copy
// ---------------------------------------------------------------------------

const EmailCopySchema = z.object({
  subjectLines: z.array(z.string()).min(2).max(3).describe("2-3 subject line options to A/B test"),
  preheader: z.string(),
  body: z.string().describe("The full email body copy"),
});
export type EmailCopy = z.infer<typeof EmailCopySchema>;

export async function generateEmailCopy(args: NicheCopyArgs) {
  const system = `${SYSTEM_PREFIX} You specialize in email copy — subject lines that earn the open without misleading, a preheader that adds to the subject rather than repeating it, and body copy structured for skimming.`;
  return runAgentTask({
    agentKey: "email_copy_agent",
    clientId: args.clientId,
    requestedByUserId: args.requestedByUserId,
    system,
    prompt: buildPrompt(args, "FORMAT: Marketing email"),
    schema: EmailCopySchema,
    summarize: (data) => `Generated email copy: ${data.subjectLines[0]}`,
  });
}
