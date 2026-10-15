"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { requireOpsRole } from "@/lib/authz";
import { loadPmThread, markPmRead, replyTime, sendPmMessage, type Attachment, type ThreadMessage } from "@/lib/pm-thread";
import { marketingPm } from "@/lib/contact-person";
import { saveUpload, rejectUpload } from "@/lib/uploads";
import { markTaskDone } from "@/lib/today-done";

/** The message panel (Phase U), for the client and for their PM. One thread per client; see pm-thread.ts. */

export type PanelData = {
  side: "client" | "staff";
  clientId: string;
  title: string;
  subtitle: string;
  initials: string;
  bookingUrl: string | null;
  thread: ThreadMessage[];
  projects: { id: string; name: string; active: boolean }[];
};

const initials = (n: string) =>
  n
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

async function projectsOf(clientId: string) {
  const ps = await prisma.project.findMany({ where: { clientId, status: { notIn: ["DRAFT"] } }, select: { id: true, name: true, status: true }, orderBy: { updatedAt: "desc" } });
  return ps.map((p) => ({ id: p.id, name: p.name, active: !["ARCHIVED", "DELIVERED"].includes(p.status) }));
}

async function files(clientId: string, formData: FormData): Promise<Attachment[] | { error: string }> {
  const out: Attachment[] = [];
  for (const f of formData.getAll("files").slice(0, 5)) {
    if (!(f instanceof File) || f.size === 0) continue;
    const bad = rejectUpload(f);
    if (bad) return { error: bad };
    const saved = await saveUpload(`messages-${clientId}`, f);
    out.push({ name: f.name, storageKey: saved.storageKey, mimeType: f.type || null, size: f.size });
  }
  return out;
}

export async function clientPanelAction(): Promise<PanelData> {
  const viewer = await getPortalViewer();
  const [pm, thread, projects] = await Promise.all([marketingPm(viewer.clientId), loadPmThread(viewer.clientId, viewer.userId), projectsOf(viewer.clientId)]);
  await markPmRead(viewer.clientId, viewer.userId);
  const reply = replyTime(thread);
  return {
    side: "client",
    clientId: viewer.clientId,
    title: pm?.name ?? "Klingit",
    subtitle: pm ? `Your Marketing PM${reply ? ` · usually replies ${reply}` : ""}` : "We'll connect you with your Marketing PM",
    initials: initials(pm?.name ?? "K"),
    bookingUrl: pm?.bookingUrl ?? null,
    thread,
    projects,
  };
}

export async function clientSendAction(formData: FormData): Promise<{ error?: string }> {
  const viewer = await getPortalViewer();
  const att = await files(viewer.clientId, formData);
  if ("error" in att) return att;
  try {
    await sendPmMessage({ clientId: viewer.clientId, author: { userId: viewer.userId, clientUserId: viewer.id, name: viewer.user.name }, body: String(formData.get("body") ?? ""), projectId: String(formData.get("projectId") ?? "") || null, attachments: att });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't send it." };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function staffPanelAction(clientId: string): Promise<PanelData> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true } });
  const [thread, projects] = await Promise.all([loadPmThread(clientId, viewer.userId), projectsOf(clientId)]);
  await markPmRead(clientId, viewer.userId);
  return { side: "staff", clientId, title: client.name, subtitle: "General and project messages · the client's Internal channel stays private", initials: initials(client.name), bookingUrl: null, thread, projects };
}

export async function staffSendAction(formData: FormData): Promise<{ error?: string }> {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const clientId = String(formData.get("clientId") ?? "");
  const att = await files(clientId, formData);
  if ("error" in att) return att;
  try {
    await sendPmMessage({ clientId, author: { userId: viewer.userId, clientUserId: null, name: viewer.user.name }, body: String(formData.get("body") ?? ""), projectId: String(formData.get("projectId") ?? "") || null, attachments: att });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't send it." };
  }
  // A reply clears "Reply to …" for the general thread on Today.
  await markTaskDone(viewer.id, { key: `MESSAGE:general:${clientId}`, label: `Replied to ${(await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }))?.name ?? "the client"}`, clientId }, "acted");
  revalidatePath("/ops", "layout");
  return {};
}

/** A PM's "Book a call" link, shown in their clients' message panel. Only http(s) links. */
export async function saveBookingUrlAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const raw = String(formData.get("bookingUrl") ?? "").trim();
  const url = raw && /^https?:\/\//i.test(raw) ? raw.slice(0, 500) : null;
  await prisma.staffMember.update({ where: { id: viewer.id }, data: { bookingUrl: url } });
  revalidatePath("/ops/account");
}
