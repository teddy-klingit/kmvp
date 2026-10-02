"use server";

import { revalidatePath } from "next/cache";
import { getPortalViewer } from "@/lib/current-viewer";
import { generatePerformanceBrief } from "@/lib/insights-brief";

export type GeneratePerformanceInsightsState = { error?: string | null };

/** "Generate / Refresh insights": the performance agent rewrites the summary, recommendations and this week's takeaways. */
export async function generatePerformanceInsightsAction(_prev: GeneratePerformanceInsightsState, _formData: FormData): Promise<GeneratePerformanceInsightsState> {
  const viewer = await getPortalViewer();
  const result = await generatePerformanceBrief(viewer.clientId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/insights", "layout");
  return { error: null };
}
