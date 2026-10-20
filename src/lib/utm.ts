import { prisma } from "@/lib/prisma";
import { categoryFor, isCategory, type Category } from "@/lib/output-categories";

/**
 * Phase V: every output with a link gets UTMs, so revenue can be linked to a piece of work:
 *   utm_source = where it runs (meta, tiktok, google, linkedin, instagram, klaviyo, …)
 *   utm_medium = how (paid_social, cpc, social, email, print, deck, other)
 *   utm_campaign = the project's slug (a skill's slug for what a skill made)
 *   utm_content = the output's id
 * The shop and CRM syncs read utm_content back into MetricDaily.outputId; that's the join.
 */

export function slugify(s: string) {
  const out = s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return out || "work";
}

/** The project's utm_campaign: set the first time it's needed, unique within the client, never changed after. */
export async function projectUtmSlug(projectId: string) {
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, name: true, clientId: true, utmSlug: true } });
  if (p.utmSlug) return p.utmSlug;
  const base = slugify(p.name);
  const taken = new Set((await prisma.project.findMany({ where: { clientId: p.clientId, utmSlug: { startsWith: base } }, select: { utmSlug: true } })).map((x) => x.utmSlug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  await prisma.project.update({ where: { id: p.id }, data: { utmSlug: slug } });
  return slug;
}

const PAID = /meta|facebook|google|tiktok ads|linkedin ads|display|programmatic/i;

/** utm_source and utm_medium from where a piece runs and what kind of work it is. */
export function utmSourceMedium(o: { channel: string | null; category: Category }): { source: string; medium: string } {
  const ch = (o.channel ?? "").toLowerCase();
  const source = /klaviyo|email|newsletter/.test(ch) ? "klaviyo" : /instagram/.test(ch) ? "instagram" : /facebook|meta/.test(ch) ? "meta" : /tiktok/.test(ch) ? "tiktok" : /google|youtube/.test(ch) ? (/youtube/.test(ch) ? "youtube" : "google") : /linkedin/.test(ch) ? "linkedin" : /pinterest/.test(ch) ? "pinterest" : ch ? slugify(ch) : o.category === "Print" ? "print" : o.category === "Copy & email" ? "klaviyo" : "klingit";
  const medium =
    o.category === "Copy & email" && source === "klaviyo"
      ? "email"
      : o.category === "Print"
        ? "print"
        : o.category === "Presentations"
          ? "deck"
          : o.category === "Ads" || PAID.test(o.channel ?? "")
            ? source === "google" ? "cpc" : "paid_social"
            : ["Social", "Video & motion", "Illustration"].includes(o.category)
              ? "social"
              : "other";
  return { source, medium };
}

export function withUtm(base: string, p: { source: string; medium: string; campaign: string; content: string }) {
  const url = new URL(/^https?:\/\//i.test(base) ? base : `https://${base}`);
  url.searchParams.set("utm_source", p.source);
  url.searchParams.set("utm_medium", p.medium);
  url.searchParams.set("utm_campaign", p.campaign);
  url.searchParams.set("utm_content", p.content);
  return url.toString();
}

export type TaggedLink = { url: string | null; base: string | null; custom: boolean; params: { source: string; medium: string; campaign: string; content: string } };

/** A delivered asset's tagged link (null url when there's no destination yet: no link and no client website). */
export async function taggedLinkForAsset(assetId: string, clientId: string): Promise<TaggedLink | null> {
  const a = await prisma.asset.findFirst({ where: { id: assetId, clientId }, select: { id: true, name: true, format: true, platform: true, type: true, category: true, linkUrl: true, projectId: true, project: { select: { type: true } }, client: { select: { website: true } } } });
  if (!a) return null;
  const category = isCategory(a.category) ? a.category : categoryFor({ format: a.format, type: a.type, channel: a.platform, projectType: a.project.type, title: a.name });
  if (category === "Web") return null; // the page itself is the destination
  const params = { ...utmSourceMedium({ channel: a.platform, category }), campaign: await projectUtmSlug(a.projectId), content: a.id };
  const base = a.linkUrl ?? a.client.website ?? null;
  return { url: base ? withUtm(base, params) : null, base, custom: Boolean(a.linkUrl), params };
}

/** What a skill made: utm_campaign is the skill's slug. */
export async function taggedLinkForOutput(outputId: string, clientId: string): Promise<TaggedLink | null> {
  const o = await prisma.skillOutput.findFirst({ where: { id: outputId, clientId }, select: { id: true, title: true, format: true, channel: true, category: true, linkUrl: true, agentId: true, client: { select: { website: true } } } });
  if (!o) return null;
  const agent = o.agentId ? await prisma.agent.findUnique({ where: { id: o.agentId }, select: { name: true } }) : null;
  const category = isCategory(o.category) ? o.category : categoryFor({ format: o.format, channel: o.channel, title: o.title, type: "COPY" });
  if (category === "Web") return null;
  const params = { ...utmSourceMedium({ channel: o.channel, category }), campaign: `skill-${slugify(agent?.name ?? "skill")}`, content: o.id };
  const base = o.linkUrl ?? o.client.website ?? null;
  return { url: base ? withUtm(base, params) : null, base, custom: Boolean(o.linkUrl), params };
}

/** utm_* back out of a landing URL (the shop and CRM syncs). */
export function readUtm(url: string | null | undefined) {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://x.invalid${url.startsWith("/") ? "" : "/"}${url}`);
    const get = (k: string) => u.searchParams.get(k) ?? "";
    return { source: get("utm_source"), medium: get("utm_medium"), campaign: get("utm_campaign"), content: get("utm_content") };
  } catch {
    return null;
  }
}
