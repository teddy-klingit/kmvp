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

/** Reports → "Change schedule": day, time and who on the client's own team gets the report. */
export async function updateReportScheduleAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const day = Math.min(7, Math.max(1, Number(formData.get("day")) || 1));
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(formData.get("time") ?? "")) ? String(formData.get("time")) : "08:00";
  // Only people on this client's team can be recipients.
  const team = await prisma.clientUser.findMany({ where: { clientId: viewer.clientId }, select: { userId: true } });
  const allowed = new Set(team.map((t) => t.userId));
  const recipients = formData.getAll("recipient").map(String).filter((id) => allowed.has(id));
  await prisma.clientReportingConfig.upsert({
    where: { clientId: viewer.clientId },
    update: { sendDay: day, sendTime: time, recipientUserIds: recipients },
    create: { clientId: viewer.clientId, sendDay: day, sendTime: time, recipientUserIds: recipients },
  });
  revalidatePath("/reports", "layout");
}

export type WriteReportState = { error?: string | null };

/** "Write it now": the performance agent writes the latest closed week's or month's report. */
export async function writeReportNowAction(_prev: WriteReportState, formData: FormData): Promise<WriteReportState> {
  const viewer = await getPortalViewer();
  const { lastClosed, writeReport } = await import("@/lib/report-data");
  const kind = formData.get("kind") === "MONTHLY" ? "MONTHLY" : "WEEKLY";
  const r = await writeReport(viewer.clientId, lastClosed(kind));
  if (!r.ok) return { error: r.error };
  revalidatePath("/reports", "layout");
  return { error: null };
}
