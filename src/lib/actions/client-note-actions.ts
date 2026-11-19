"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addToNextReview, archiveNote, bookCheckIn, createNote, markReminderDone, saveProfile, setCheckInStatus, setFavourite, setPinned, setRead, setSatisfaction, type KeyDate, type ProfileLink, type Read } from "@/lib/client-notes";

/**
 * Phase T2: the client page's notes, profile and relationship actions. Each one goes through lib/client-notes.ts,
 * which checks for an Admin or Marketing PM before touching anything.
 */
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (clientId: string, path: string) => {
  revalidatePath(`/ops/clients/${clientId}`, "layout");
  return `/ops/clients/${clientId}/${path}`;
};

export async function createNoteAction(f: FormData) {
  const clientId = s(f, "clientId");
  const remind = s(f, "remindAt");
  const duration = Number(s(f, "durationMin"));
  const note = await createNote(clientId, {
    kind: s(f, "kind") || "note",
    text: s(f, "text"),
    tags: s(f, "tags").split(",").filter(Boolean),
    projectId: s(f, "projectId") || null,
    pin: f.get("pin") === "on",
    remindAt: f.get("remind") === "on" && /^\d{4}-\d{2}-\d{2}$/.test(remind) ? new Date(`${remind}T08:00:00`) : null,
    durationMin: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    kickoff: f.get("kickoff") === "on",
  });
  redirect(`${back(clientId, s(f, "back") || "notes")}${note ? `#note-${note.id}` : "?error=Write+something+first"}`);
}

export async function pinNoteAction(f: FormData) {
  const clientId = s(f, "clientId");
  await setPinned(clientId, s(f, "noteId"), s(f, "pin") === "1");
  redirect(back(clientId, s(f, "back") || "notes"));
}

export async function archiveNoteAction(f: FormData) {
  const clientId = s(f, "clientId");
  await archiveNote(clientId, s(f, "noteId"));
  redirect(back(clientId, "notes"));
}

export async function reminderDoneAction(f: FormData) {
  await markReminderDone(s(f, "noteId"));
  revalidatePath("/ops");
}

export async function saveProfileAction(f: FormData) {
  const clientId = s(f, "clientId");
  const keyDates: KeyDate[] = s(f, "keyDates")
    .split("\n")
    .map((line) => line.match(/^\s*(\d{4}-\d{2}-\d{2})\s+(.+)$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ date: m[1], name: m[2].trim() }));
  const links: ProfileLink[] = s(f, "links")
    .split("\n")
    .map((line) => line.match(/^\s*(.+?)\s+(https?:\/\/\S+)\s*$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ label: m[1], url: m[2] }));
  await saveProfile(clientId, {
    goal: s(f, "goal"),
    measures: s(f, "measures"),
    keyDates,
    markets: s(f, "markets"),
    preferences: { tone: s(f, "tone") || undefined, contact: s(f, "contact") || undefined, decisionDay: s(f, "decisionDay") || undefined },
    tools: s(f, "tools"),
    links,
    cameFrom: s(f, "cameFrom"),
  });
  redirect(back(clientId, s(f, "back") || "notes"));
}

export async function setReadAction(f: FormData) {
  const clientId = s(f, "clientId");
  const r = await setRead(clientId, s(f, "read") as Read, s(f, "reason"));
  redirect(`${back(clientId, "notes")}${"error" in r && r.error ? `?read=at_risk&error=${encodeURIComponent(r.error)}` : ""}`);
}

export async function setSatisfactionAction(f: FormData) {
  const clientId = s(f, "clientId");
  await setSatisfaction(clientId, Number(s(f, "rating")));
  redirect(back(clientId, "notes"));
}

export async function setFavouriteAction(f: FormData) {
  const clientId = s(f, "clientId");
  await setFavourite(clientId, s(f, "userId"), s(f, "favourite") === "1");
  redirect(back(clientId, "notes"));
}

export async function bookCheckInAction(f: FormData) {
  const clientId = s(f, "clientId");
  const at = s(f, "at");
  await bookCheckIn(clientId, new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) ? at : `${at}T10:00`), s(f, "kind") || "monthly review");
  redirect(back(clientId, s(f, "back") || "notes"));
}

export async function checkInDoneAction(f: FormData) {
  const clientId = s(f, "clientId");
  await setCheckInStatus(clientId, s(f, "checkInId"), s(f, "status") === "cancelled" ? "cancelled" : "done");
  redirect(back(clientId, s(f, "back") || "notes"));
}

export async function addToNextReviewAction(f: FormData) {
  const clientId = s(f, "clientId");
  await addToNextReview(clientId, s(f, "text"));
  redirect(`${back(clientId, "credits")}?added=1`);
}
