import type { BrandRule, BrandRuleType, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { notify } from "@/lib/notifier";

/**
 * Brand OS → Rules (Phase R). The only place that reads or writes BrandRule / BrandRuleChange. Every skill,
 * assistant, the Brief assistant and the Brand OS check read active rules through loadActiveRules on each run:
 * nothing keeps a copy, so a change applies on the very next run.
 *
 * Who may change what: a client admin changes rules directly; a member can only suggest (an orange row an admin
 * approves or declines); Klingit staff edit directly and are shown as "· Klingit". Every change is in the change
 * history (before/after, undoable) and tells the client's Klingit account lead.
 */

export const RULE_TYPES: { type: BrandRuleType; label: string; tint: string }[] = [
  { type: "TONE", label: "Tone", tint: "bg-brand-chip" },
  { type: "DO", label: "Do", tint: "bg-brand-lime-pale" },
  { type: "WORDS_USE", label: "Words to use", tint: "bg-brand-lime-pale" },
  { type: "WORDS_AVOID", label: "Words to avoid", tint: "bg-brand-peach-pale" },
  { type: "CLAIMS", label: "Claims & legal", tint: "bg-brand-lavender-pale" },
  { type: "CHANNEL", label: "Channel", tint: "bg-brand-pink-pale" },
];
export const ruleTypeLabel = (t: BrandRuleType) => RULE_TYPES.find((r) => r.type === t)?.label ?? t;
export const RULE_CHANNELS = ["Instagram", "TikTok", "Facebook", "LinkedIn", "Email", "Web"] as const;

export type RuleScope = { channels?: string[]; products?: string[] };
export type ActiveRule = { id: string; type: BrandRuleType; text: string; words: string[]; scope: RuleScope };

const lite = (r: BrandRule): ActiveRule => ({ id: r.id, type: r.type, text: r.text, words: jsonArray<string>(r.words), scope: (r.scope ?? {}) as RuleScope });
const live = { status: "ACTIVE" as const, active: true, deletedAt: null };

/** A rule applies to a channel / product when its scope names it, or names none. */
export function ruleApplies(rule: { scope: RuleScope }, ctx: { channel?: string | null; product?: string | null } = {}) {
  const { channels = [], products = [] } = rule.scope;
  const has = (list: string[], v?: string | null) => !list.length || !v || list.some((x) => x.toLowerCase() === v.toLowerCase());
  return has(channels, ctx.channel) && has(products, ctx.product);
}

/** The rules in force right now, read fresh on every call (never cached). */
export async function loadActiveRules(clientId: string, ctx: { channel?: string | null; product?: string | null } = {}): Promise<ActiveRule[]> {
  const rows = await prisma.brandRule.findMany({ where: { clientId, ...live }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map(lite).filter((r) => ruleApplies(r, ctx));
}

/** Brand OS plus its active rules, for an agent's prompt (buildBrandContext). */
export async function loadBrandForAgents(clientId: string) {
  const [brandOS, rules] = await Promise.all([prisma.brandOS.findUnique({ where: { clientId } }), loadActiveRules(clientId)]);
  return brandOS ? { ...brandOS, rules } : null;
}
export type BrandForAgents = Awaited<ReturnType<typeof loadBrandForAgents>>;

/** Rules as prompt lines, by type, with their scope. */
export function rulesForPrompt(rules: ActiveRule[]) {
  return RULE_TYPES.flatMap(({ type, label }) => {
    const of = rules.filter((r) => r.type === type);
    if (!of.length) return [];
    const items = of.map((r) => {
      const where = [r.scope.channels?.length ? r.scope.channels.join("/") : null, r.scope.products?.length ? r.scope.products.join("/") : null].filter(Boolean).join(", ");
      const words = r.words.length ? (r.text.toLowerCase().startsWith("words we") ? r.words.join(", ") : `${r.text} (${r.words.join(", ")})`) : r.text;
      return where ? `${words} [only: ${where}]` : words;
    });
    return [`${label}: ${items.join("; ")}`];
  });
}

/** The words the brand never uses (all active avoid rules), lower case. */
export function avoidWords(rules: ActiveRule[]) {
  return [...new Set(rules.filter((r) => r.type === "WORDS_AVOID").flatMap((r) => r.words.map((w) => w.toLowerCase().replace(/\s*\(.*\)$/, "").trim())))].filter(Boolean);
}

// ─── Changes ──────────────────────────────────────────────────────────────

export type RuleActor = { userId: string; name: string; kind: "admin" | "member" | "staff" };
export class RulePermissionError extends Error {}

const snapshot = (r: BrandRule | null) => (r ? { type: r.type, text: r.text, words: jsonArray<string>(r.words), scope: r.scope ?? null, active: r.active, status: r.status, deletedAt: r.deletedAt?.toISOString() ?? null } : null);
type Snapshot = NonNullable<ReturnType<typeof snapshot>>;
const short = (t: string) => (t.length > 48 ? `${t.slice(0, 46)}…` : t);

async function record(clientId: string, actor: RuleActor, action: string, summary: string, ruleId: string | null, before: BrandRule | null, after: BrandRule | null) {
  await prisma.brandRuleChange.create({ data: { clientId, ruleId, actorUserId: actor.userId, byKlingit: actor.kind === "staff", action, summary, before: (snapshot(before) ?? undefined) as Prisma.InputJsonValue | undefined, after: (snapshot(after) ?? undefined) as Prisma.InputJsonValue | undefined } });
  // After-the-fact visibility for the account lead (never for their own changes).
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, accountLead: { select: { userId: true } } } });
  const lead = client?.accountLead?.userId;
  if (lead && lead !== actor.userId) {
    await notify({ userId: lead, clientId, type: "SYSTEM", title: `${client!.name}: Brand OS rules changed`, body: `${actor.name}${actor.kind === "staff" ? " · Klingit" : ""} ${summary}`, actionUrl: `/ops/clients/${clientId}/brand-os`, actionLabel: "See rules" });
  }
}

