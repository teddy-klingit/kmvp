import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";

/**
 * The brief agent in the Brief studio. It reads the client's own words (smart start) or a free-text message
 * (update), with the brand record and the client's similar past projects as context. What it extracts is the
 * client's answer; what it proposes is tagged "suggested". The studio merges both without ever replacing a
 * client edit, and asks its questions from a deterministic plan (src/lib/brief-studio/planner.ts).
 */

const SECTION_KEYS = ["objective", "audience", "deliverables", "keyMessage", "markets", "deadline", "successMetric", "mustHaves", "notes"] as const;

const SmartStartSchema = z.object({
  extracted: z
    .object({
      objective: z.string().nullable().describe("What the client says the work must achieve, as one short sentence. Null unless they said it."),
      formats: z.array(z.string()).describe("Formats or deliverables the client named, e.g. 'Stories 9:16', 'Carousel', '10-slide deck'. Empty unless named."),
      markets: z.array(z.string()).describe("Countries the client named, as English country names. Empty unless named."),
      deadline: z.string().nullable().describe("The final deadline the client gave, as YYYY-MM-DD. Null unless they gave one."),
      keyMessage: z.string().nullable().describe("A key message or line the client wrote. Null unless they wrote one."),
      successMetric: z.string().nullable().describe("How the client says success is measured. Null unless they said it."),
      mustHaves: z.array(z.string()).describe("Things the client says must be included or avoided. Empty unless said."),
    })
    .describe("ONLY what the client actually wrote. Never fill these from the brand record or your own ideas."),
  suggestedKeyMessage: z
    .string()
    .nullable()
    .describe("Your proposed key message for this brief, under 25 words, grounded in the brand record (USPs, tone). Null if the client gave one or there's nothing to ground it in."),
  suggestedObjective: z
    .string()
    .nullable()
    .describe("A one-sentence objective that combines what the client wants with who it's for and where, e.g. 'Drive app installs among existing shoppers in Sweden and Norway.' Null if the client's goal is unclear."),
});

export type SmartStartResult = z.infer<typeof SmartStartSchema>;

export async function runSmartStartAgent(args: { clientId: string; projectId: string; text: string; brandContext: string; pastProjects: string; today: string }) {
  const system = `You are the Brief agent at Klingit, a creative agency. A client has just typed what they need into the Brief studio, often in a few words. Separate what the client actually said (extracted) from what you propose (suggested). Never put a guess into "extracted". Use the brand record and their past projects only to ground your suggestions, never to invent numbers or facts. Today is ${args.today}.`;
  const prompt = `${args.brandContext}

SIMILAR PAST PROJECTS FOR THIS CLIENT:
${args.pastProjects || "(none)"}

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
      return `Started the brief: ${n} field${n === 1 ? "" : "s"} from the client's words${d.suggestedKeyMessage ? ", a suggested key message" : ""}`;
    },
  });
}

const UpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        key: z.enum(SECTION_KEYS),
        value: z.string().describe("The section's new text. For list sections (deliverables, markets, mustHaves) leave empty and use items."),
        items: z.array(z.string()),
      })
    )
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
