import { prisma } from "@/lib/prisma";
import { AD_SOURCES } from "@/lib/metrics";
import { projectUtmSlug, slugify } from "@/lib/utm";

/**
 * Phase V: joining an ad platform's campaigns to the work. Numbers that carry a utm_campaign join on it; an ad
 * platform's own numbers don't, so staff map each campaign to a project (its utm_campaign) here. Anything not mapped
 * stays "Unattributed" and is shown as such. A name match is suggested, never applied without staff.
 */

export async function campaignsToMap(clientId: string, now = new Date()) {
  const since = new Date(now.getTime() - 89 * 86400000).toISOString().slice(0, 10);
  const [rows, maps, projects] = await Promise.all([
    prisma.metricDaily.groupBy({ by: ["source", "campaignId", "campaignName"], where: { clientId, source: { in: [...AD_SOURCES] }, metric: "spend", date: { gte: since } }, _sum: { value: true } }),
    prisma.campaignMapping.findMany({ where: { clientId } }),
    prisma.project.findMany({ where: { clientId, status: { notIn: ["DRAFT"] } }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const slugs = await Promise.all(projects.map(async (p) => ({ slug: await projectUtmSlug(p.id), name: p.name })));
  const campaigns = new Map<string, { source: string; campaignId: string; campaignName: string; spend: number }>();
  for (const r of rows) {
    const key = `${r.source}|${r.campaignId}`;
    const c = campaigns.get(key) ?? { source: r.source, campaignId: r.campaignId, campaignName: r.campaignName, spend: 0 };
    c.spend += r._sum.value ?? 0;
    campaigns.set(key, c);
  }
  return {
    projects: slugs,
    campaigns: [...campaigns.values()]
      .sort((a, b) => b.spend - a.spend)
      .map((c) => {
        const mapped = maps.find((m) => m.source === c.source && m.campaignId === c.campaignId)?.utmCampaign ?? null;
        const name = slugify(c.campaignName);
        const suggested = mapped ? null : (slugs.find((s) => name.includes(s.slug) || s.slug.includes(name))?.slug ?? null);
        return { ...c, mapped, suggested };
      }),
  };
}

/** Map (or unmap, utmCampaign "") one campaign; its stored numbers follow at once. Logged. */
export async function setCampaignMapping(clientId: string, source: string, campaignId: string, utmCampaign: string, actorUserId: string) {
  const before = await prisma.campaignMapping.findUnique({ where: { clientId_source_campaignId: { clientId, source, campaignId } } });
  const name = (await prisma.metricDaily.findFirst({ where: { clientId, source, campaignId }, select: { campaignName: true } }))?.campaignName ?? campaignId;
  await prisma.$transaction([
    utmCampaign
      ? prisma.campaignMapping.upsert({ where: { clientId_source_campaignId: { clientId, source, campaignId } }, update: { utmCampaign, campaignName: name, createdByUserId: actorUserId }, create: { clientId, source, campaignId, campaignName: name, utmCampaign, createdByUserId: actorUserId } })
      : prisma.campaignMapping.deleteMany({ where: { clientId, source, campaignId } }),
    prisma.metricDaily.updateMany({ where: { clientId, source, campaignId }, data: { utmCampaign } }),
    prisma.auditLog.create({ data: { clientId, actorUserId, area: "campaign-mapping", action: utmCampaign ? `Mapped ${source} campaign “${name}” to ${utmCampaign}` : `Unmapped ${source} campaign “${name}” (Unattributed)`, before: { utmCampaign: before?.utmCampaign ?? null }, after: { utmCampaign: utmCampaign || null } } }),
  ]);
}
