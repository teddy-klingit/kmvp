import OpenAI from "openai";
import { getOpenAIClient, IMAGE_MODEL } from "@/lib/ai/image-client";
import { safeZonePrompt } from "@/lib/safe-zones";

type GenerateImageResult = { ok: true; dataUri: string } | { ok: false; error: string };

/**
 * The exact size for the format, so nothing is cropped when it's shown in its placement (GPT Image 2.5 takes any
 * WIDTHxHEIGHT divisible by 16). A 2:3 image in a 9:16 story frame loses ~8% at each side, which put text on the edge.
 */
export function pickSize(aspectRatioSuggestion: string): string {
  const s = aspectRatioSuggestion.toLowerCase();
  if (s.includes("9:16") || s.includes("story") || s.includes("stories") || s.includes("reel")) return "1008x1792";
  if (s.includes("4:5") || s.includes("carousel")) return "1024x1280";
  if (s.includes("2:3") || s.includes("portrait")) return "1024x1536";
  if (s.includes("16:9") || s.includes("landscape")) return "1792x1008";
  if (s.includes("1.91") || s.includes("link")) return "1536x800";
  if (s.includes("3:2")) return "1536x1024";
  return "1024x1024";
}

export async function generateImageFromPrompt(prompt: string, aspectRatioSuggestion: string): Promise<GenerateImageResult> {
  const client = getOpenAIClient();
  if (!client) {
    return { ok: false, error: "Image generation isn't configured yet — ask an admin to add an OPENAI_API_KEY." };
  }

  try {
    const response = await client.images.generate({
      model: IMAGE_MODEL,
      // Stories and Reels: words, logo and CTA stay out of the bands the platform's UI covers.
      prompt: [prompt, safeZonePrompt(aspectRatioSuggestion)].filter(Boolean).join("\n\n"),
      size: pickSize(aspectRatioSuggestion) as "1024x1024",
      n: 1,
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image data returned.");

    return { ok: true, dataUri: `data:image/png;base64,${b64}` };
  } catch (err) {
    console.error("[image] generation failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: describeOpenAIError(err) };
  }
}

export function describeOpenAIError(err: unknown): string {
  // The common account problems, in words a person can act on (the raw message stays in the server log).
  if (err instanceof OpenAI.APIError) {
    const m = `${err.message ?? ""}`;
    if (err.status === 403 && /verif/i.test(m)) return "OpenAI hasn't verified Klingit's organisation yet, so it won't make images. An admin verifies it at platform.openai.com → Settings → Organization.";
    if ((err.status === 400 || err.status === 404) && /model .*does not exist|model_not_found/i.test(m)) return `OpenAI doesn't offer the image model “${IMAGE_MODEL}” to this key (retired, or not allowed in the key's project).`;
    if (/billing|quota|insufficient|hard limit|no credits/i.test(m) || err.status === 402) return "Klingit's OpenAI account is out of credit or over its limit, so no image was made.";
    if (err.status === 400 && /safety|moderation|content policy/i.test(m)) return "OpenAI turned this image down for its content rules. Try describing it differently.";
  }
  if (err instanceof OpenAI.APIConnectionTimeoutError) return "OpenAI took too long to make the image. Try again.";
  if (err instanceof OpenAI.AuthenticationError) {
    return "OpenAI API key is missing or invalid.";
  }
  if (err instanceof OpenAI.RateLimitError) {
    return "Rate limited by the OpenAI API — try again shortly.";
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return "Could not reach the OpenAI API — check your network connection.";
  }
  if (err instanceof OpenAI.APIError) {
    return `OpenAI API error (${err.status}): ${err.message}`;
  }
  return err instanceof Error ? err.message : "Unknown error generating the image.";
}
