import OpenAI from "openai";

// Reads OPENAI_API_KEY from the environment. Never hardcode a key here.
// Only instantiated lazily (see generate-image.ts) so a missing key doesn't
// crash the app at import time — it just makes image generation unavailable.
export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI();
}

// gpt-image-1 was retired by OpenAI on 23 Oct 2026. Flare is the fast, everyday GPT Image 2.5 model (Sunburst is
// the most capable one); OPENAI_IMAGE_MODEL overrides it without a code change.
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";
