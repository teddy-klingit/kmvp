import OpenAI from "openai";

// Reads OPENAI_API_KEY from the environment. Never hardcode a key here.
// Only instantiated lazily (see generate-image.ts) so a missing key doesn't
// crash the app at import time — it just makes image generation unavailable.
export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI();
}

export const IMAGE_MODEL = "gpt-image-1";
