import { prisma } from "@/lib/prisma";
import { assetTitle } from "@/lib/asset-display";
import { clientVisibleAsset, clientVisibleVersion } from "@/lib/qc/visibility";

/**
 * The Output library (nav v3, 07): produced work only. Files Klingit delivered (approved or delivered assets of the
 * client's projects) and what the client's skills made (SkillOutput). Logos, fonts and brand photos are Brand OS.
 *
 * Performance badges have one rule, from real numbers only: within the same format and channel, an output in the
 * top quartile of CTR (or views, for video without CTR) is a "Top performer", in the bottom quartile "Below
 * average". A group needs at least 4 measured outputs; no data, no badge. "New": made in the last 7 days.
 */

export type LibraryItem = {
  key: string; // "a_<assetId>" | "s_<skillOutputId>"
  kind: "asset" | "skill";
  id: string;
  title: string;
  format: string; // family, e.g. "Story 9:16", "Copy", "Image"
  channel: string | null;
  source: string; // project name, or "Skill: Ad gen"
  sourceId: string | null; // project id or skill (agent) id
  madeBy: "klingit" | "skill";
  date: Date;
  href: string;
  thumb: { image: string | null; video: { src: string; poster: string | null } | null; text: string | null; color: string };
  metric: { label: string; value: number; kind: "ctr" | "views" } | null;
  badge: "Top performer" | "Below average" | "New" | "Made with a skill" | null;
};

export type LibraryFilters = { q?: string; project?: string; format?: string; channel?: string; days?: number | null; made?: "klingit" | "skills" | null; sort?: "best" | "newest" };

