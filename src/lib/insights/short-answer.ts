import { after } from "next/server";
import { createHash } from "node:crypto";
import { anthropic } from "@/lib/ai/client";
import { numbersIn } from "@/lib/insights/number-guard";

/**
 * "The short answer" on every Insights tab (Phase X v2). The numbers are computed in code and the sentence is built
 * from them (`template`), so the answer is always there and always right. When AI wording is on, the template is
 * reworded once in the background and cached; the reworded text is used only if it keeps every number and adds none.
 */
const WORDING_MODEL = "claude-opus-5-5";
const TTL = 24 * 3600_000;
const cache = new Map<string, { text: string; at: number }>();
const pending = new Set<string>();

const wordingOn = () => process.env.INSIGHTS_AI_WORDING !== "0" && process.env.NODE_ENV !== "test" && Boolean(process.env.ANTHROPIC_API_KEY);

/** Same numbers, no others: every number in `text` is in the template, and every template number is still there. */
export function keepsNumbers(text: string, template: string) {
  // The same numbers, as many times each: a sorted list of the absolute values must match exactly.
  const abs = (t: string) => numbersIn(t).map(Math.abs).sort((a, b) => a - b).join(",");
  return abs(text) === abs(template);
}

async function reword(template: string): Promise<string | null> {
  const response = await anthropic.messages.create({
    model: WORDING_MODEL,
    max_tokens: 400,
    output_config: { effort: "low" },
    system:
      "You rewrite a short marketing summary for a brand's marketing lead. Keep it to one or two sentences, warm and plain, no jargon, no exclamation marks. Keep every number exactly as written (same digits, units and signs) and add no other numbers. Reply with the rewritten text only.",
    messages: [{ role: "user", content: template }],
  });
  if (response.stop_reason === "refusal") return null;
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  return text || null;
}

export function shortAnswer(scope: string, template: string): string {
  const key = createHash("sha1").update(`${scope}\n${template}`).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.text;
  if (wordingOn() && !pending.has(key)) {
    pending.add(key);
    after(async () => {
      try {
        const text = await reword(template);
        cache.set(key, { text: text && keepsNumbers(text, template) ? text : template, at: Date.now() });
      } catch {
        // The template stays; the next load tries again.
      } finally {
        pending.delete(key);
      }
    });
  }
  return template;
}
