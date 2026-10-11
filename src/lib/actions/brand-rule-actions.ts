"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClientAdmin } from "@/lib/client-roles";
import { requireOpsRole } from "@/lib/authz";
import { withAiCharge, assistantCharge, ASSISTANTS } from "@/lib/ai-context";
import { aiGate } from "@/lib/ai-credits";
import { runAgentTask } from "@/lib/ai/run-agent";
import { addImportedDrafts, addRule, changeWord, decideRule, deleteRule, editRule, RULE_TYPES, RulePermissionError, setRuleActive, undoChange, type RuleActor, type RuleInput } from "@/lib/brand-rules";
import { checkCopy, type CopyCheck } from "@/lib/rule-check";
import type { BrandRuleType } from "@/generated/prisma";

/**
 * Brand OS → Rules actions, for the client (admins change, members suggest) and for Klingit staff in ops (they
 * pass the clientId; shown as "· Klingit"). The rules themselves live in brand-rules.ts.
 */

export type RuleFormState = { error?: string; ok?: string };

/** Who is acting on which client's rules. A client user acts on their own client only. */
async function actorFor(formData: FormData): Promise<{ clientId: string; actor: RuleActor }> {
  const session = await auth();
  if (!session?.user) throw new RulePermissionError("Sign in first.");
  if (session.user.role === "INTERNAL") {
    const staff = await requireOpsRole(["ADMIN", "PM"]);
    const clientId = String(formData.get("clientId") ?? "");
    if (!clientId) throw new RulePermissionError("Which client?");
    return { clientId, actor: { userId: staff.userId, name: staff.user.name, kind: "staff" } };
  }
  const member = await prisma.clientUser.findUnique({ where: { userId: session.user.id }, include: { user: { select: { name: true } } } });
  if (!member) throw new RulePermissionError("Sign in first.");
  return { clientId: member.clientId, actor: { userId: session.user.id, name: member.user.name, kind: isClientAdmin(member) ? "admin" : "member" } };
}

function refresh(clientId: string) {
  revalidatePath("/assets/rules");
  revalidatePath("/assets");
  revalidatePath(`/ops/clients/${clientId}/brand-os`);
}

const TYPES = RULE_TYPES.map((t) => t.type);
function ruleInput(formData: FormData): RuleInput {
  const type = String(formData.get("type") ?? "TONE") as BrandRuleType;
  const channels = formData.getAll("channels").map(String).filter(Boolean);
  const products = formData.getAll("products").map(String).filter(Boolean);
  const words = String(formData.get("words") ?? "").split(",").map((w) => w.trim()).filter(Boolean);
  return { type: TYPES.includes(type) ? type : "TONE", text: String(formData.get("text") ?? ""), words, scope: formData.get("scope") === "pick" ? { channels, products } : {} };
}

async function guarded(formData: FormData, fn: (clientId: string, actor: RuleActor) => Promise<string | void>): Promise<RuleFormState> {
  try {
    const { clientId, actor } = await actorFor(formData);
    const ok = await fn(clientId, actor);
    refresh(clientId);
    return { ok: ok ?? "Saved." };
  } catch (e) {
    if (e instanceof RulePermissionError) return { error: e.message };
    throw e;
  }
}

/** Add (or, for a member, suggest) or edit a rule. */
export async function saveRuleAction(_prev: RuleFormState, formData: FormData): Promise<RuleFormState> {
  return guarded(formData, async (clientId, actor) => {
    const id = String(formData.get("id") ?? "");
    if (id) {
      await editRule(clientId, actor, id, ruleInput(formData));
      return "Rule saved. It applies right away.";
    }
    const rule = await addRule(clientId, actor, ruleInput(formData));
    return rule.status === "SUGGESTED" ? "Suggested. An admin will approve or decline it." : "Rule added. It applies right away.";
  });
}

