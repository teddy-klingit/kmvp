import { z } from "zod";
import { runAgentTask } from "@/lib/ai/run-agent";
import { jsonArray } from "@/lib/utils";
import type { CheckResult } from "@/lib/qc/specs";

/**
 * The AI half of the Brand OS check: the brand compliance agent looks at the image against the client's Brand
 * OS (colours, voice rules, do's and don'ts) and the placement. A check it can't judge for this asset comes back
 * "n/a" and isn't counted. Each failure is one short line; nothing here is shown to the client.
 */

const AI_CHECKS = {
  identity: { label: "Logo lockup and colours", source: "Brand OS · visual identity" },
  legal: { label: "Legal line", source: "Brand OS · must include" },
  spelling: { label: "Spelling and grammar", source: "Copy check" },
  tone: { label: "Tone of voice", source: "Brand OS · voice rules" },
  safe_zone: { label: "Platform safe zone", source: "Platform safe zone" },
  text_amount: { label: "Text amount", source: "Platform specs" },
} as const;
type AiKey = keyof typeof AI_CHECKS;

const ResultSchema = z.object({
  checks: z.array(
    z.object({
      key: z.enum(Object.keys(AI_CHECKS) as [AiKey, ...AiKey[]]),
      status: z.enum(["pass", "fail", "n/a"]).describe("n/a when this check doesn't apply to this asset or can't be judged from the image"),
      label: z.string().describe("For a fail: what's wrong in at most 3 words, e.g. 'Text crop', 'CTA under UI'. Empty for pass."),
      detail: z.string().describe("For a fail: one line, at most 10 words, e.g. 'CTA sits under the Reels UI'. Empty for pass."),
    })
  ),
});

export type BrandRules = { clientName: string; toneRules: unknown; dos: unknown; donts: unknown; colors: unknown };

export async function visionChecks(args: {
  clientId: string;
  projectId: string;
  asset: { name: string; format: string; platform: string | null };
  image: { mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string };
  brand: BrandRules;
}): Promise<{ results: CheckResult[]; runId: string | null }> {
  if (process.env.QC_AI === "0") return { results: [], runId: null };
  const list = (v: unknown) => jsonArray<string | { hex?: string; name?: string }>(v).map((x) => (typeof x === "string" ? x : [x.name, x.hex].filter(Boolean).join(" "))).filter(Boolean);
  const prompt = [
    `Client: ${args.brand.clientName}`,
    `Asset: "${args.asset.name}" · ${args.asset.format}${args.asset.platform ? ` · ${args.asset.platform}` : ""}`,
    "",
    "BRAND OS",
    `Colours: ${list(args.brand.colors).join(", ") || "not set"}`,
    `Voice rules: ${list(args.brand.toneRules).join("; ") || "not set"}`,
    `Do: ${list(args.brand.dos).join("; ") || "not set"}`,
    `Don't: ${list(args.brand.donts).join("; ") || "not set"}`,
    "",
    "Check the image for each of: identity (logo lockup and brand colours), legal (a legal/disclaimer line where the offer or claim needs one), spelling (spelling and grammar of every word on the image), tone (copy follows the voice rules), safe_zone (text and CTA clear of the platform UI for this format, e.g. the bottom 20% and top 14% of a 9:16 story or reel), text_amount (text covers well under a third of the image).",
    "Fail only for a clear, specific problem you can see. Use n/a when a check doesn't apply or the Brand OS doesn't say enough to judge it.",
  ].join("\n");
  const r = await runAgentTask({
    agentKey: "brand_compliance",
    clientId: args.clientId,
    projectId: args.projectId,
    system: "You are the brand compliance agent at Klingit, a creative agency. You check delivered creative against the client's Brand OS and platform specs before Klingit sends it to the client. You are precise and never invent problems.",
    prompt,
    schema: ResultSchema,
    images: [args.image],
    summarize: (d) => `${d.checks.filter((c) => c.status === "fail").length} to look at · ${d.checks.filter((c) => c.status === "pass").length} passed`,
  });
  if (!r.ok) return { results: [], runId: null };
  const results = r.data.checks
    .filter((c) => c.status !== "n/a" && AI_CHECKS[c.key])
    .map((c) => ({
      key: c.key,
      label: AI_CHECKS[c.key].label,
      source: AI_CHECKS[c.key].source,
      passed: c.status === "pass",
      flag: c.status === "fail" ? { label: c.label.trim() || AI_CHECKS[c.key].label, detail: c.detail.trim() || AI_CHECKS[c.key].label } : undefined,
    }));
  return { results, runId: r.runId };
}
