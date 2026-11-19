import { prisma } from "@/lib/prisma";
import { getOpsViewer } from "@/lib/current-viewer";

/**
 * Staff notes: Klingit-only, never visible to clients.
 *
 * This is the ONLY module allowed to query `ProjectStaffNote` (a test fails if any other file does),
 * and every function here requires a Klingit staff session first — a client session is redirected
 * away before any query runs.
 */
export async function listStaffNotes(projectId: string) {
  await getOpsViewer();
  return prisma.projectStaffNote.findMany({
    where: { projectId, archivedAt: null },
    include: { author: { include: { staffMember: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createStaffNote(projectId: string, body: string) {
  const viewer = await getOpsViewer();
  const text = body.trim().slice(0, 4000);
  if (!text) return null;
  const project = await prisma.project.findFirst({ where: { id: projectId, status: { not: "DRAFT" } }, select: { id: true } });
  if (!project) return null;
  return prisma.projectStaffNote.create({ data: { projectId, authorUserId: viewer.userId, body: text } });
}

/**
 * Phase T2: a client note linked to a project also shows in that project's staff discussion. Called only from
 * lib/client-notes.ts, after its staff check.
 */
export async function mirrorClientNoteToProject(projectId: string, authorUserId: string, body: string) {
  await getOpsViewer();
  const text = body.trim().slice(0, 4000);
  if (!text) return null;
  return prisma.projectStaffNote.create({ data: { projectId, authorUserId, body: text } });
}
