import { prisma } from "@/lib/prisma";
import { AD_SOURCES } from "@/lib/metrics";
import { assetTitle } from "@/lib/asset-display";
import { clientVisibleAsset, clientVisibleVersion } from "@/lib/qc/visibility";
import { categoryFor, isCategory, type Category } from "@/lib/output-categories";

/**
 * The Output library (nav v3, 07): produced work only. Files Klingit delivered (approved or delivered assets of the
 * client's projects) and what the client's skills made (SkillOutput). Logos, fonts and brand photos are Brand OS.
 *
 * Performance badges have one rule, from real numbers only: within the same format and channel, an output in the
 * top quartile of CTR (or views, for video without CTR) is a "Top performer", in the bottom quartile "Below
 * average". A group needs at least 4 measured outputs; no data, no badge. "New": made in the last 7 days.
 */

export type Info = { kind: "performed" | "used" | "review" | "add"; text: string };
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
  /** Phase U */
  category: Category;
  meta: string;
  tags: string[];
  info: Info;
  madeByClient?: boolean;
};

export type LibraryFilters = { q?: string; project?: string; format?: string; channel?: string; days?: number | null; made?: "klingit" | "skills" | "client" | null; sort?: "best" | "newest"; category?: Category | null };

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

type Fact = { label: string; value: number | null; note: string | null };
const factText = (f: Fact) => (f.value != null ? `${f.label}: ${f.value.toLocaleString("en-GB")}` : f.note ? `${f.label} ${f.note}`.trim() : f.label);
const dm = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);

/**
 * The line under a piece (Phase U): how it performed (only work that ran on a connected channel), else how it was
 * used (facts we have or someone added), else "+ Add how it did". Never an empty metric or a zero.
 */
function infoFor(metrics: { ctr: number | null; views: number | null; hookRate?: number | null; savesVsAvg?: number | null; topPct?: number | null; revenue?: OutputRevenue | null }, facts: Fact[], downloads: number): Info {
  const r = metrics.revenue;
  const perf = [
    // Phase V: revenue linked to this piece through utm_content (the data layer), first.
    r && r.revenue > 0 ? `${moneyShort(r.revenue, r.currency)} revenue${r.orders ? ` · ${Math.round(r.orders).toLocaleString("en-GB")} orders` : r.won ? ` · ${Math.round(r.won)} deals won` : ""}` : null,
    metrics.ctr != null && metrics.ctr > 0 ? `CTR ${metrics.ctr}%${metrics.topPct ? ` · top ${metrics.topPct}%` : ""}` : null,
    metrics.savesVsAvg ? `Saves ${metrics.savesVsAvg}× your average` : null,
    metrics.hookRate ? `Hook rate ${metrics.hookRate}%` : null,
    !metrics.ctr && metrics.views ? `${fmtViews(metrics.views)} views` : null,
  ].filter(Boolean) as string[];
  if (perf.length) return { kind: "performed", text: perf.slice(0, 2).join(" · ") };
  const used = [...facts.map(factText), downloads > 0 ? `Downloaded ${downloads}×` : null].filter(Boolean) as string[];
  if (used.length) return { kind: "used", text: used.slice(0, 2).join(" · ") };
  return { kind: "add", text: "+ Add how it did" };
}

type OutputRevenue = { revenue: number; orders: number; won: number; currency: string; impressions: number; clicks: number };
const moneyShort = (n: number, currency: string) => {
  const sym = currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "GBP" ? "£" : "";
  const v = n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(Math.round(n));
  return sym ? `${sym}${v}` : `${v} ${currency}`.trim();
};

/**
 * Phase V: what the data layer knows per piece of work (rows whose utm_content named it): ad delivery, and the
 * orders, deals and revenue credited to it ("shared": the average of first and last touch).
 */
