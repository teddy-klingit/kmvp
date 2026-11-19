import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";
import { jsonArray } from "@/lib/utils";
import { notify } from "@/lib/notifier";
import { mirrorClientNoteToProject } from "@/lib/staff-notes";

/**
 * Phase T2: what the PM knows about a client — the account log (notes, calls, meetings, decisions, risks), the client
 * profile, the relationship (check-ins, "your read", satisfaction) and the Klingit team on the client.
 *
 * Staff only. This is the ONLY module allowed to query ClientNote, ClientProfile and ClientCheckIn (a test fails if any
 * other file does), and every function here checks for a Klingit staff session (Admin or Marketing PM) before any
 * query runs: a client session is redirected away, a creative gets ForbiddenError.
 */
export const NOTE_KINDS = ["note", "call", "meeting", "decision", "risk"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export const READS = ["happy", "neutral", "at_risk"] as const;
export type Read = (typeof READS)[number];

const DAY = 86400000;
const gate = () => requireOpsRole(["ADMIN", "PM"]);
const isKind = (k: string): k is NoteKind => (NOTE_KINDS as readonly string[]).includes(k);

export type KeyDate = { name: string; date: string };
export type Preferences = { tone?: string; contact?: string; decisionDay?: string };
export type ProfileLink = { label: string; url: string };

// ─── The account log ──────────────────────────────────────────────────────────────────────────────────────────

export async function listNotes(clientId: string, opts: { kind?: string | null; take?: number } = {}) {
  await gate();
  const notes = await prisma.clientNote.findMany({
    where: { clientId, archivedAt: null, ...(opts.kind && isKind(opts.kind) ? { kind: opts.kind } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 200,
  });
  return withNames(notes);
}

export async function pinnedNotes(clientId: string) {
  await gate();
  return withNames(await prisma.clientNote.findMany({ where: { clientId, archivedAt: null, pinnedAt: { not: null } }, orderBy: { pinnedAt: "desc" }, take: 3 }));
}

export async function noteCount(clientId: string) {
  await gate();
  return prisma.clientNote.count({ where: { clientId, archivedAt: null } });
}

async function withNames<T extends { authorUserId: string; projectId: string | null }>(notes: T[]) {
  const [users, projects] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(notes.map((n) => n.authorUserId))] } }, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { id: { in: notes.map((n) => n.projectId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
  ]);
  return notes.map((n) => ({ ...n, author: shortName(users.find((u) => u.id === n.authorUserId)?.name ?? "Klingit"), project: (() => { const p = projects.find((x) => x.id === n.projectId); return p ? { id: p.id, title: p.name } : null; })() }));
}

/** "Teddy Wold" → "Teddy W." */
export const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};

export type NoteInput = {
  kind: string;
  text: string;
  title?: string | null;
  tags?: string[];
  projectId?: string | null;
  pin?: boolean;
  remindAt?: Date | null;
  durationMin?: number | null;
  kickoff?: boolean;
  checkInId?: string | null;
};

/** The title is the first line (or first sentence) of the text, the body the rest — unless a title is given. */
export function splitNote(text: string, title?: string | null) {
  const t = text.trim();
  if (title?.trim()) return { title: title.trim().slice(0, 160), body: t };
  const [first, ...rest] = t.split(/\n+/);
  if (rest.length) return { title: first.trim().slice(0, 160), body: rest.join("\n").trim() };
  const m = first.match(/^(.{8,140}?[.!?])\s+([\s\S]+)$/);
  return m ? { title: m[1].replace(/[.]$/, ""), body: m[2].trim() } : { title: first.slice(0, 160), body: "" };
}

/** @mentions: "@Priya" or "@Priya K" → staff user ids, matched on first name (and last initial when given). */
export async function mentionedStaff(text: string) {
  const handles = [...text.matchAll(/@([A-ZÅÄÖ][\wåäöé-]+)(?:\s([A-ZÅÄÖ])\.?)?/g)].map((m) => ({ first: m[1].toLowerCase(), initial: m[2]?.toLowerCase() ?? null }));
  if (!handles.length) return [];
  const staff = await prisma.staffMember.findMany({ select: { userId: true, user: { select: { name: true } } } });
  const ids = new Set<string>();
  for (const h of handles) {
    const hit = staff.filter((s) => {
      const [first, ...rest] = s.user.name.toLowerCase().split(/\s+/);
      return first === h.first && (!h.initial || rest.at(-1)?.startsWith(h.initial));
    });
    if (hit.length === 1) ids.add(hit[0].userId);
  }
  return [...ids];
}

