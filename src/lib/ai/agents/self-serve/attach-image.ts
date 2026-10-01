import { generateImageFromPrompt } from "@/lib/ai/generate-image";
import { prisma } from "@/lib/prisma";

type ImageBackedData = { imagePrompt: string; aspectRatioSuggestion: string };
type RunResult<T> = { ok: true; data: T; runId: string } | { ok: false; error: string };

/** Shared by every self-service agent that follows up a text generation with
 * a real image render — generates the image from the agent's own prompt and
 * merges it into that same AgentRun's output, so the client sees one
 * generation with both the copy and the image together. */
export async function attachGeneratedImage<T extends ImageBackedData>(result: RunResult<T>) {
  if (!result.ok) return result;

  const image = await generateImageFromPrompt(result.data.imagePrompt, result.data.aspectRatioSuggestion);
  const output = image.ok ? { ...result.data, imageDataUri: image.dataUri } : { ...result.data, imageError: image.error };

  await prisma.agentRun.update({ where: { id: result.runId }, data: { output } });

  return { ok: true as const, data: output, runId: result.runId };
}
