import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";

/**
 * Phase W: learning from "Not for us" (and from missed results). Simple rules first:
 *  - "Budget is fixed": for 60 days, only €0-spend suggestions;
 *  - "Off-brand": the topic goes on an exclude list (staff see it, and can take a topic off);
 *  - "Don't trust the data": the PM is told (opportunities.ts) and, for 60 days, every opportunity shows more data checks;
 *  - a missed result can teach "suggestions from <source> need N days of its data".
 * Every reason and every rule change is in the client's AuditLog, so the PM sees it under Activity.
 */

const DAY = 86400000;
export const RULE_DAYS = 60;
export type ExcludedTopic = { topic: string; at: string; opportunityId: string | null };

export async function opportunityPrefs(clientId: string) {
  const p = await prisma.opportunityPrefs.findUnique({ where: { clientId } });
  return {
    budgetFixedUntil: p?.budgetFixedUntil ?? null,
    moreChecksUntil: p?.moreChecksUntil ?? null,
    excludeTopics: jsonArray<ExcludedTopic>(p?.excludeTopics),
    minDataDays: ((p?.minDataDays ?? {}) as Record<string, number>) || {},
  };
}
export type Prefs = Awaited<ReturnType<typeof opportunityPrefs>>;

const save = (clientId: string, data: Omit<Prisma.OpportunityPrefsUncheckedCreateInput, "clientId">) => prisma.opportunityPrefs.upsert({ where: { clientId }, create: { ...data, clientId }, update: data });
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);

/** What a reason changes, written to the AuditLog (the client's Activity) with the opportunity it came from. */
export async function learnFromDismissal(clientId: string, userId: string | null, o: { id: string; title: string }, reason: string, now = new Date()) {
  const until = new Date(now.getTime() + RULE_DAYS * DAY);
  let effect = "";
  if (reason === "Budget is fixed") {
    await save(clientId, { budgetFixedUntil: until });
    effect = ` Until ${day(until)} we only suggest options with no extra spend.`;
  } else if (reason === "Off-brand") {
    const prefs = await opportunityPrefs(clientId);
    if (!prefs.excludeTopics.some((t) => t.topic.toLowerCase() === o.title.toLowerCase()))
      await save(clientId, { excludeTopics: [...prefs.excludeTopics, { topic: o.title, at: now.toISOString(), opportunityId: o.id }] as Prisma.InputJsonValue });
    effect = " Its topic is on the exclude list.";
  } else if (reason === "Don't trust the data") {
    await save(clientId, { moreChecksUntil: until });
    effect = ` Until ${day(until)} every opportunity shows more data checks.`;
  }
  await prisma.auditLog.create({ data: { clientId, actorUserId: userId, area: "opportunities", action: `Not for us: “${o.title}” (${reason}).${effect}` } });
}

/** Staff take a rule off (logged). */
export async function clearRule(clientId: string, userId: string, rule: "budget" | "checks" | { topic: string } | { source: string }) {
  const prefs = await opportunityPrefs(clientId);
  let what: string;
  if (rule === "budget") {
    await save(clientId, { budgetFixedUntil: null });
    what = "the €0-spend rule";
  } else if (rule === "checks") {
    await save(clientId, { moreChecksUntil: null });
    what = "the extra data checks";
  } else if ("topic" in rule) {
    await save(clientId, { excludeTopics: prefs.excludeTopics.filter((t) => t.topic !== rule.topic) as Prisma.InputJsonValue });
    what = `“${rule.topic}” from the exclude list`;
  } else {
    const rest = { ...prefs.minDataDays };
    delete rest[rule.source];
    await save(clientId, { minDataDays: rest });
    what = `the ${rule.source} data rule`;
  }
  await prisma.auditLog.create({ data: { clientId, actorUserId: userId, area: "opportunities", action: `Took off ${what}` } });
}

/** Learned from a miss: suggestions resting on a source need N days of its data (logged). */
export async function setMinDataDays(clientId: string, userId: string, source: string, days: number) {
  const prefs = await opportunityPrefs(clientId);
  await save(clientId, { minDataDays: { ...prefs.minDataDays, [source]: days } });
  await prisma.auditLog.create({ data: { clientId, actorUserId: userId, area: "opportunities", action: `${source} suggestions now need ${days} days of ${source} data` } });
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "for", "to", "on", "in", "with", "your", "our", "not", "new", "more", "it", "is", "at", "by"]);
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
/** A suggestion is about an excluded topic when most of the topic's words are in it. */
export function isExcluded(text: string, topics: ExcludedTopic[]) {
  const have = new Set(words(text));
  return topics.some((t) => {
    const need = words(t.topic);
    return need.length > 0 && need.filter((w) => have.has(w)).length / need.length >= 0.6;
  });
}

/** How many days of data each source has for a client (from its first day in the data layer). */
export async function dataDays(clientId: string, now = new Date()) {
  const rows = await prisma.metricDaily.groupBy({ by: ["source"], where: { clientId }, _min: { date: true } });
  return Object.fromEntries(rows.map((r) => [r.source, r._min.date ? Math.floor((now.getTime() - new Date(`${r._min.date}T00:00:00Z`).getTime()) / DAY) + 1 : 0]));
}

/** What the weekly scan must respect now: prompt lines, and the sources too new to rest a suggestion on. */
export async function scanRules(clientId: string, now = new Date()) {
  const prefs = await opportunityPrefs(clientId);
  const lines: string[] = [];
  if (prefs.budgetFixedUntil && prefs.budgetFixedUntil > now) lines.push("THE BUDGET IS FIXED: only suggest options with no extra paid spend (organic, email, reusing what's made).");
  if (prefs.excludeTopics.length) lines.push(`NEVER SUGGEST (the client said off-brand): ${prefs.excludeTopics.map((t) => t.topic).join("; ")}`);
  const days = Object.keys(prefs.minDataDays).length ? await dataDays(clientId, now) : {};
  const tooNew = Object.entries(prefs.minDataDays).filter(([s, n]) => (days[s] ?? 0) < n).map(([s]) => s);
  return { prefs, lines, tooNew };
}