export async function createNote(clientId: string, input: NoteInput) {
  const viewer = await gate();
  const kind: NoteKind = isKind(input.kind) ? input.kind : "note";
  const { title, body } = splitNote(input.text, input.title);
  if (!title) return null;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) return null;
  const project = input.projectId ? await prisma.project.findFirst({ where: { id: input.projectId, clientId }, select: { id: true, name: true } }) : null;
  const mentions = (await mentionedStaff(input.text)).filter((id) => id !== viewer.userId);
  const note = await prisma.clientNote.create({
    data: {
      clientId,
      authorUserId: viewer.userId,
      kind,
      title,
      body,
      tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 6),
      projectId: project?.id ?? null,
      mentions,
      pinnedAt: input.pin ? new Date() : null,
      remindAt: input.remindAt ?? null,
      durationMin: kind === "call" ? (input.durationMin ?? null) : null,
      kickoff: (kind === "call" || kind === "meeting") && Boolean(input.kickoff),
      checkInId: input.checkInId ?? null,
    },
  });
  if (input.pin) await keepThreePinned(clientId);
  // A note linked to a project also shows in that project's staff discussion (never the client's view).
  if (project) await mirrorClientNoteToProject(project.id, viewer.userId, `${KIND_LABEL[kind]}: ${title}${body ? `\n${body}` : ""}`);
  for (const userId of mentions) {
    await notify({ userId, clientId, type: "COMMENT", title: `${shortName(viewer.user.name)} mentioned you in a ${client.name} note`, body: title, actionUrl: `/ops/clients/${clientId}/notes#note-${note.id}`, actionLabel: "Open note" });
  }
  return note;
}

export const KIND_LABEL: Record<NoteKind, string> = { note: "Note", call: "Call", meeting: "Meeting", decision: "Decision", risk: "Risk" };

async function keepThreePinned(clientId: string) {
  const pinned = await prisma.clientNote.findMany({ where: { clientId, archivedAt: null, pinnedAt: { not: null } }, orderBy: { pinnedAt: "desc" }, select: { id: true } });
  if (pinned.length > 3) await prisma.clientNote.updateMany({ where: { id: { in: pinned.slice(3).map((p) => p.id) } }, data: { pinnedAt: null } });
}

export async function setPinned(clientId: string, noteId: string, pin: boolean) {
  await gate();
  await prisma.clientNote.updateMany({ where: { id: noteId, clientId }, data: { pinnedAt: pin ? new Date() : null } });
  if (pin) await keepThreePinned(clientId);
}

/** Kept, never deleted: archived notes leave the log. */
export async function archiveNote(clientId: string, noteId: string) {
  await gate();
  await prisma.clientNote.updateMany({ where: { id: noteId, clientId }, data: { archivedAt: new Date() } });
}

/** "Remind me" notes due on or before a day, for one staff member's Today. */
export async function remindersFor(userId: string, upTo: Date) {
  await gate();
  return prisma.clientNote.findMany({ where: { authorUserId: userId, archivedAt: null, remindDoneAt: null, remindAt: { lte: upTo } }, include: { client: { select: { id: true, name: true } } }, orderBy: { remindAt: "asc" } });
}

export async function markReminderDone(noteId: string) {
  const viewer = await gate();
  await prisma.clientNote.updateMany({ where: { id: noteId, authorUserId: viewer.userId }, data: { remindDoneAt: new Date() } });
}

// ─── The client profile ───────────────────────────────────────────────────────────────────────────────────────

export async function getProfile(clientId: string) {
  await gate();
  const p = await prisma.clientProfile.findUnique({ where: { clientId } });
  return p
    ? { ...p, keyDates: jsonArray<KeyDate>(p.keyDates), links: jsonArray<ProfileLink>(p.links), favourites: jsonArray<string>(p.favourites), preferences: (p.preferences ?? {}) as Preferences }
    : null;
}
export type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

