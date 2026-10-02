"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PLATFORM_SECTIONS } from "@/lib/brand-completeness";
import { draftSections } from "@/lib/brand-drafts";

export type DraftState = { error?: string | null };

function revalidateBrand() {
  revalidatePath("/assets", "layout");
}

/** Overview: "Draft with AI" for every empty section. */
export async function draftEmptySectionsAction(_prev: DraftState, _fd: FormData): Promise<DraftState> {
  const viewer = await getPortalViewer();
  const r = await draftSections(viewer.clientId);
  if (!r.error) revalidateBrand();
  return r;
}

/** Section page: "Rewrite with AI" for this one section, written or not. */
export async function rewriteSectionAction(_prev: DraftState, fd: FormData): Promise<DraftState> {
  const viewer = await getPortalViewer();
  const section = String(fd.get("section") ?? "");
  if (!PLATFORM_SECTIONS.some((s) => s.slug === section)) return { error: "Unknown section." };
  const r = await draftSections(viewer.clientId, [section]);
  if (!r.error) revalidateBrand();
  return r;
}

/** "Discard draft". Scoped to the signed-in client. */
export async function discardDraftAction(fd: FormData) {
  const viewer = await getPortalViewer();
  await prisma.brandSectionDraft.updateMany({ where: { id: String(fd.get("draftId") ?? ""), clientId: viewer.clientId, status: "PENDING" }, data: { status: "DISCARDED", resolvedAt: new Date() } });
  revalidateBrand();
}
