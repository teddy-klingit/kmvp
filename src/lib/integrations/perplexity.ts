export type PerplexityResult = { ok: true; answer: string } | { ok: false; reason: "not_configured" | "api_error"; message?: string };

/** Asks Perplexity's Sonar API a question directly — real, current, web-grounded by default (that's Perplexity's whole model), no separate search step needed. */
export async function askPerplexity(question: string): Promise<PerplexityResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "Answer naturally and specifically, the way you would to any user researching this — mention specific real companies/brands where genuinely relevant to a complete answer.",
          },
          { role: "user", content: question },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, reason: "api_error", message: data?.error?.message ?? `Perplexity request failed (${res.status}).` };
    }

    const answer = data.choices?.[0]?.message?.content;
    if (!answer) return { ok: false, reason: "api_error", message: "Perplexity returned no answer." };

    return { ok: true, answer };
  } catch (err) {
    return { ok: false, reason: "api_error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}
