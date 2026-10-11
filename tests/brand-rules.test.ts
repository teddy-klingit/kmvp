import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { addImportedDrafts, addRule, changeWord, decideRule, deleteRule, editRule, loadActiveRules, loadBrandForAgents, loadRulesPage, RulePermissionError, setRuleActive, undoChange, type RuleActor } from "@/lib/brand-rules";
import { checkCopy, findWord } from "@/lib/rule-check";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { saveRuleAction } from "@/lib/actions/brand-rule-actions";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let memberUserId: string;
let admin: RuleActor;
let member: RuleActor;
let staff: RuleActor;

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const u = await prisma.user.create({ data: { name: "Erik Member", email: `erik-${Date.now()}@test.local`, role: "CLIENT", status: "ACTIVE" } });
  await prisma.clientUser.create({ data: { userId: u.id, clientId: fx.clientA.id, permission: "APPROVER" } });
  memberUserId = u.id;
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { accountLeadId: fx.adminStaff.id } });
  admin = { userId: fx.userA.id, name: "Maja Admin", kind: "admin" };
  member = { userId: u.id, name: "Erik Member", kind: "member" };
  staff = { userId: fx.adminUser.id, name: "Teddy Staff", kind: "staff" };
});
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { clientId: fx.clientA.id } });
  await prisma.user.delete({ where: { id: memberUserId } });
  await fx.cleanup();
});

describe("rule permissions", () => {
  it("an admin's rule applies at once; a member's is only a suggestion", async () => {
    const r = await addRule(fx.clientA.id, admin, { type: "TONE", text: "headlines end with a full stop" });
    expect(r).toMatchObject({ status: "ACTIVE", active: true });
    const s = await addRule(fx.clientA.id, member, { type: "CLAIMS", text: "always show the SPF number", scope: { products: ["sun day"] } });
    expect(s).toMatchObject({ status: "SUGGESTED", active: false });
    const active = (await loadActiveRules(fx.clientA.id)).map((x) => x.text);
    expect(active).toContain("headlines end with a full stop");
    expect(active).not.toContain("always show the SPF number");
  });

  it("members can't edit, turn off, remove, approve or undo", async () => {
    const [rule] = await loadActiveRules(fx.clientA.id);
    await expect(editRule(fx.clientA.id, member, rule.id, { type: "TONE", text: "x" })).rejects.toBeInstanceOf(RulePermissionError);
    await expect(setRuleActive(fx.clientA.id, member, rule.id, false)).rejects.toBeInstanceOf(RulePermissionError);
    await expect(deleteRule(fx.clientA.id, member, rule.id)).rejects.toBeInstanceOf(RulePermissionError);
    const suggestion = await prisma.brandRule.findFirstOrThrow({ where: { clientId: fx.clientA.id, status: "SUGGESTED" } });
    await expect(decideRule(fx.clientA.id, member, suggestion.id, true)).rejects.toBeInstanceOf(RulePermissionError);
    const change = await prisma.brandRuleChange.findFirstOrThrow({ where: { clientId: fx.clientA.id } });
    await expect(undoChange(fx.clientA.id, member, change.id)).rejects.toBeInstanceOf(RulePermissionError);
  });

  it("through the action too: a member's 'add' becomes a suggestion", async () => {
    setMockSession({ user: { id: memberUserId, role: "CLIENT" } });
    const f = new FormData();
    f.set("type", "DO");
    f.set("text", "show the product in the first second");
    expect(await saveRuleAction({}, f)).toEqual({ ok: "Suggested. An admin will approve or decline it." });
    expect(await prisma.brandRule.findFirstOrThrow({ where: { clientId: fx.clientA.id, text: "show the product in the first second" } })).toMatchObject({ status: "SUGGESTED" });
  });

  it("an admin approves a suggestion and it applies; a declined one never does", async () => {
    const s = await prisma.brandRule.findFirstOrThrow({ where: { clientId: fx.clientA.id, text: "always show the SPF number" } });
    await decideRule(fx.clientA.id, admin, s.id, true);
    expect((await loadActiveRules(fx.clientA.id, { product: "sun day" })).map((r) => r.text)).toContain("always show the SPF number");
    // Scoped to sun day: not in force for another product.
    expect((await loadActiveRules(fx.clientA.id, { product: "dew drop" })).map((r) => r.text)).not.toContain("always show the SPF number");
    const d = await prisma.brandRule.findFirstOrThrow({ where: { clientId: fx.clientA.id, text: "show the product in the first second" } });
    await decideRule(fx.clientA.id, admin, d.id, false);
    expect((await loadActiveRules(fx.clientA.id)).map((r) => r.text)).not.toContain("show the product in the first second");
  });

  it("Klingit staff edit directly, shown as '· Klingit', and the account lead hears about client changes", async () => {
    await addRule(fx.clientA.id, staff, { type: "CHANNEL", text: "no hashtags in the first line", scope: { channels: ["TikTok"] } });
    const page = await loadRulesPage(fx.clientA.id);
    expect(page.changes.find((c) => c.summary.includes("no hashtags"))).toMatchObject({ byKlingit: true, who: fx.adminUser.name });
    // The lead is the staff member here: told about the admin's and member's changes, never about their own.
    const notes = await prisma.notification.findMany({ where: { clientId: fx.clientA.id, userId: fx.adminUser.id } });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((n) => n.body.includes("no hashtags"))).toBe(false);
  });

  it("imported rules are drafts: never active until approved", async () => {
    const [d] = await addImportedDrafts(fx.clientA.id, admin, "guidelines.pdf", [{ type: "WORDS_AVOID", text: "never say miracle", words: ["miracle"] }]);
    expect(d).toMatchObject({ status: "DRAFT", active: false });
    expect((await loadActiveRules(fx.clientA.id)).some((r) => r.id === d.id)).toBe(false);
    await expect(addImportedDrafts(fx.clientA.id, member, "x.pdf", [{ type: "TONE", text: "y" }])).rejects.toBeInstanceOf(RulePermissionError);
  });
});

