import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runAgentTask } from "@/lib/ai/run-agent";
import { avoidWords, loadActiveRules, ruleTypeLabel, type ActiveRule } from "@/lib/brand-rules";

/**
 * The one rule check for the whole app (Phase R): Brand OS → Rules "Test copy", every skill version, the Output
 * library and the Brand OS check all call checkCopy. Words to avoid are matched exactly (no model needed); the
 * other rules go to the model, which also writes a fixed version. Each run counts towards the rules' "Used N× ·
 * caught M" — only real checks, never invented. Who pays is the caller's context (withAiCharge): a client's test
 * or skill run uses their AI credits; Klingit's own checks don't.
 */

export type RuleViolation = { ruleId: string; rule: string; type: string; offending: string[]; why: string };
export type CopyCheck = { total: number; passed: number; violations: RuleViolation[]; fix: string | null; aiChecked: boolean };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Where a word or phrase occurs as a whole word, case-insensitive: the exact text found. */
export function findWord(text: string, word: string) {
  return [...text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, "giu"))].map((m) => m[0]);
}

const checkSchema = z.object({
  violations: z.array(z.object({ ruleId: z.string(), offending: z.array(z.string()).describe("The exact words or characters in the copy that break the rule"), why: z.string().describe("Short, e.g. 'Headline ends with “!”'") })),
  fixed: z.string().describe("The copy rewritten so it follows every rule, same meaning and length; empty if nothing broke"),
});

/** Deterministic part: every avoided word used, against the rule that names it. */
function wordHits(text: string, rules: ActiveRule[]): RuleViolation[] {
  const out: RuleViolation[] = [];
  const seen = new Set<string>();
  // A word named by a "never say …" rule and by the word list is reported once, against the rule (it comes first).
  for (const r of rules.filter((r) => r.type === "WORDS_AVOID").sort((a, b) => Number(a.text.startsWith("Words we")) - Number(b.text.startsWith("Words we")))) {
    const found = avoidWords([r]).flatMap((w) => findWord(text, w)).filter((w) => !seen.has(w.toLowerCase()));
    found.forEach((w) => seen.add(w.toLowerCase()));
    if (found.length) out.push({ ruleId: r.id, rule: r.text, type: ruleTypeLabel(r.type), offending: [...new Set(found)], why: `“${found[0]}” is on your words-to-avoid list` });
  }
  return out;
}

export async function checkCopy(
  clientId: string,
  text: string,
  opts: { channel?: string | null; product?: string | null; ai?: boolean; agentContext?: { projectId?: string; requestedByUserId?: string } } = {}
): Promise<CopyCheck> {
  const copy = text.trim().slice(0, 4000);
  const rules = await loadActiveRules(clientId, { channel: opts.channel, product: opts.product });
  if (!copy || !rules.length) return { total: rules.length, passed: rules.length, violations: [], fix: null, aiChecked: false };

  const found = wordHits(copy, rules);
  let fix: string | null = null;
  let aiChecked = false;
  const judged = rules.filter((r) => !(r.type === "WORDS_AVOID" && r.words.length) && r.type !== "WORDS_USE");
  if (opts.ai !== false && judged.length) {
    const r = await runAgentTask({
      agentKey: "rule_check",
      clientId,
      ...opts.agentContext,
      system: "You check marketing copy against a brand's written rules. Flag a rule only when the copy clearly breaks it; quote the exact offending words. Then rewrite the copy so it follows every rule (including the words-to-avoid list), keeping its meaning, language and length.",
      prompt: [
        `RULES (id: rule)`,
        ...judged.map((x) => `${x.id}: [${ruleTypeLabel(x.type)}] ${x.text}`),
        `WORDS TO AVOID: ${avoidWords(rules).join(", ") || "none"}`,
        opts.channel ? `CHANNEL: ${opts.channel}` : "",
        "",
        "COPY:",
        copy,
      ].join("\n"),
      schema: checkSchema,
      summarize: (d) => `${d.violations.length} rule${d.violations.length === 1 ? "" : "s"} broken`,
    });
    if (r.ok) {
      aiChecked = true;
      const byId = new Map(judged.map((x) => [x.id, x]));
      for (const v of r.data.violations) {
        const rule = byId.get(v.ruleId);
        // Only words that are really in the copy are highlighted.
        if (rule && !found.some((f) => f.ruleId === rule.id)) found.push({ ruleId: rule.id, rule: rule.text, type: ruleTypeLabel(rule.type), offending: v.offending.filter((o) => o && copy.includes(o)), why: v.why });
      }
      fix = r.data.fixed.trim() || null;
    }
  }

  // Counts: every applicable rule was used once; the broken ones caught something.
  const caught = new Set(found.map((f) => f.ruleId));
  await prisma.$transaction([
    prisma.brandRule.updateMany({ where: { id: { in: rules.map((r) => r.id) } }, data: { usedCount: { increment: 1 } } }),
    ...(caught.size ? [prisma.brandRule.updateMany({ where: { id: { in: [...caught] } }, data: { caughtCount: { increment: 1 } } })] : []),
  ]);
  return { total: rules.length, passed: rules.length - caught.size, violations: found, fix: found.length ? fix : null, aiChecked };
}