export type ProfileInput = { goal?: string | null; measures?: string | null; keyDates?: KeyDate[]; markets?: string | null; preferences?: Preferences; tools?: string | null; links?: ProfileLink[]; cameFrom?: string | null; clientSince?: Date | null };

/** Saves the profile; its key dates become this client's own key moments in the Planner. */
export async function saveProfile(clientId: string, input: ProfileInput) {
  const viewer = await gate();
  const clean = (s: string | null | undefined) => (s?.trim() ? s.trim().slice(0, 600) : null);
  const keyDates = (input.keyDates ?? []).filter((k) => k.name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(k.date)).slice(0, 12);
  const links = (input.links ?? []).filter((l) => l.label.trim() && /^https?:\/\//.test(l.url)).slice(0, 8);
  const data = {
    goal: clean(input.goal),
    measures: clean(input.measures),
    keyDates,
    markets: clean(input.markets),
    preferences: input.preferences ?? {},
    tools: clean(input.tools),
    links,
    cameFrom: clean(input.cameFrom),
    ...(input.clientSince !== undefined ? { clientSince: input.clientSince } : {}),
    updatedByUserId: viewer.userId,
  };
  await prisma.clientProfile.upsert({ where: { clientId }, update: data, create: { clientId, ...data } });
  // Key dates feed the Planner as this client's key moments (replaced on every save).
  const markets = (input.markets ?? "").toUpperCase().match(/\b(SE|NO|DK|FI)\b/g) ?? [];
  await prisma.keyMoment.deleteMany({ where: { clientId } });
  if (keyDates.length) await prisma.keyMoment.createMany({ data: keyDates.map((k) => ({ clientId, name: k.name.trim().slice(0, 80), date: new Date(`${k.date}T09:00:00Z`), markets: [...new Set(markets)], kind: "client" })) });
}

// ─── The relationship ─────────────────────────────────────────────────────────────────────────────────────────

/** "Your read": Happy / Neutral / At risk. At risk needs a reason, kept as a Risk note. */
export async function setRead(clientId: string, read: Read, reason?: string | null) {
  const viewer = await gate();
  if (!(READS as readonly string[]).includes(read)) return { error: "Pick Happy, Neutral or At risk." };
  if (read === "at_risk" && !reason?.trim()) return { error: "Say why it's at risk: it goes in the account log." };
  const note = read === "at_risk" ? await createNote(clientId, { kind: "risk", text: reason!.trim(), title: "Marked at risk" }) : null;
  await prisma.clientProfile.upsert({
    where: { clientId },
    update: { read, readAt: new Date(), readByUserId: viewer.userId, readNoteId: note?.id ?? null },
    create: { clientId, read, readAt: new Date(), readByUserId: viewer.userId, readNoteId: note?.id ?? null },
  });
  return { ok: true };
}

export async function setSatisfaction(clientId: string, rating: number, at = new Date()) {
  await gate();
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) return;
  await prisma.clientProfile.upsert({ where: { clientId }, update: { satisfaction: rating, satisfactionAt: at }, create: { clientId, satisfaction: rating, satisfactionAt: at } });
}

export async function setFavourite(clientId: string, staffUserId: string, favourite: boolean) {
  await gate();
  const p = await prisma.clientProfile.findUnique({ where: { clientId }, select: { favourites: true } });
  const now = new Set(jsonArray<string>(p?.favourites));
  if (favourite) now.add(staffUserId);
  else now.delete(staffUserId);
  await prisma.clientProfile.upsert({ where: { clientId }, update: { favourites: [...now] }, create: { clientId, favourites: [...now] } });
}

export async function bookCheckIn(clientId: string, at: Date, kind = "monthly review") {
  const viewer = await gate();
  if (Number.isNaN(at.getTime())) return null;
  return prisma.clientCheckIn.create({ data: { clientId, at, kind: kind.slice(0, 40), bookedByUserId: viewer.userId } });
}

export async function setCheckInStatus(clientId: string, id: string, status: "done" | "cancelled") {
  await gate();
  await prisma.clientCheckIn.updateMany({ where: { id, clientId }, data: { status } });
}

