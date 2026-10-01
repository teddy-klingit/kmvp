"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { filtersToQueryString, type ReportFilters } from "@/lib/report-filters";

/** Saves the current filter selection under a name so it can be reopened
 * later without re-picking every option — the report itself isn't stored,
 * only the criteria, so reopening it always reflects current data. */
export async function saveReportAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const filters: ReportFilters = {
    preset: String(formData.get("preset") ?? "") || undefined,
    from: String(formData.get("from") ?? "") || undefined,
    to: String(formData.get("to") ?? "") || undefined,
    platform: String(formData.get("platform") ?? "") || undefined,
    contentType: String(formData.get("contentType") ?? "") || undefined,
  };

  await prisma.savedReport.create({
    data: { clientId: viewer.clientId, name, filters },
  });

  revalidatePath("/reports/custom");
  redirect(`/reports/custom?${filtersToQueryString(filters)}&saved=1`);
}

export async function deleteSavedReportAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const id = String(formData.get("id") ?? "");
  await prisma.savedReport.deleteMany({ where: { id, clientId: viewer.clientId } });
  revalidatePath("/reports/custom");
}
