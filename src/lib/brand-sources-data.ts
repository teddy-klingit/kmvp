import { prisma } from "@/lib/prisma";
import { appMeta, sectionLabel, DEMO_FILES, type SourceApp } from "@/lib/brand-sources";

/** Every read is scoped to one client: callers pass the signed-in viewer's clientId, never one from a form. */
export function listBrandSources(clientId: string, section?: string) {
  return prisma.brandSource.findMany({
    where: { clientId, archivedAt: null, ...(section ? { section } : {}) },
    orderBy: { createdAt: "asc" },
  });
}

export function listBrandConnections(clientId: string) {
  return prisma.brandConnection.findMany({ where: { clientId, status: "CONNECTED" }, orderBy: { connectedAt: "asc" } });
}

/** For agent prompts: title, app, URL and section only. Contents are never fetched. */
export async function brandSourcesForAgents(clientId: string) {
  const sources = await listBrandSources(clientId);
  if (sources.length === 0) return "";
  const lines = sources.map((s) => {
    const where = sectionLabel(s.section);
    return `- ${s.title} (${appMeta(s.app).name}${s.isDemo ? ", demo link" : ""})${where ? ` [${where}]` : ""}: ${s.url}`;
  });
  return `Linked brand sources (titles and links for reference only; their contents are not available to you):\n${lines.join("\n")}`;
}

/** What a section's "+ Add source" needs: its chips and the connected apps' demo files. */
export async function sectionSources(clientId: string, section: string) {
  const [sources, connections] = await Promise.all([listBrandSources(clientId, section), listBrandConnections(clientId)]);
  return {
    sources: sources.map((s) => ({ id: s.id, app: s.app, url: s.url, title: s.title, isDemo: s.isDemo })),
    connected: connections.map((c) => ({ app: c.app, files: DEMO_FILES[c.app as Exclude<SourceApp, "web">] ?? [] })),
  };
}