const mustEdit = (actor: RuleActor) => {
  if (actor.kind === "member") throw new RulePermissionError("Only an admin on your account can change rules. Suggest it instead.");
};

async function owned(clientId: string, id: string) {
  const r = await prisma.brandRule.findFirst({ where: { id, clientId } });
  if (!r) throw new RulePermissionError("No such rule.");
  return r;
}

export type RuleInput = { type: BrandRuleType; text: string; words?: string[]; scope?: RuleScope };
const clean = (i: RuleInput) => ({ type: i.type, text: i.text.trim().slice(0, 400), words: (i.words ?? []).map((w) => w.trim()).filter(Boolean) as Prisma.InputJsonValue, scope: (i.scope && (i.scope.channels?.length || i.scope.products?.length) ? i.scope : undefined) as Prisma.InputJsonValue | undefined });

/** Admin or Klingit: a new active rule. A member's goes in as a suggestion. */
export async function addRule(clientId: string, actor: RuleActor, input: RuleInput) {
  if (!input.text.trim()) throw new RulePermissionError("Write the rule first.");
  if (actor.kind === "member") return suggestRule(clientId, actor, input);
  const rule = await prisma.brandRule.create({ data: { clientId, ...clean(input), source: actor.kind === "staff" ? "klingit" : "manual", createdByUserId: actor.userId } });
  await record(clientId, actor, "added", `added “${short(rule.text)}”`, rule.id, null, rule);
  return rule;
}

export async function suggestRule(clientId: string, actor: RuleActor, input: RuleInput) {
  const rule = await prisma.brandRule.create({ data: { clientId, ...clean(input), status: "SUGGESTED", active: false, source: "suggestion", suggestedByUserId: actor.userId, createdByUserId: actor.userId } });
  await record(clientId, actor, "suggested", `suggested “${short(rule.text)}”`, rule.id, null, rule);
  return rule;
}

