import { prisma } from "@/lib/prisma";
import { STAGE_TABS, type StageSlug } from "@/lib/pipeline-tabs";

/** The cockpit for one project; `section` scrolls to that step card. */
export function cockpitHref(projectId: string, section?: "brief" | "estimate" | "staffing" | "production") {
  return `/ops/projects/${projectId}${section ? `#${section}` : ""}`;
}

const SECTION_FOR_SLUG: Partial<Record<StageSlug, "brief" | "estimate" | "staffing" | "production">> = {
  brief: "brief",
  estimate: "estimate",
  staffing: "staffing",
  production: "production",
  qa: "production",
  delivery: "production",
  feedback: "production",
  final: "production",
};

/**
 * The old per-client delivery URLs (/ops/clients/[id]/delivery/[stage]) had no project in them.
 * Resolve them to the right project: an explicit ?project= wins; otherwise the client's project whose
 * active stage is that tab; otherwise their most recently updated one. Unstarted DRAFTs never qualify.
 */
export async function resolveLegacyDelivery(clientId: string, stage?: string, projectParam?: string) {
  const visible = { clientId, status: { notIn: ["DRAFT" as const, "ARCHIVED" as const] } };
  const tab = STAGE_TABS.find((t) => t.slug === stage);
  const project =
    (projectParam && (await prisma.project.findFirst({ where: { id: projectParam, ...visible } }))) ||
    (tab?.stage &&
      (await prisma.project.findFirst({
        where: { ...visible, status: { notIn: ["DRAFT", "ARCHIVED", "DELIVERED"] }, pipelineStages: { some: { name: tab.stage, status: "ACTIVE" } } },
        orderBy: { updatedAt: "desc" },
      }))) ||
    (await prisma.project.findFirst({ where: { ...visible, status: { notIn: ["DRAFT", "ARCHIVED", "DELIVERED"] } }, orderBy: { updatedAt: "desc" } })) ||
    (await prisma.project.findFirst({ where: visible, orderBy: { updatedAt: "desc" } }));
  if (!project) return `/ops/clients/${clientId}`;
  return cockpitHref(project.id, tab ? SECTION_FOR_SLUG[tab.slug] : undefined);
}
