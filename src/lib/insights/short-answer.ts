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

// ─── Phase X 2b: a headline plus 3 signal tiles ─────────────────────────────────────────────────────────────────
/** Good news (green ▲), Needs attention (orange ▼) or Keep an eye on (blue, eye). */
export type SignalStatus = "good" | "attention" | "watch";
/** One computed signal a tab could lead with: a status, one big number and a short label. */
export type Signal = { id: string; status: SignalStatus; value: string; label: string; weight: number };
export type AnswerCard = { headline: string; tiles: Signal[] };

const HEADLINE_WORDS = 12;
const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** The default pick: the 3 strongest signals, shown in the order the tab lists them. */
export function pickTiles(signals: Signal[], n = 3): Signal[] {
  const top = new Set([...signals].sort((a, b) => b.weight - a.weight).slice(0, n).map((s) => s.id));
  return signals.filter((s) => top.has(s.id));
}

/**
 * Whether an AI pick can be used: the ids exist and differ, the headline is short, and every number in the headline
 * is one of the signals' (or the code headline's) numbers. The tiles always show the code's own numbers.
 */
export function validPick(pick: { headline: string; ids: string[] }, signals: Signal[], fallback: string, n: number) {
  const ids = new Set(signals.map((s) => s.id));
  if (pick.ids.length !== Math.min(n, signals.length) || new Set(pick.ids).size !== pick.ids.length || !pick.ids.every((id) => ids.has(id))) return false;
  if (!pick.headline.trim() || words(pick.headline) > HEADLINE_WORDS) return false;
  const pool = new Set([fallback, ...signals.flatMap((s) => [s.value, s.label])].flatMap((t) => numbersIn(t).map(Math.abs)));
  // Spelled-out numbers ("seven moments") count as numbers too.
  const spelled = pick.headline.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, (w) => String(NUMBER_WORDS.indexOf(w) + 1));
  return numbersIn(spelled).every((x) => pool.has(Math.abs(x)));
}

async function pickWithAi(signals: Signal[], fallback: string, n: number): Promise<{ headline: string; ids: string[] } | null> {
  const response = await anthropic.messages.create({
    model: WORDING_MODEL,
    max_tokens: 300,
    output_config: { effort: "low" },
    system:
      `You write the top of a marketing results page for a brand's marketing lead. From the signals given, pick the ${n} that matter most together, and write one headline of at most ${HEADLINE_WORDS} words that sums them up: plain, warm, no jargon, no exclamation marks. Use only numbers that appear in the signals, or none. Reply with JSON only: {"headline": "...", "ids": ["...", ...]}.`,
    messages: [{ role: "user", content: JSON.stringify({ suggestedHeadline: fallback, signals: signals.map(({ id, status, value, label }) => ({ id, status, value, label })) }) }],
  });
  if (response.stop_reason === "refusal") return null;
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const out = JSON.parse(json) as { headline?: unknown; ids?: unknown };
    return typeof out.headline === "string" && Array.isArray(out.ids) && out.ids.every((x) => typeof x === "string") ? { headline: out.headline.trim(), ids: out.ids as string[] } : null;
  } catch {
    return null;
  }
}

const cardCache = new Map<string, { pick: { headline: string; ids: string[] } | null; at: number }>();

/**
 * The short answer as a headline and 3 tiles. Code computes every signal and a headline that's always right; when AI
 * wording is on, the AI picks which signals lead and words the headline once in the background (cached), and its
 * pick is used only if `validPick` passes.
 */
export function answerCard(scope: string, input: { headline: string; signals: Signal[]; n?: number }): AnswerCard {
  const n = input.n ?? 3;
  const fallback: AnswerCard = { headline: input.headline, tiles: pickTiles(input.signals, n) };
  if (!input.signals.length) return fallback;
  const key = createHash("sha1").update(`${scope}\n${input.headline}\n${JSON.stringify(input.signals)}`).digest("hex");
  const hit = cardCache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    if (!hit.pick) return fallback;
    const byId = new Map(input.signals.map((s) => [s.id, s]));
    return { headline: hit.pick.headline, tiles: hit.pick.ids.map((id) => byId.get(id)!) };
  }
  if (wordingOn() && !pending.has(key)) {
    pending.add(key);
    after(async () => {
      try {
        const pick = await pickWithAi(input.signals, input.headline, n);
        cardCache.set(key, { pick: pick && validPick(pick, input.signals, input.headline, n) ? pick : null, at: Date.now() });
      } catch {
        // The code's pick stays; the next load tries again.
      } finally {
        pending.delete(key);
      }
    });
  }
  return fallback;
}
