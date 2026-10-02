"use server";

import { revalidatePath } from "next/cache";
import { getPortalViewer } from "@/lib/current-viewer";
import { runSeoAudit } from "@/lib/seo-audit-run";

export type GenerateSeoReportState = { error?: string | null };

export async function generateSeoReportAction(
  _prev: GenerateSeoReportState,
  _formData: FormData
): Promise<GenerateSeoReportState> {
  const viewer = await getPortalViewer();
  const result = await runSeoAudit(viewer.client);
  if (result.error) return result;

  revalidatePath("/insights/seo");
  revalidatePath("/insights");
  return { error: null };
}
