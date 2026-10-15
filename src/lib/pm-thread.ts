import { prisma } from "@/lib/prisma";
import { notify, notifyMany } from "@/lib/notifier";
import { marketingPm } from "@/lib/contact-person";
import { jsonArray } from "@/lib/utils";

/**
 * Message your PM (Phase U): one conversation per client with their Marketing PM. A general message is a
 * ClientMessage; a message "about" a project is that project's Comment, so it is said once and shows both here and
 * in the project's Discussion. The client's Internal channel is a different table and is never read here.
 */

export type Attachment = { name: string; storageKey: string; mimeType: string | null; size: number };
export type ThreadMessage = {
  id: string;
  source: "general" | "project";
  project: { id: string; name: string } | null;
  body: string;
  attachments: (Attachment & { href: string })[];
  authorName: string;
  fromKlingit: boolean;
  mine: boolean;
  createdAt: string;
};

const DAY = 86400000;
export const attachmentHref = (clientId: string, a: Attachment) => `/api/messages/${clientId}/${encodeURIComponent(a.storageKey.split("/").pop() ?? "")}`;

/** The whole thread (general + every project's messages), oldest first. */
export async function loadPmThread(clientId: string, viewerUserId: string, opts: { take?: number } = {}) {
  const take = opts.take ?? 300;
  const [general, project] = await Promise.all([
    prisma.clientMessage.findMany({ where: { clientId, archivedAt: null }, orderBy: { createdAt: "desc" }, take }),
    prisma.comment.findMany({
      where: { kind: "MESSAGE", archivedAt: null, project: { clientId, status: { not: "DRAFT" } } },
      include: { project: { select: { id: true, name: true } }, author: { select: { name: true } }, clientAuthor: { include: { user: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);
  const ids = [...new Set(general.flatMap((m) => [m.authorUserId, m.authorClientUserId]).filter((x): x is string => Boolean(x)))];
  const [users, clientUsers] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.clientUser.findMany({ where: { id: { in: ids } }, include: { user: { select: { id: true, name: true } } } }),
  ]);
  const att = (j: unknown) => jsonArray<Attachment>(j).map((a) => ({ ...a, href: attachmentHref(clientId, a) }));
  const out: ThreadMessage[] = [
    ...general.map((m) => {
      const cu = m.authorClientUserId ? clientUsers.find((c) => c.id === m.authorClientUserId) : null;
      const staff = !cu && m.authorUserId ? users.find((u) => u.id === m.authorUserId) : null;
      return { id: `g_${m.id}`, source: "general" as const, project: null, body: m.body, attachments: att(m.attachments), authorName: cu?.user.name ?? staff?.name ?? "Klingit", fromKlingit: !cu, mine: (cu?.user.id ?? m.authorUserId) === viewerUserId, createdAt: m.createdAt.toISOString() };
    }),
    ...project.map((c) => ({ id: `p_${c.id}`, source: "project" as const, project: c.project, body: c.body, attachments: att(c.attachments), authorName: c.clientAuthor?.user.name ?? c.author?.name ?? "Klingit", fromKlingit: !c.authorClientUserId, mine: (c.clientAuthor?.user.id ?? c.authorUserId) === viewerUserId, createdAt: c.createdAt.toISOString() })),
  ];
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-take);
}

/** "Usually replies within …", from real reply times over 90 days; null with fewer than 5 replies to go on. */
export function replyTime(thread: ThreadMessage[], now = new Date()) {
  const recent = thread.filter((m) => now.getTime() - Date.parse(m.createdAt) < 90 * DAY);
  const waits: number[] = [];
  for (let i = 0; i < recent.length; i++) {
    if (recent[i].fromKlingit || (i > 0 && !recent[i - 1].fromKlingit)) continue; // the start of a client turn
    const reply = recent.slice(i + 1).find((m) => m.fromKlingit);
    if (reply) waits.push((Date.parse(reply.createdAt) - Date.parse(recent[i].createdAt)) / 3600000);
  }
  if (waits.length < 5) return null;
  const median = waits.sort((a, b) => a - b)[Math.floor(waits.length / 2)];
  return median < 1 ? "within an hour" : median < 24 ? `within ${Math.ceil(median)} hours` : `within ${Math.ceil(median / 24)} days`;
}

/** Unread for one person: messages from the other side since they last read the thread. */
export async function pmUnread(clientId: string, userId: string, side: "client" | "staff") {
  const read = await prisma.pmThreadRead.findUnique({ where: { userId_clientId: { userId, clientId } } });
  const since = read?.lastReadAt ?? new Date(Date.now() - 30 * DAY);
  const fromOther = side === "client" ? { authorClientUserId: null } : { authorClientUserId: { not: null } };
  const [g, p] = await Promise.all([
    prisma.clientMessage.count({ where: { clientId, archivedAt: null, createdAt: { gt: since }, ...fromOther } }),
    prisma.comment.count({ where: { kind: "MESSAGE", archivedAt: null, createdAt: { gt: since }, project: { clientId, status: { not: "DRAFT" } }, ...fromOther, ...(side === "client" ? { authorUserId: { not: null } } : {}) } }),
  ]);
  return g + p;
}

export async function markPmRead(clientId: string, userId: string, at = new Date()) {
  await prisma.pmThreadRead.upsert({ where: { userId_clientId: { userId, clientId } }, update: { lastReadAt: at }, create: { userId, clientId, lastReadAt: at } });
}

/**
 * Sends one message, general or about a project (stored once). The other side is told in-app (and by email where
 * their notification settings say so): the client's Marketing PM, or the client's admins and the person who wrote last.
 */
export async function sendPmMessage(m: { clientId: string; author: { userId: string; clientUserId: string | null; name: string }; body: string; projectId?: string | null; attachments?: Attachment[] }) {
  const body = m.body.trim().slice(0, 4000);
  if (!body && !m.attachments?.length) throw new Error("Write a message first.");
  const staff = !m.author.clientUserId;
  let projectName: string | null = null;
  if (m.projectId) {
    const p = await prisma.project.findFirst({ where: { id: m.projectId, clientId: m.clientId }, select: { name: true } });
    if (!p) throw new Error("That project isn't this client's.");
    projectName = p.name;
    await prisma.comment.create({ data: { projectId: m.projectId, authorUserId: staff ? m.author.userId : null, authorClientUserId: m.author.clientUserId, body, attachments: m.attachments?.length ? m.attachments : undefined } });
  } else {
    await prisma.clientMessage.create({ data: { clientId: m.clientId, authorUserId: m.author.userId, authorClientUserId: m.author.clientUserId, body, attachments: m.attachments?.length ? m.attachments : undefined } });
  }
  await markPmRead(m.clientId, m.author.userId);
  const preview = `${body.slice(0, 160)}${body.length > 160 ? "…" : ""}`;
  if (!staff) {
    const pm = await marketingPm(m.clientId);
    if (pm) await notify({ userId: pm.userId, clientId: m.clientId, type: "SYSTEM", title: `${m.author.name.split(" ")[0]}${projectName ? ` about ${projectName}` : ""}`, body: preview, actionUrl: `/ops/clients/${m.clientId}/dashboard?message=1`, actionLabel: "Reply" });
  } else {
    const owners = await prisma.clientUser.findMany({ where: { clientId: m.clientId, permission: "OWNER" }, select: { userId: true } });
    const lastAuthor = await prisma.clientMessage.findFirst({ where: { clientId: m.clientId, authorClientUserId: { not: null } }, orderBy: { createdAt: "desc" }, select: { authorClientUserId: true } });
    const last = lastAuthor?.authorClientUserId ? await prisma.clientUser.findUnique({ where: { id: lastAuthor.authorClientUserId }, select: { userId: true } }) : null;
    const to = [...new Set([...owners.map((o) => o.userId), ...(last ? [last.userId] : [])])];
    await notifyMany(to.map((userId) => ({ userId, clientId: m.clientId, type: "SYSTEM" as const, title: `${m.author.name.split(" ")[0]}${projectName ? ` about ${projectName}` : ""}`, body: preview, actionUrl: "/dashboard?message=1", actionLabel: "Open" })));
  }
}