export async function editRule(clientId: string, actor: RuleActor, id: string, input: RuleInput) {
  mustEdit(actor);
  const before = await owned(clientId, id);
  const after = await prisma.brandRule.update({ where: { id }, data: clean(input) });
  await record(clientId, actor, "edited", `edited “${short(after.text)}”`, id, before, after);
  return after;
}

export async function setRuleActive(clientId: string, actor: RuleActor, id: string, active: boolean) {
  mustEdit(actor);
  const before = await owned(clientId, id);
  const after = await prisma.brandRule.update({ where: { id }, data: { active } });
  await record(clientId, actor, active ? "activated" : "deactivated", `${active ? "turned on" : "turned off"} “${short(after.text)}”`, id, before, after);
  return after;
}

/** Removes a rule from Brand OS (kept for the history, so the change can be undone). */
export async function deleteRule(clientId: string, actor: RuleActor, id: string) {
  mustEdit(actor);
  const before = await owned(clientId, id);
  const after = await prisma.brandRule.update({ where: { id }, data: { deletedAt: new Date() } });
  await record(clientId, actor, "deleted", `removed “${short(before.text)}”`, id, before, after);
}

/** A suggestion or an imported draft: approve makes it an active rule; decline keeps it out. */
export async function decideRule(clientId: string, actor: RuleActor, id: string, approve: boolean) {
  mustEdit(actor);
  const before = await owned(clientId, id);
  if (before.status !== "SUGGESTED" && before.status !== "DRAFT") return before;
  const after = await prisma.brandRule.update({ where: { id }, data: approve ? { status: "ACTIVE", active: true } : { status: "DECLINED", active: false } });
  await record(clientId, actor, approve ? "approved" : "declined", `${approve ? "approved" : "declined"} “${short(before.text)}”`, id, before, after);
  return after;
}

/** Word lists: add or remove one word (a member's addition is a suggestion). */
export async function changeWord(clientId: string, actor: RuleActor, type: "WORDS_USE" | "WORDS_AVOID", word: string, add: boolean) {
  const w = word.trim().slice(0, 60);
  if (!w) return;
  if (actor.kind === "member") {
    if (!add) throw new RulePermissionError("Only an admin on your account can remove words.");
    await suggestRule(clientId, actor, { type, text: `${type === "WORDS_USE" ? "Use" : "Avoid"} “${w}”`, words: [w] });
    return;
  }
  const list = (await prisma.brandRule.findFirst({ where: { clientId, type, source: "word_list", deletedAt: null } })) ?? (await prisma.brandRule.create({ data: { clientId, type, text: type === "WORDS_USE" ? "Words we use" : "Words we avoid", source: "word_list", words: [], sortOrder: type === "WORDS_USE" ? 900 : 901 } }));
  const words = jsonArray<string>(list.words);
  const next = add ? (words.some((x) => x.toLowerCase() === w.toLowerCase()) ? words : [...words, w]) : words.filter((x) => x.toLowerCase() !== w.toLowerCase());
  if (next.length === words.length && next.every((x, i) => x === words[i])) return;
  const after = await prisma.brandRule.update({ where: { id: list.id }, data: { words: next } });
  await record(clientId, actor, "edited", `${add ? "added" : "removed"} “${w}” ${add ? "to" : "from"} ${type === "WORDS_USE" ? "words to use" : "words to avoid"}`, list.id, list, after);
}

/** Draft rules from an imported guidelines file: never active until an admin approves each one. */
export async function addImportedDrafts(clientId: string, actor: RuleActor, file: string, drafts: RuleInput[]) {
  mustEdit(actor);
  const created = [];
  for (const d of drafts.filter((d) => d.text.trim()).slice(0, 40)) created.push(await prisma.brandRule.create({ data: { clientId, ...clean(d), status: "DRAFT", active: false, source: `import:${file.slice(0, 80)}`, createdByUserId: actor.userId } }));
  if (created.length) await record(clientId, actor, "imported", `imported ${created.length} draft rule${created.length === 1 ? "" : "s"} from ${file}`, null, null, null);
  return created;
}

