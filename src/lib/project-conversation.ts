import { prisma } from "@/lib/prisma";
import type { PortalViewer } from "@/lib/brief-intake";
import { listInternalMessages, countUnreadInternal } from "@/lib/internal-messages";
import { INTERNAL_ROLE_LABEL } from "@/lib/labels";

export type ChatMessage = {
  id: string;
  kind: "MESSAGE" | "SYSTEM";
  body: string;
  createdAt: string;
  /** Stable per sender, so consecutive messages can be grouped under one header. */
  authorKey: string;
  authorName: string;
  authorRole: string | null;
  mine: boolean;
  fromKlingit: boolean;
  context?: { label: string; href: string };
};

export type ConversationParticipant = { name: string };

export type ProjectConversation = {
  klingit: ChatMessage[];
  internal: ChatMessage[];
  unread: { klingit: number; internal: number };
  participants: ConversationParticipant[];
  hints: { klingit: string; internal: string };
  placeholders: { klingit: string; internal: string };
};

function contextHref(projectId: string, kind: string | null, ref: string | null) {
  const base = `/projects/${projectId}`;
  if (kind === "asset" && ref) return `${base}/work?asset=${ref}`;
  if (kind === "estimate_line" || kind === "estimate") return `${base}/scope#estimate`;
  if (kind === "brief") return `${base}/scope`;
  return base;
}

function firstName(name: string) {
  return name.split(" ")[0];
}

/**
 * Data for the client ConversationPanel: the shared "With Klingit" thread
 * (messages + system events) and the client-only "Internal" channel.
 */
export async function loadProjectConversation(
  projectId: string,
  viewer: PortalViewer,
  team: { name: string }[] = []
): Promise<ProjectConversation> {
  const [comments, internal, reads, client] = await Promise.all([
    prisma.comment.findMany({
      where: { projectId, archivedAt: null, project: { clientId: viewer.clientId } },
      include: { author: { include: { staffMember: true } }, clientAuthor: { include: { user: true } }, asset: true },
      orderBy: { createdAt: "asc" },
    }),
    listInternalMessages(projectId),
    prisma.projectChannelRead.findMany({ where: { clientUserId: viewer.id, projectId } }),
    prisma.client.findUnique({ where: { id: viewer.clientId }, include: { accountLead: { include: { user: true } } } }),
  ]);
  const readAt = (channel: "KLINGIT" | "INTERNAL") => reads.find((r) => r.channel === channel)?.lastReadAt ?? null;
  const klingitReadAt = readAt("KLINGIT");

  const klingit: ChatMessage[] = comments.map((c) => {
    const isStaff = !c.authorClientUserId && Boolean(c.author);
    const contextLabel = c.contextLabel ?? (c.asset ? c.asset.name : null);
    const contextKind = c.contextKind ?? (c.asset ? "asset" : null);
    const contextRef = c.contextRef ?? c.assetId;
    return {
      id: c.id,
      kind: c.kind,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      authorKey: c.authorClientUserId ?? c.authorUserId ?? "klingit",
      authorName: c.clientAuthor?.user.name ?? c.author?.name ?? "Klingit",
      authorRole: isStaff
        ? c.author?.staffMember
          ? INTERNAL_ROLE_LABEL[c.author.staffMember.title]
          : null
        : (c.clientAuthor?.jobTitle ?? null),
      mine: c.authorClientUserId === viewer.id,
      fromKlingit: !c.authorClientUserId,
      ...(contextLabel ? { context: { label: contextLabel, href: contextHref(projectId, contextKind, contextRef) } } : {}),
    };
  });

  const lead = client?.accountLead?.user.name ?? null;
  const clientName = client?.name ?? "your company";
  const teamNames = team.map((m) => firstName(m.name));
  const readers = [...teamNames, ...(lead ? [`${lead} (account lead)`] : [])];
  const klingitHint = teamNames.length
    ? `${readers.length > 1 ? `${readers.slice(0, -1).join(", ")} and ${readers.at(-1)} see` : `${readers[0]} sees`} this thread.`
    : lead
      ? `${lead} (your account lead) and the Klingit team see this thread.`
      : "Your Klingit team sees this thread.";

  const participants: ConversationParticipant[] = [
    ...(lead ? [{ name: lead }] : []),
    ...team.filter((m) => m.name !== lead),
    { name: viewer.user.name },
  ];

  return {
    klingit,
    internal: internal.map((m) => ({
      id: m.id,
      kind: "MESSAGE" as const,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      authorKey: m.authorClientUserId,
      authorName: m.authorName,
      authorRole: m.authorRole,
      mine: m.authorClientUserId === viewer.id,
      fromKlingit: false,
    })),
    unread: {
      klingit: comments.filter(
        (c) =>
          c.kind === "MESSAGE" &&
          c.authorClientUserId !== viewer.id &&
          (!klingitReadAt || c.createdAt > klingitReadAt)
      ).length,
      internal: await countUnreadInternal(projectId, viewer.id, readAt("INTERNAL")),
    },
    participants,
    hints: {
      klingit: klingitHint,
      internal: `Only people at ${clientName} can see this. Klingit cannot read it.`,
    },
    placeholders: {
      klingit: "Message Klingit about this project…",
      internal: `Message your ${clientName} team…`,
    },
  };
}
