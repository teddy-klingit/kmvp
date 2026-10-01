"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { CONNECTABLE_APPS, DEMO_FILES, SOURCE_SECTIONS, detectApp, normaliseUrl, titleFromUrl, type SourceApp } from "@/lib/brand-sources";

export type SourceState = { error?: string; ok?: string };

function revalidate() {
  revalidatePath("/assets", "layout");
}

const validSection = (s: FormDataEntryValue | null) => {
  const v = s ? String(s) : "";
  return SOURCE_SECTIONS.some((x) => x.slug === v) ? v : null;
};

/** Demo connect: records the connection and the files the client picked from the demo list. Nothing is synced. */
export async function connectDemoAppAction(_prev: SourceState, formData: FormData): Promise<SourceState> {
  const viewer = await getPortalViewer();
  const app = String(formData.get("app") ?? "") as SourceApp;
  if (!CONNECTABLE_APPS.some((a) => a.key === app)) return { error: "Unknown app." };
  const picked = formData.getAll("file").map(String);
  const files = DEMO_FILES[app as Exclude<SourceApp, "web">].filter((f) => picked.includes(f.key));

  await prisma.brandConnection.upsert({
    where: { clientId_app: { clientId: viewer.clientId, app } },
    update: { status: "CONNECTED", connectedAt: new Date(), isDemo: true },
    create: { clientId: viewer.clientId, app, status: "CONNECTED", connectedAt: new Date(), isDemo: true },
  });
  for (const f of files) {
    const exists = await prisma.brandSource.findFirst({ where: { clientId: viewer.clientId, app, title: f.title, section: null, archivedAt: null } });
    if (!exists) {
      await prisma.brandSource.create({ data: { clientId: viewer.clientId, app, url: f.url, title: f.title, isDemo: true, createdByUserId: viewer.userId } });
    }
  }
  revalidate();
  return { ok: `${files.length} file${files.length === 1 ? "" : "s"} linked` };
}

export async function disconnectAppAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const app = String(formData.get("app") ?? "");
  await prisma.brandConnection.updateMany({ where: { clientId: viewer.clientId, app }, data: { status: "DISCONNECTED" } });
  revalidate();
}

/** A real link: any http(s) URL. The app is detected from the domain. */
export async function addSourceLinkAction(_prev: SourceState, formData: FormData): Promise<SourceState> {
  const viewer = await getPortalViewer();
  const url = normaliseUrl(String(formData.get("url") ?? ""));
  if (!url) return { error: "That doesn't look like a link. Paste a full address, e.g. https://www.figma.com/file/…" };
  const title = String(formData.get("title") ?? "").trim().slice(0, 120) || titleFromUrl(url);
  const section = validSection(formData.get("section"));
  await prisma.brandSource.create({
    data: { clientId: viewer.clientId, app: detectApp(url), url, title, section, isDemo: false, createdByUserId: viewer.userId },
  });
  revalidate();
  return { ok: "Link added" };
}

/** Pin a demo file of a connected app to a Brand OS section. */
export async function addSourceFromAppAction(_prev: SourceState, formData: FormData): Promise<SourceState> {
  const viewer = await getPortalViewer();
  const app = String(formData.get("app") ?? "") as SourceApp;
  const fileKey = String(formData.get("file") ?? "");
  const section = validSection(formData.get("section"));
  const connected = await prisma.brandConnection.findFirst({ where: { clientId: viewer.clientId, app, status: "CONNECTED" } });
  if (!connected) return { error: "Connect that app first." };
  const file = DEMO_FILES[app as Exclude<SourceApp, "web">]?.find((f) => f.key === fileKey);
  if (!file) return { error: "That file isn't available." };
  await prisma.brandSource.create({ data: { clientId: viewer.clientId, app, url: file.url, title: file.title, section, isDemo: true, createdByUserId: viewer.userId } });
  revalidate();
  return { ok: "Source added" };
}

/** Removing a chip archives the source (never deletes). Only the owning client's sources can be touched. */
export async function removeSourceAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const id = String(formData.get("sourceId") ?? "");
  await prisma.brandSource.updateMany({ where: { id, clientId: viewer.clientId, archivedAt: null }, data: { archivedAt: new Date() } });
  revalidate();
}