export async function ruleStatusAction(formData: FormData) {
  await guarded(formData, async (clientId, actor) => {
    const id = String(formData.get("id") ?? "");
    const op = String(formData.get("op") ?? "");
    if (op === "on" || op === "off") await setRuleActive(clientId, actor, id, op === "on");
    else if (op === "delete") await deleteRule(clientId, actor, id);
    else if (op === "approve" || op === "decline") await decideRule(clientId, actor, id, op === "approve");
  });
}

export async function wordAction(formData: FormData) {
  await guarded(formData, async (clientId, actor) => {
    const type = formData.get("list") === "use" ? "WORDS_USE" : "WORDS_AVOID";
    await changeWord(clientId, actor, type, String(formData.get("word") ?? ""), formData.get("op") !== "remove");
  });
}

export async function undoRuleChangeAction(formData: FormData) {
  await guarded(formData, async (clientId, actor) => {
    await undoChange(clientId, actor, String(formData.get("changeId") ?? ""));
  });
}

export type TestCopyState = { error?: string; text?: string; result?: CopyCheck };

/** "Test copy against your rules": the shared rule check, on the client's AI credits (≈1 a check). */
export async function testCopyAction(_prev: TestCopyState, formData: FormData): Promise<TestCopyState> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Paste some copy first." };
  try {
    const { clientId, actor } = await actorFor(formData);
    if (actor.kind === "staff") return { text, result: await checkCopy(clientId, text) };
    const gate = await aiGate(clientId, "assistant");
    if (!gate.ok) return { error: gate.error, text };
    const result = await withAiCharge(assistantCharge(clientId, actor.userId, ASSISTANTS.ruleCheck), () => checkCopy(clientId, text));
    refresh(clientId);
    return { text, result };
  } catch (e) {
    if (e instanceof RulePermissionError) return { error: e.message, text };
    throw e;
  }
}

const importSchema = z.object({
  rules: z.array(z.object({ type: z.enum(["TONE", "DO", "WORDS_USE", "WORDS_AVOID", "CLAIMS", "CHANNEL"]), text: z.string(), words: z.array(z.string()).describe("Only for WORDS_USE / WORDS_AVOID: the words themselves"), channels: z.array(z.string()).describe("Channels it only applies to, if the guidelines say so") })),
});

/** Import from guidelines: a PDF becomes draft rules an admin approves or rejects one by one. */
export async function importGuidelinesAction(_prev: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF first." };
  if (file.type !== "application/pdf") return { error: "Only PDF files can be imported." };
  if (file.size > 20 * 1024 * 1024) return { error: "PDFs can be up to 20 MB." };
  return guarded(formData, async (clientId, actor) => {
    if (actor.kind === "member") throw new RulePermissionError("Only an admin on your account can import guidelines.");
    const pdf = Buffer.from(await file.arrayBuffer()).toString("base64");
    const run = () =>
      runAgentTask({
        agentKey: "rule_import",
        clientId,
        system: "You turn a brand's guidelines document into short, checkable rules for marketing copy. One rule per line of guidance; skip visual specs (colours, logo, typography) — those live elsewhere. Keep the brand's own words.",
        prompt: "Extract the copy rules from this document. Types: TONE (voice), DO (things to do or not do), WORDS_USE / WORDS_AVOID (word lists), CLAIMS (claims and legal lines), CHANNEL (rules for one channel). At most 40.",
        documents: [{ mediaType: "application/pdf", data: pdf }],
        schema: importSchema,
        summarize: (d) => `${d.rules.length} draft rules`,
      });
    const r = actor.kind === "staff" ? await run() : await withAiCharge(assistantCharge(clientId, actor.userId, ASSISTANTS.ruleImport), run);
    if (!r.ok) throw new RulePermissionError(`Couldn't read that PDF: ${r.error}`);
    const drafts = await addImportedDrafts(clientId, actor, file.name, r.data.rules.map((x) => ({ type: x.type, text: x.text, words: x.words, scope: x.channels.length ? { channels: x.channels } : {} })));
    return drafts.length ? `${drafts.length} draft rule${drafts.length === 1 ? "" : "s"} to review. None apply until you approve them.` : "No copy rules found in that file.";
  });
}