describe("history and undo", () => {
  it("every change is stored with before and after, and the last one can be undone", async () => {
    const r = await addRule(fx.clientA.id, admin, { type: "TONE", text: "say we and you" });
    await editRule(fx.clientA.id, admin, r.id, { type: "TONE", text: "say “we” and “you”, never “the consumer”" });
    const edit = await prisma.brandRuleChange.findFirstOrThrow({ where: { ruleId: r.id, action: "edited" } });
    expect(edit.before).toMatchObject({ text: "say we and you" });
    expect(edit.after).toMatchObject({ text: "say “we” and “you”, never “the consumer”" });
    // The add can't be undone while a newer change to the same rule stands.
    const add = await prisma.brandRuleChange.findFirstOrThrow({ where: { ruleId: r.id, action: "added" } });
    await expect(undoChange(fx.clientA.id, admin, add.id)).rejects.toThrow(/Undo the newer change first/);
    await undoChange(fx.clientA.id, admin, edit.id);
    expect((await prisma.brandRule.findUniqueOrThrow({ where: { id: r.id } })).text).toBe("say we and you");
    // Undoing the add then removes the rule (kept for the history, out of force).
    await undoChange(fx.clientA.id, admin, add.id);
    expect((await loadActiveRules(fx.clientA.id)).some((x) => x.id === r.id)).toBe(false);
  });

  it("a removed rule comes back with undo", async () => {
    const r = await addRule(fx.clientA.id, admin, { type: "DO", text: "show texture close up" });
    await deleteRule(fx.clientA.id, admin, r.id);
    expect((await loadActiveRules(fx.clientA.id)).some((x) => x.id === r.id)).toBe(false);
    const del = await prisma.brandRuleChange.findFirstOrThrow({ where: { ruleId: r.id, action: "deleted" } });
    await undoChange(fx.clientA.id, admin, del.id);
    expect((await loadActiveRules(fx.clientA.id)).some((x) => x.id === r.id)).toBe(true);
  });
});

describe("one rule check, applied at once", () => {
  it("word lists are matched as whole words, case-insensitive", async () => {
    await changeWord(fx.clientA.id, admin, "WORDS_AVOID", "flawless", true);
    await changeWord(fx.clientA.id, admin, "WORDS_AVOID", "anti-ageing", true);
    expect(findWord("The serum for Flawless skin.", "flawless")).toEqual(["Flawless"]);
    expect(findWord("flawlessness", "flawless")).toEqual([]);
    const c = await checkCopy(fx.clientA.id, "Meet Dew Drop! The serum for flawless, anti-ageing skin.", { ai: false });
    expect(c.violations).toHaveLength(1);
    expect(c.violations[0].offending.sort()).toEqual(["anti-ageing", "flawless"]);
    expect(c.passed).toBe(c.total - 1);
  });

  it("counts are real: used once per check, caught when broken", async () => {
    const list = await prisma.brandRule.findFirstOrThrow({ where: { clientId: fx.clientA.id, source: "word_list", type: "WORDS_AVOID" } });
    const before = list.caughtCount;
    await checkCopy(fx.clientA.id, "soft, calm and dewy", { ai: false });
    const after = await prisma.brandRule.findUniqueOrThrow({ where: { id: list.id } });
    expect(after.usedCount).toBe(list.usedCount + 1);
    expect(after.caughtCount).toBe(before);
  });

  it("skills read the rules in force right now: a change applies on the very next run", async () => {
    const r = await addRule(fx.clientA.id, admin, { type: "TONE", text: "one question mark is ok in social copy" });
    const ctx = () => loadBrandForAgents(fx.clientA.id).then((b) => buildBrandContext(fx.clientA, b));
    expect(await ctx()).toContain("one question mark is ok in social copy");
    await setRuleActive(fx.clientA.id, admin, r.id, false);
    expect(await ctx()).not.toContain("one question mark is ok in social copy");
    // Suggestions never reach a prompt.
    await addRule(fx.clientA.id, member, { type: "TONE", text: "use emojis everywhere" });
    expect(await ctx()).not.toContain("use emojis everywhere");
  });
});
