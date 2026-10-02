import { prisma } from "@/lib/prisma";
import { platformStatus } from "@/lib/brand-completeness";
import { brandSourcesForAgents } from "@/lib/brand-sources-data";
import { draftBrandSections } from "@/lib/ai/agents/brand-draft-agent";

/**
 * The brand agent's drafts for Brand OS sections, stored for review (BrandSectionDraft). Not a server action:
 * callers pass a client id they've already checked (the actions use the signed-in viewer's).
 */
export type DraftResult = { error?: string | null };

/** Drafts the given sections (all empty ones by default). Replaces earlier pending drafts of the same sections. */
export async function draftSections(clientId: string, only?: string[]): Promise<DraftResult> {
  const [client, brandOS, sources] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId } }),
    prisma.brandOS.findUnique({ where: { clientId } }),
    brandSourcesForAgents(clientId),
  ]);
  const status = platformStatus({ brandSummary: client.brandSummary, brandOS });
  const targets = only ? status.sections.filter((s) => only.includes(s.slug)) : status.empty;
  if (targets.length === 0) return { error: "Every section is written. Use Rewrite with AI on a section instead." };
  const written = status.sections
    .filter((s) => s.done && !only?.includes(s.slug))
    .map((s) => ({ label: s.label, text: s.slug === "our-brand" ? (client.brandSummary ?? "") : textOf(s.slug, brandOS) }))
    .filter((w) => w.text);

  const result = await draftBrandSections({
    clientId,
    clientName: client.name,
    industry: client.industry,
    website: client.website,
    written,
    sources,
    sections: targets.map((t) => ({ slug: t.slug, label: t.label, prompt: t.prompt })),
  });
  if (!result.ok) return { error: result.error };

  const valid = new Set(targets.map((t) => t.slug));
  const drafts = result.data.drafts.filter((d) => valid.has(d.section) && d.content.trim());
  await prisma.$transaction([
    prisma.brandSectionDraft.updateMany({ where: { clientId, section: { in: drafts.map((d) => d.section) }, status: "PENDING" }, data: { status: "DISCARDED", resolvedAt: new Date() } }),
    prisma.brandSectionDraft.createMany({ data: drafts.map((d) => ({ clientId, section: d.section, content: d.content.trim(), basis: d.basis })) }),
  ]);
  return { error: null };
}

function textOf(slug: string, b: Record<string, unknown> | null) {
  if (!b) return "";
  const field = { vision: "vision", mission: "mission", "market-position": "competitiveNote", "services-products": "servicesNote" }[slug];
  if (field) return String(b[field] ?? "");
  return JSON.stringify(b[{ "core-values": "coreValues", usps: "usps", "target-audience": "audiencePersonas" }[slug] ?? ""] ?? "");
}

