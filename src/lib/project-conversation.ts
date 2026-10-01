import { prisma } from "@/lib/prisma";
import type { PortalViewer } from "@/lib/brief-intake";
import { listInternalMessages, countUnreadInternal } from "@/lib/internal-messages";

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  mine: boolean;
  fromKlingit: boolean;
  context?: string;
};

export type ProjectConversation = {
  klingit: ChatMessage[];
  internal: ChatMessage[];
  unread: { klingit: number; internal: number };
};

/** Sidebar data: the shared "With Klingit" thread plus the client-only "Internal" channel. */
export async function loadProjectConversation(projectId: string, viewer: PortalViewer): Promise<ProjectConversation> {
  const [comments, internal, reads] = await Promise.all([
    prisma.comment.findMany({
      where: { projectId, archivedAt: null, project: { clientId: viewer.clientId } },
      include: { author: true, clientAuthor: { include: { user: true } }, asset: true },
      orderBy: { createdAt: "asc" },
    }),
    listInternalMessages(projectId),
    prisma.projectChannelRead.findMany({ where: { clientUserId: viewer.id, projectId } }),
  ]);
  const readAt = (channel: "KLINGIT" | "INTERNAL") => reads.find((r) => r.channel === channel)?.lastReadAt ?? null;
  const klingitReadAt = readAt("KLINGIT");

  const klingit: ChatMessage[] = comments.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    authorName: c.clientAuthor?.user.name ?? c.author?.name ?? "Klingit",
    mine: c.authorClientUserId === viewer.id,
    fromKlingit: !c.authorClientUserId,
    ...(c.asset ? { context: `On ${c.asset.name}` } : {}),
  }));

  return {
    klingit,
    internal: internal.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      authorName: m.authorName,
      mine: m.authorClientUserId === viewer.id,
      fromKlingit: false,
    })),
    unread: {
      klingit: comments.filter(
        (c) => c.authorClientUserId !== viewer.id && (!klingitReadAt || c.createdAt > klingitReadAt)
      ).length,
      internal: await countUnreadInternal(projectId, viewer.id, readAt("INTERNAL")),
    },
  };
}
