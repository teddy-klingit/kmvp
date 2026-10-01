import OpenAI from "openai";
import { getOpenAIClient, IMAGE_MODEL } from "@/lib/ai/image-client";

type GenerateImageResult = { ok: true; dataUri: string } | { ok: false; error: string };

/** Maps the agent's free-text aspect ratio suggestion to a size gpt-image-1 actually supports. */
function pickSize(aspectRatioSuggestion: string): "1024x1024" | "1024x1536" | "1536x1024" {
  const s = aspectRatioSuggestion.toLowerCase();
  if (s.includes("9:16") || s.includes("4:5") || s.includes("2:3") || s.includes("portrait") || s.includes("story") || s.includes("reel")) {
    return "1024x1536";
  }
  if (s.includes("16:9") || s.includes("3:2") || s.includes("landscape")) {
    return "1536x1024";
  }
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
      prompt,
      size: pickSize(aspectRatioSuggestion),
      n: 1,
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image data returned.");

    return { ok: true, dataUri: `data:image/png;base64,${b64}` };
  } catch (err) {
    return { ok: false, error: describeOpenAIError(err) };
  }
}

function describeOpenAIError(err: unknown): string {
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
