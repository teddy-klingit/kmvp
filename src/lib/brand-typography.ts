import { jsonArray } from "@/lib/utils";

/**
 * Brand OS typography is stored either as plain lines ("Inter — body") or, from a brand pack, as objects
 * ({ family, use, settings, weights, source }). Every reader goes through here so both read the same.
 */
export type Typeface = { family: string; detail: string | null; text: string };

export function typefaces(json: unknown): Typeface[] {
  return jsonArray<unknown>(json)
    .map((t): Typeface | null => {
      if (typeof t === "string") return t.trim() ? { family: t.split(/\s[—–-]\s/)[0].trim(), detail: null, text: t } : null;
      if (t && typeof t === "object" && "family" in t) {
        const o = t as { family: string; use?: string; settings?: string; weights?: number[]; source?: string };
        const detail = [o.use, o.settings, o.weights?.length ? `weights ${o.weights.join(", ")}` : null, o.source].filter(Boolean).join(" · ") || null;
        return { family: o.family, detail, text: detail ? `${o.family} — ${detail}` : o.family };
      }
      return null;
    })
    .filter((t): t is Typeface => t !== null);
}
