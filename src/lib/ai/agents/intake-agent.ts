import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";
import { buildBrandContext } from "@/lib/ai/brand-context";
import type { Client, BrandOS } from "@/generated/prisma";

const PROJECT_TYPES = [
  "CAMPAIGN",
  "SINGLE_ASSET",
  "PRESENTATION",
  "MOTION_VIDEO",
  "DEVELOPMENT",
  "BRAND_GUIDELINES",
  "OTHER",
] as const;

const ClarifyingQuestionSchema = z.object({
  key: z.string().describe("short snake_case identifier for this question, e.g. 'deadline_flexibility'"),
  question: z.string().describe("A short, specific clarifying question"),
  quickAnswers: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe("2-4 short one-tap answer options covering the most likely responses — client can also type something custom"),
});

const IntakeAnalysisSchema = z.object({
  suggestedName: z.string().describe("A short, specific, professional project name — not generic, e.g. 'Q4 Investor Deck' not 'New Project'"),
  projectType: z.enum(PROJECT_TYPES),
  summary: z.string().describe("A 1-2 sentence summary of what the client is asking for, in your own words"),
  clarifyingQuestions: z
    .array(ClarifyingQuestionSchema)
    .min(0)
    .max(4)
    .describe(
      "Only ask what's genuinely missing or ambiguous for THIS request — skip anything already answered in their text, and skip anything already on file in the brand context below (e.g. who the audience is, tone of voice, visual style). Empty array is fine if nothing's missing."
    ),
});

export type IntakeAnalysis = z.infer<typeof IntakeAnalysisSchema>;

export async function intakeBrief(args: {
  projectId?: string;
  clientId: string;
  client: Pick<Client, "name" | "industry" | "brandSummary">;
  brandOS: BrandOS | null;
  /** From brandSourcesForAgents(). */
  linkedSources?: string;
  rawText: string;
  link?: string | null;
  fileName?: string | null;
  fileText?: string | null;
}) {
  const system = `You are the Brief intake agent at Klingit, a creative agency producing everything from ad campaigns to single assets, decks, motion/video, dev builds, and brand work. A client has just described what they need in their own words — often short, informal, or incomplete. Your job: give the project a specific, professional name; classify its type; summarize it back to them; and ask only the clarifying questions that would genuinely change how this gets scoped or produced for THIS SPECIFIC request.

You are given the client's full brand record below (audience personas, voice/tone, visual guidelines, etc.) — this already exists on file. Never ask a question that record already answers. In particular: if audience personas are listed, don't ask who the work is for; if voice attributes or tone rules are listed, don't ask about tone of voice; if imagery/illustration style or a color palette is listed, don't ask about visual style — unless the client's own text suggests THIS specific project should deviate from the brand default, in which case it's fine to confirm that deviation. Keep remaining questions short and give quick-tap answer options wherever the likely answers are predictable.`;

  const parts = [buildBrandContext(args.client, args.brandOS, args.linkedSources), "", "WHAT THE CLIENT WROTE:", args.rawText];
  if (args.link) parts.push("", `They also shared this link for reference: ${args.link}`);
  if (args.fileName) {
    parts.push("", `They also attached a file: ${args.fileName}${args.fileText ? " — extracted contents below:" : " (contents not extracted — ask about it if relevant)."}`);
    if (args.fileText) parts.push(args.fileText.slice(0, 4000));
  }
  parts.push(
    "",
    "Name this project, classify its type, summarize it, and ask only the clarifying questions that aren't already answered above by the brand context or the client's own text — 0-4 questions, with quick-tap answer options."
  );

  return runAgentTask({
    agentKey: "brief_agent",
    projectId: args.projectId,
    clientId: args.clientId,
    system,
    prompt: parts.join("\n"),
    schema: IntakeAnalysisSchema,
    summarize: (data) => `Named "${data.suggestedName}" (${data.projectType}) — ${data.clarifyingQuestions.length} clarifying question(s)`,
  });
}