/**
 * Undo a change: the rule goes back to how it was before it (a new rule is removed). Only while nothing newer has
 * changed that rule, so an undo never overwrites someone else's later edit.
 */
export async function undoChange(clientId: string, actor: RuleActor, changeId: string) {
  mustEdit(actor);
  const change = await prisma.brandRuleChange.findFirst({ where: { id: changeId, clientId, undoneAt: null } });
  if (!change?.ruleId) throw new RulePermissionError("That change can't be undone.");
  // Later changes that still stand (an undo's own entry doesn't count: undoing step by step goes further back).
  const newer = await prisma.brandRuleChange.count({ where: { clientId, ruleId: change.ruleId, createdAt: { gt: change.createdAt }, undoneAt: null, action: { not: "undone" } } });
  if (newer) throw new RulePermissionError("The rule changed again since. Undo the newer change first.");
  const current = await owned(clientId, change.ruleId);
  const before = change.before as Snapshot | null;
  const restored = before
    ? await prisma.brandRule.update({ where: { id: current.id }, data: { type: before.type, text: before.text, words: before.words as Prisma.InputJsonValue, scope: (before.scope ?? undefined) as Prisma.InputJsonValue | undefined, active: before.active, status: before.status, deletedAt: before.deletedAt ? new Date(before.deletedAt) : null } })
    : await prisma.brandRule.update({ where: { id: current.id }, data: { deletedAt: new Date() } });
  await prisma.brandRuleChange.update({ where: { id: change.id }, data: { undoneAt: new Date() } });
  await record(clientId, actor, "undone", `undid: ${change.summary}`, current.id, current, restored);
}

// ─── Reads for the Rules page ─────────────────────────────────────────────

export async function loadRulesPage(clientId: string) {
  const [rules, changes] = await Promise.all([
    prisma.brandRule.findMany({ where: { clientId, deletedAt: null, status: { not: "DECLINED" } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.brandRuleChange.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const people = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set([...changes, ...rules].flatMap((x) => ("actorUserId" in x ? [x.actorUserId] : [x.suggestedByUserId])).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  // Undo is offered on a change only while nothing newer touched its rule.
  const latestFor = new Map<string, string>();
  for (const c of changes) if (c.ruleId && !c.undoneAt && c.action !== "undone" && !latestFor.has(c.ruleId)) latestFor.set(c.ruleId, c.id);
  return {
    rules: rules.filter((r) => r.source !== "word_list").map((r) => ({ ...lite(r), status: r.status, active: r.active, usedCount: r.usedCount, caughtCount: r.caughtCount, source: r.source, suggestedBy: r.suggestedByUserId ? (people.get(r.suggestedByUserId) ?? "A member") : null })),
    words: {
      use: rules.filter((r) => r.type === "WORDS_USE" && r.source === "word_list").flatMap((r) => jsonArray<string>(r.words)),
      avoid: rules.filter((r) => r.type === "WORDS_AVOID" && r.source === "word_list").flatMap((r) => jsonArray<string>(r.words)),
    },
    changes: changes.map((c) => ({ id: c.id, at: c.createdAt, who: c.actorUserId ? (people.get(c.actorUserId) ?? "Someone") : "Klingit", byKlingit: c.byKlingit, summary: c.summary, undone: Boolean(c.undoneAt), canUndo: Boolean(c.ruleId) && !c.undoneAt && latestFor.get(c.ruleId!) === c.id && !["undone", "suggested"].includes(c.action) })),
    lastChangedAt: changes[0]?.createdAt ?? null,
  };
}