export async function outputNumbers(clientId: string, outputIds?: string[]) {
  const rows = await prisma.metricDaily.groupBy({ by: ["outputId", "metric", "model", "currency"], where: { clientId, outputId: outputIds ? { in: outputIds } : { not: null } }, _sum: { value: true } });
  const out = new Map<string, OutputRevenue>();
  for (const r of rows) {
    if (!r.outputId) continue;
    const o = out.get(r.outputId) ?? { revenue: 0, orders: 0, won: 0, currency: "", impressions: 0, clicks: 0 };
    const v = (r._sum.value ?? 0) * (r.model ? 0.5 : 1);
    if (r.metric === "revenue" || r.metric === "won_value") {
      o.revenue += v;
      o.currency = o.currency || r.currency;
    } else if (r.metric === "orders") o.orders += v;
    else if (r.metric === "won") o.won += v;
    else if (r.metric === "impressions" && !r.model) o.impressions += v;
    else if (r.metric === "clicks" && !r.model) o.clicks += v;
    out.set(r.outputId, o);
  }
  return out;
}

export async function loadOutputLibrary(clientId: string, filters: LibraryFilters = {}, now = new Date()) {
  const [assets, outputs, sources, facts, clientUsers, layer] = await Promise.all([
    prisma.asset.findMany({
      where: { clientId, ...clientVisibleAsset, status: { in: ["APPROVED", "DELIVERED"] } },
      include: { project: { select: { id: true, name: true, type: true } }, versions: { where: clientVisibleVersion, orderBy: { number: "desc" }, take: 1, select: { posterKey: true, sentAt: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.skillOutput.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
    prisma.metricDaily.groupBy({ by: ["source"], where: { clientId, source: { in: [...AD_SOURCES] } }, _max: { date: true } }),
    prisma.outputFact.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } }),
    prisma.clientUser.findMany({ where: { clientId }, select: { userId: true } }),
    outputNumbers(clientId),
  ]);
  // A piece's CTR from the data layer when the ad platform delivered enough of it; else what was stored on it.
  const layerCtr = (id: string, stored: number | null) => {
    const n = layer.get(id);
    return n && n.impressions >= 500 ? Math.round((n.clicks / n.impressions) * 10000) / 100 : stored;
  };
  const skills = new Map((await prisma.agent.findMany({ where: { id: { in: outputs.map((o) => o.agentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((a) => [a.id, a.name]));
  const clientUserIds = new Set(clientUsers.map((c) => c.userId));
  const factsFor = (k: { assetId?: string; skillOutputId?: string }) => facts.filter((f) => (k.assetId ? f.assetId === k.assetId : f.skillOutputId === k.skillOutputId));

  // CTR standing within its own format: "top 10%" for the best of a group of at least 4 measured pieces.
  const byFormat = new Map<string, number[]>();
  for (const a of assets) if (a.performanceCtr) byFormat.set(family(a.format, a.type), [...(byFormat.get(family(a.format, a.type)) ?? []), a.performanceCtr]);
  const topPct = (format: string, ctr: number | null) => {
    const g = byFormat.get(format);
    if (!ctr || !g || g.length < 4) return null;
    const share = g.filter((x) => x > ctr).length / g.length;
    return share < 0.1 ? 10 : share < 0.25 ? 25 : null;
  };

  const all: LibraryItem[] = [
    ...assets.map((a): LibraryItem => {
      const tags = (a.tags ?? {}) as { copy?: Record<string, string>; meta?: string; keywords?: string[]; metrics?: { hookRate?: number; savesVsAvg?: number } };
      const copy = tags.copy;
      const image = a.previewKey ? `/api/assets/${a.id}/download?part=preview` : a.storageKey && a.mimeType?.startsWith("image/") ? `/api/assets/${a.id}/download?inline=1` : null;
      const fam = family(a.format, a.type);
      const category = isCategory(a.category) ? a.category : categoryFor({ format: a.format, type: a.type, channel: a.platform, projectType: a.project.type, title: a.name });
      const date = a.versions[0]?.sentAt ?? a.createdAt;
      return {
        key: `a_${a.id}`,
        kind: "asset",
        id: a.id,
        title: assetTitle(a.name, a.format),
        format: fam,
        channel: a.platform,
        source: a.project.name,
        sourceId: a.project.id,
        madeBy: "klingit",
        madeByClient: Boolean(a.uploadedByUserId && clientUserIds.has(a.uploadedByUserId)),
        date,
        href: `/library/${a.id}`,
        thumb: {
          image,
          video: a.type === "VIDEO" && a.storageKey ? { src: `/api/assets/${a.id}/download?inline=1`, poster: a.versions[0]?.posterKey ? `/api/assets/${a.id}/download?part=poster` : null } : null,
          text: copy ? (Object.values(copy)[0] ?? null) : null,
          color: a.thumbnailColor,
        },
        metric: a.performanceCtr != null ? { label: `${a.performanceCtr}% CTR`, value: a.performanceCtr, kind: "ctr" } : a.performanceViews != null ? { label: `${fmtViews(a.performanceViews)} views`, value: a.performanceViews, kind: "views" } : null,
        badge: null,
        category,
        meta: tags.meta ?? [category === "Ads" || category === "Social" ? (a.platform ?? fam) : category === "Video & motion" ? `Video · ${fam.replace(/^Video\s*/, "") || fam}` : fam, a.project.name, dm(date)].filter(Boolean).join(" · "),
        tags: tags.keywords ?? [],
        info: infoFor({ ctr: layerCtr(a.id, a.performanceCtr), views: a.performanceViews, hookRate: tags.metrics?.hookRate, savesVsAvg: tags.metrics?.savesVsAvg, topPct: topPct(fam, a.performanceCtr), revenue: layer.get(a.id) ?? null }, factsFor({ assetId: a.id }), a.downloadCount),
      };
    }),
    ...outputs.map((o): LibraryItem => {
      const category = isCategory(o.category) ? o.category : categoryFor({ format: o.format, channel: o.channel, title: o.title, type: o.mimeType?.startsWith("image/") ? "IMAGE" : "COPY" });
      return {
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
        category,
        meta: [o.format, o.channel, `Skill: ${(o.agentId && skills.get(o.agentId)) ?? "skill"}`, dm(o.createdAt)].filter(Boolean).join(" · "),
        tags: [],
        info: infoFor({ ctr: layerCtr(o.id, null), views: null, revenue: layer.get(o.id) ?? null }, factsFor({ skillOutputId: o.id }), o.downloadCount),
      };
    }),
  ];
  badgeFor(all, now);

  // Filters and sort.
  const term = filters.q?.trim().toLowerCase();
  const days = filters.days ?? null;
  const base = all
    .filter((i) => !term || `${i.title} ${i.source} ${i.format} ${i.channel ?? ""} ${i.category} ${i.meta} ${i.tags.join(" ")}`.toLowerCase().includes(term))
    .filter((i) => !filters.project || i.source === filters.project)
    .filter((i) => !filters.format || i.format === filters.format)
    .filter((i) => !filters.channel || i.channel === filters.channel)
    .filter((i) => !days || now.getTime() - i.date.getTime() <= days * DAY)
    .filter((i) => !filters.made || (filters.made === "skills" ? i.madeBy === "skill" : filters.made === "client" ? i.madeByClient : i.madeBy === "klingit" && !i.madeByClient));
  const shown = base
    .filter((i) => !filters.category || i.category === filters.category)
    .sort((a, b) =>
      filters.sort === "newest"
        ? b.date.getTime() - a.date.getTime()
        : // Best performing: measured first by their standing in their own group, then the rest by date.
          rank(b) - rank(a) || (b.metric?.value ?? -1) - (a.metric?.value ?? -1) || b.date.getTime() - a.date.getTime()
    );

  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort();
  const lastUpdate = sources.reduce<string | null>((m, s) => (s._max.date && (!m || s._max.date > m) ? s._max.date : m), null);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    items: shown,
    /** Counts per category under the other filters (the chips). */
    categoryCounts: Object.fromEntries(base.reduce((m, i) => m.set(i.category, (m.get(i.category) ?? 0) + 1), new Map<string, number>())) as Record<string, number>,
    newThisMonth: base.filter((i) => i.date >= monthStart).sort((a, b) => b.date.getTime() - a.date.getTime()),
    total: base.length,
    facets: { projects: uniq(all.map((i) => i.source)), formats: uniq(all.map((i) => i.format)), channels: uniq(all.map((i) => i.channel)) },
    summary: { total: shown.length, byKlingit: shown.filter((i) => i.madeBy === "klingit").length, bySkills: shown.filter((i) => i.madeBy === "skill").length },
    dataSources: { platforms: sources.map((s) => s.source), lastUpdate },
  };
}

const rank = (i: LibraryItem) => (i.badge === "Top performer" ? 2 : i.metric ? 1 : i.badge === "Below average" ? 0.5 : 0);