export async function checkIns(clientId: string, now = new Date()) {
  await gate();
  const [next, last] = await Promise.all([
    prisma.clientCheckIn.findFirst({ where: { clientId, status: "booked", at: { gte: new Date(now.getTime() - DAY / 2) } }, orderBy: { at: "asc" } }),
    prisma.clientCheckIn.findFirst({ where: { clientId, OR: [{ status: "done" }, { status: "booked", at: { lt: new Date(now.getTime() - DAY / 2) } }] }, orderBy: { at: "desc" } }),
  ]);
  return { next, last };
}

/** Booked check-ins happening tomorrow (or today), for the PMs' Today: the task lands the day before. */
export async function checkInsDueFor(clientIds: string[], now = new Date()) {
  await gate();
  if (!clientIds.length) return [];
  return prisma.clientCheckIn.findMany({ where: { clientId: { in: clientIds }, status: "booked", at: { gte: new Date(now.getTime() - DAY / 2), lte: new Date(now.getTime() + 2 * DAY) } }, include: { client: { select: { id: true, name: true } } }, orderBy: { at: "asc" } });
}

/** "Add to next review": a note linked to the next booked check-in (one is booked a month out if none is). */
export async function addToNextReview(clientId: string, text: string) {
  await gate();
  let { next } = await checkIns(clientId);
  if (!next) next = await bookCheckIn(clientId, new Date(Date.now() + 28 * DAY), "monthly review");
  return createNote(clientId, { kind: "note", text, tags: ["Next review"], checkInId: next?.id ?? null });
}

/** The PM's read for the Clients list and Admin: every client marked at risk, with the reason. */
export async function readsFor(clientIds: string[]) {
  await gate();
  if (!clientIds.length) return new Map<string, { read: string | null; reason: string | null }>();
  const rows = await prisma.clientProfile.findMany({ where: { clientId: { in: clientIds } }, select: { clientId: true, read: true, readNoteId: true } });
  const reasons = await prisma.clientNote.findMany({ where: { id: { in: rows.map((r) => r.readNoteId).filter((x): x is string => Boolean(x)) } }, select: { id: true, body: true, title: true } });
  return new Map(rows.map((r) => [r.clientId, { read: r.read, reason: (() => { const n = reasons.find((x) => x.id === r.readNoteId); return n ? n.body || n.title : null; })() }]));
}

/** Whether a kick-off Call or Meeting has been logged (ticks the onboarding step). */
export async function kickoffLogged(clientId: string) {
  await gate();
  return (await prisma.clientNote.count({ where: { clientId, archivedAt: null, kickoff: true } })) > 0;
}

// ─── The Klingit team on the client ───────────────────────────────────────────────────────────────────────────

export async function klingitTeam(clientId: string) {
  await gate();
  const [client, members, profile] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { accountLead: { select: { userId: true, title: true, user: { select: { name: true } } } }, contracts: { where: { status: { in: ["active", "scheduled", "paused", "ending"] } }, orderBy: { startDate: "desc" }, take: 1, select: { contact: { select: { userId: true, title: true, user: { select: { name: true } } } } } } } }),
    prisma.teamMember.findMany({ where: { team: { project: { clientId } } }, select: { roleOnProject: true, team: { select: { project: { select: { status: true } } } }, staffMember: { select: { userId: true, title: true, user: { select: { name: true } } } } } }),
    prisma.clientProfile.findUnique({ where: { clientId }, select: { favourites: true } }),
  ]);
  const pm = client?.contracts[0]?.contact ?? client?.accountLead ?? null;
  const favourites = new Set(jsonArray<string>(profile?.favourites));
  const byUser = new Map<string, { userId: string; name: string; role: string; projects: number; active: number }>();
  for (const m of members) {
    if (pm && m.staffMember.userId === pm.userId) continue;
    const x = byUser.get(m.staffMember.userId) ?? { userId: m.staffMember.userId, name: m.staffMember.user.name, role: m.roleOnProject, projects: 0, active: 0 };
    x.projects += 1;
    if (!["DELIVERED", "ARCHIVED", "CANCELLED", "DRAFT"].includes(m.team.project.status)) x.active += 1;
    byUser.set(m.staffMember.userId, x);
  }
  return {
    pm: pm ? { userId: pm.userId, name: pm.user.name } : null,
    creatives: [...byUser.values()].sort((a, b) => b.projects - a.projects).map((c) => ({ ...c, favourite: favourites.has(c.userId) })),
  };
}