const DAY = 86400000;
const fmtViews = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}K`.replace(".0K", "K") : String(n));

function family(format: string, type: string) {
  if (type === "COPY") return "Copy";
  // "Story 9:16", "Carousel 1:1 · slide 2" → "Carousel 1:1": the format with its ratio, never a slide or frame.
  const f = format.split(" · ")[0];
  return type === "VIDEO" && !/video/i.test(f) ? `Video ${f.match(/\d+(?:\.\d+)?:\d+/)?.[0] ?? ""}`.trim() : f;
}

/** Quartile badges per format + channel group (see the rule above). */
function badgeFor(items: LibraryItem[], now: Date) {
  const groups = new Map<string, LibraryItem[]>();
  for (const i of items) if (i.metric) groups.set(`${i.format}|${i.channel ?? ""}|${i.metric.kind}`, [...(groups.get(`${i.format}|${i.channel ?? ""}|${i.metric.kind}`) ?? []), i]);
  const q = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
  for (const group of groups.values()) {
    if (group.length < 4) continue;
    const v = group.map((i) => i.metric!.value).sort((a, b) => a - b);
    const [q1, q3] = [q(v, 0.25), q(v, 0.75)];
    for (const i of group) i.badge = i.metric!.value >= q3 && q3 > q1 ? "Top performer" : i.metric!.value <= q1 && q3 > q1 ? "Below average" : null;
  }
  for (const i of items) {
    if (i.badge) continue;
    if (i.madeBy === "skill") i.badge = "Made with a skill";
    else if (!i.metric && now.getTime() - i.date.getTime() < 7 * DAY) i.badge = "New";
  }
}

export async function loadOutputLibrary(clientId: string, filters: LibraryFilters = {}, now = new Date()) {
  const [assets, outputs, sources] = await Promise.all([
    prisma.asset.findMany({
      where: { clientId, ...clientVisibleAsset, status: { in: ["APPROVED", "DELIVERED"] } },
      include: { project: { select: { id: true, name: true } }, versions: { where: clientVisibleVersion, orderBy: { number: "desc" }, take: 1, select: { posterKey: true, sentAt: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.skillOutput.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
    prisma.adDailyMetric.groupBy({ by: ["platform"], where: { clientId }, _max: { date: true } }),
  ]);
  const skills = new Map((await prisma.agent.findMany({ where: { id: { in: outputs.map((o) => o.agentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((a) => [a.id, a.name]));

  const all: LibraryItem[] = [
    ...assets.map((a): LibraryItem => {
      const copy = (a.tags as { copy?: Record<string, string> } | null)?.copy;
      const image = a.storageKey && a.mimeType?.startsWith("image/") ? `/api/assets/${a.id}/download?inline=1` : null;
      return {
        key: `a_${a.id}`,
        kind: "asset",
        id: a.id,
        title: assetTitle(a.name, a.format),
        format: family(a.format, a.type),
        channel: a.platform,
        source: a.project.name,
        sourceId: a.project.id,
        madeBy: "klingit",
        date: a.versions[0]?.sentAt ?? a.createdAt,
        href: `/library/${a.id}`,
        thumb: {
          image,
          video: a.type === "VIDEO" && a.storageKey ? { src: `/api/assets/${a.id}/download?inline=1`, poster: a.versions[0]?.posterKey ? `/api/assets/${a.id}/download?part=poster` : null } : null,
          text: copy ? Object.values(copy)[0] ?? null : null,
          color: a.thumbnailColor,
        },
        metric: a.performanceCtr != null ? { label: `${a.performanceCtr}% CTR`, value: a.performanceCtr, kind: "ctr" } : a.performanceViews != null ? { label: `${fmtViews(a.performanceViews)} views`, value: a.performanceViews, kind: "views" } : null,
        badge: null,
      };
    }),
    ...outputs.map((o): LibraryItem => ({
      key: `s_${o.id}`,
      kind: "skill",
      id: o.id,
      title: o.title,
      format: o.format ?? "Output",
      channel: o.channel,
      source: `Skill: ${(o.agentId && skills.get(o.agentId)) ?? "skill"}`,
      sourceId: o.agentId,
      madeBy: "skill",
      date: o.createdAt,
      href: `/library/output/${o.id}`,
      thumb: { image: o.storageKey && o.mimeType?.startsWith("image/") ? `/api/skill-outputs/${o.id}/file` : null, video: null, text: o.text, color: "var(--avatar-5)" },
      metric: null,
      badge: null,
    })),
  ];
  badgeFor(all, now);

  // Filters and sort.
  const term = filters.q?.trim().toLowerCase();
  const days = filters.days === undefined ? 90 : filters.days;
  const shown = all
    .filter((i) => !term || `${i.title} ${i.source} ${i.format} ${i.channel ?? ""}`.toLowerCase().includes(term))
    .filter((i) => !filters.project || i.source === filters.project)
    .filter((i) => !filters.format || i.format === filters.format)
    .filter((i) => !filters.channel || i.channel === filters.channel)
    .filter((i) => !days || now.getTime() - i.date.getTime() <= days * DAY)
    .filter((i) => !filters.made || (filters.made === "skills" ? i.madeBy === "skill" : i.madeBy === "klingit"))
    .sort((a, b) =>
      filters.sort === "newest"
        ? b.date.getTime() - a.date.getTime()
        : // Best performing: measured first by their standing in their own group, then the rest by date.
          rank(b) - rank(a) || (b.metric?.value ?? -1) - (a.metric?.value ?? -1) || b.date.getTime() - a.date.getTime()
    );

  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort();
  const lastUpdate = sources.reduce<string | null>((m, s) => (s._max.date && (!m || s._max.date > m) ? s._max.date : m), null);
  return {
    items: shown,
    facets: { projects: uniq(all.map((i) => i.source)), formats: uniq(all.map((i) => i.format)), channels: uniq(all.map((i) => i.channel)) },
    summary: { total: shown.length, byKlingit: shown.filter((i) => i.madeBy === "klingit").length, bySkills: shown.filter((i) => i.madeBy === "skill").length },
    dataSources: { platforms: sources.map((s) => s.platform), lastUpdate },
  };
}

const rank = (i: LibraryItem) => (i.badge === "Top performer" ? 2 : i.metric ? 1 : i.badge === "Below average" ? 0.5 : 0);
