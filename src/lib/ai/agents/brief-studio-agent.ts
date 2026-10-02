import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";

/**
 * The brief agent in the Brief studio. Smart start reads the client's first message with the brand record, their
 * similar past projects and real comments as context: what the client said is extracted as their answer, and the
 * agent drafts the chips for the questions it will ask (single-minded messages, what holds people back, proof
 * points). The task writer turns a complete brief into The task. The studio merges everything without ever
 * replacing a client edit, and asks its questions from a deterministic plan (src/lib/brief-studio/planner.ts).
 */

const SECTION_KEYS = ["whyNow", "objective", "audience", "keyMessage", "proofOffer", "cta", "material", "mustInclude", "mustAvoid", "notes"] as const;

const SmartStartSchema = z.object({
  extracted: z
    .object({
      objective: z.string().nullable().describe("What the client says the work must achieve, as one short sentence. Null unless they said it."),
      formats: z.array(z.string()).describe("Formats the client named, e.g. 'Stories 9:16', 'TikTok in-feed'. Empty unless named."),
      markets: z.array(z.string()).describe("Countries the client named, as English country names. Empty unless named."),
      deadline: z.string().nullable().describe("The final deadline the client gave, as YYYY-MM-DD. Null unless they gave one."),
      keyMessage: z.string().nullable().describe("A key message or line the client wrote. Null unless they wrote one."),
      whyNow: z.string().nullable().describe("Why the client needs this now, in their words. Null unless they said it."),
      proofOffer: z.string().nullable().describe("An offer or proof point the client named. Null unless they named one."),
    })
    .describe("ONLY what the client actually wrote. Never fill these from the brand record or your own ideas."),
  keyMessageOptions: z
    .array(z.string())
    .max(3)
    .describe("2–3 single-minded messages for this brief, each under 12 words, grounded in the brand's USPs and voice. Each says one thing only."),
  barrierOptions: z
    .array(z.object({ label: z.string().describe("What people get wrong about the brand, as a short phrase starting with a verb, e.g. 'Think it is only for big purchases'"), evidence: z.number().int().nullable().describe("Index of the REAL comment below that shows this, or null. Never guess.") }))
    .max(4)
    .describe("3–4 misconceptions or barriers that hold the audience back, for this brand and this request."),
  proofOptions: z.array(z.string()).max(3).describe("2–3 offers or proof points from the brand record (USPs, products), as the exact claim. No invented numbers."),
});

export type SmartStartResult = z.infer<typeof SmartStartSchema>;

export async function runSmartStartAgent(args: { clientId: string; projectId: string; text: string; brandContext: string; pastProjects: string; comments: string[]; today: string }) {
  const system = `You are the Brief agent at Klingit, a creative agency. A client has just typed what they need into the Brief studio, often in a few words. Separate what the client actually said (extracted) from what you draft (the option lists). Never put a guess into "extracted". Ground every option in the brand record, their past projects and the real comments given. Never invent numbers or facts, and only point to a comment as evidence if it really says that. Today is ${args.today}.`;
  const prompt = `${args.brandContext}

SIMILAR PAST PROJECTS FOR THIS CLIENT:
${args.pastProjects || "(none)"}

REAL COMMENTS FROM THEIR AUDIENCE (numbered):
${args.comments.length ? args.comments.map((c, i) => `${i}. ${c}`).join("\n") : "(none)"}

WHAT THE CLIENT WROTE:
${args.text}`;
  return runAgentTask({
    agentKey: "brief_agent",
    projectId: args.projectId,
    clientId: args.clientId,
    system,
    prompt,
    schema: SmartStartSchema,
    summarize: (d) => {
      const n = Object.values(d.extracted).filter((v) => (Array.isArray(v) ? v.length : v)).length;
      return `Started the brief: ${n} field${n === 1 ? "" : "s"} from the client's words, ${d.keyMessageOptions.length} message options`;
    },
  });
}

const TaskSchema = z.object({
  sentence: z.string().describe("One sentence: what is made + for whom + the goal + the idea, e.g. '6 ads for Meta and TikTok in Sweden and Norway that get existing shoppers to install the app, by showing Klarna is for everyday buys, not just big ones.' Under 40 words, no invented facts."),
  ideaName: z.string().nullable().describe("The idea in 2–3 words for the brief's title, e.g. 'Everyday buys'. Null if there's no clear idea yet."),
});

export type TaskResult = z.infer<typeof TaskSchema>;

export async function runTaskAgent(args: { clientId: string; projectId: string; brief: string }) {
  return runAgentTask({
    agentKey: "brief_agent",
    projectId: args.projectId,
    clientId: args.clientId,
    system: "You are the Brief agent at Klingit. Write The task: the one sentence Klingit commits to, from the brief below. Use only what the brief says. Plain text: keep numbers and ranges exactly as written (22–34 stays 22–34).",
    prompt: `THE BRIEF:\n${args.brief}`,
    schema: TaskSchema,
    summarize: (d) => `Wrote The task${d.ideaName ? ` (“${d.ideaName}”)` : ""}`,
  });
}

const UpdateSchema = z.object({
  updates: z
    .array(z.object({ key: z.enum(SECTION_KEYS), value: z.string().describe("The section's new text. For mustInclude and mustAvoid leave empty and use items."), items: z.array(z.string()) }))
    .max(4)
    .describe("Sections the client's message changes or adds to. Only what the message says."),
  reply: z.string().describe("One short, friendly line back to the client saying what you changed, or answering their question. No markdown."),
});

export type BriefUpdateResult = z.infer<typeof UpdateSchema>;

export async function runBriefUpdateAgent(args: { clientId: string; projectId: string; text: string; brief: string; brandContext: string }) {
  const system = `You are the Brief agent at Klingit. The client is shaping a brief in the Brief studio and has sent a message. If it adds to or changes the brief, return those section updates; if it's a question, answer it in "reply" and return no updates. Never invent facts or numbers.`;
  const prompt = `${args.brandContext}

THE BRIEF SO FAR:
${args.brief}

THE CLIENT'S MESSAGE:
${args.text}`;
  return runAgentTask({
    agentKey: "brief_agent",
    projectId: args.projectId,
    clientId: args.clientId,
    system,
    prompt,
    schema: UpdateSchema,
    summarize: (d) => (d.updates.length ? `Updated ${d.updates.map((u) => u.key).join(", ")} from a client message` : "Answered a client question in the Brief studio"),
  });
}
