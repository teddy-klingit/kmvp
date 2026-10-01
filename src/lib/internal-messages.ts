import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere } from "@/lib/project-visibility";

/**
 * The ONLY module allowed to touch ClientInternalMessage. The "Internal"
 * channel belongs to the client's own org: Klingit staff — every role,
 * Admin included — get nothing back and can't post. Enforced here, server
 * side, from the session itself (not from anything the caller passes in).
 */
async function clientViewerFor(projectId: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENT") return null;

  const viewer = await prisma.clientUser.findUnique({ where: { userId: session.user.id } });
  if (!viewer) return null;

  const project = await prisma.project.findFirst({
    where: { id: projectId, clientId: viewer.clientId, ...projectVisibilityWhere(viewer.id) },
    select: { id: true, clientId: true },
  });
  return project ? { viewer, project } : null;
}

export type InternalMessage = {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string;
  authorRole: string | null;
  authorClientUserId: string;
};

export async function listInternalMessages(projectId: string): Promise<InternalMessage[]> {
  const access = await clientViewerFor(projectId);
  if (!access) return [];

  const rows = await prisma.clientInternalMessage.findMany({
    where: { projectId, clientId: access.viewer.clientId, archivedAt: null },
    include: { author: { include: { user: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    authorName: m.author.user.name,
    authorRole: m.author.jobTitle,
    authorClientUserId: m.authorClientUserId,
  }));
}

export async function createInternalMessage(projectId: string, body: string) {
  const access = await clientViewerFor(projectId);
  if (!access || !body.trim()) return null;

  return prisma.clientInternalMessage.create({
    data: {
      projectId,
      clientId: access.viewer.clientId,
      authorClientUserId: access.viewer.id,
      body: body.trim(),
    },
  });
}

/** Unread = teammates' internal messages since this user last opened the channel. */
export async function countUnreadInternal(projectId: string, clientUserId: string, since: Date | null) {
  const access = await clientViewerFor(projectId);
  if (!access || access.viewer.id !== clientUserId) return 0;
  return prisma.clientInternalMessage.count({
    where: {
      projectId,
      clientId: access.viewer.clientId,
      archivedAt: null,
      authorClientUserId: { not: clientUserId },
      ...(since ? { createdAt: { gt: since } } : {}),
    },
  });
}
