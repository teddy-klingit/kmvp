import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// The model call is faked: a structured answer with real-looking token usage.
const model = vi.hoisted(() => ({ usage: { input_tokens: 2000, output_tokens: 400 } }));
vi.mock("@/lib/ai/client", () => ({
  AGENT_MODEL: "claude-opus-5",
  anthropic: { messages: { parse: async () => ({ parsed_output: { answer: "ok" }, usage: model.usage }) } },
}));

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { aiCreditStatus, aiGate, chargeAi, creditsForTokens, ensurePeriod } from "@/lib/ai-credits";
import { withAiCharge } from "@/lib/ai-context";
import { runAgentTask } from "@/lib/ai/run-agent";
import { consumeForApprovedEstimate } from "@/lib/team-credits";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const NOW = new Date(Date.UTC(2026, 9, 10, 12));
const charge = (clientId: string, tokensIn: number, tokensOut: number) => chargeAi({ clientId, sourceType: "skill", sourceKey: "ad_gen", sourceName: "Ad gen", tokensIn, tokensOut, model: "claude-opus-5" }, NOW);

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.plan.upsert({ where: { tier: "STARTER" }, update: { monthlyAiCredits: 500 }, create: { tier: "STARTER", activeSlots: 1, name: "Starter", monthlyAiCredits: 500 } });
  await prisma.plan.upsert({ where: { tier: "BASIC" }, update: { ownModel: true, monthlyAiCredits: 0 }, create: { tier: "BASIC", activeSlots: 1, name: "Basic", ownModel: true } });
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { planTier: "STARTER" } });
  await prisma.client.update({ where: { id: fx.clientB.id }, data: { planTier: "BASIC" } });
  for (const key of ["test_skill", "test_internal"]) {
    await prisma.agent.upsert({ where: { key }, update: {}, create: { key, name: key === "test_skill" ? "Test skill" : "Test internal", category: "PRODUCTION", description: "test", kind: key === "test_skill" ? "SKILL" : "INTERNAL", selfService: key === "test_skill" } });
  }
});
afterAll(async () => {
  await prisma.agentRun.deleteMany({ where: { agent: { key: { in: ["test_skill", "test_internal"] } } } });
  await prisma.agent.deleteMany({ where: { key: { in: ["test_skill", "test_internal"] } } });
  await fx.cleanup();
});

describe("AI credits", () => {
  it("converts real token counts into credits in one documented place", () => {
    // (2,000 in + 5 × 400 out) / 1,000 = 4 credits on the default model; a search and an image add on top.
    expect(creditsForTokens({ tokensIn: 2000, tokensOut: 400, model: "claude-opus-5" })).toBe(4);
    expect(creditsForTokens({ tokensIn: 2000, tokensOut: 400, model: "claude-opus-5", webSearches: 1, images: 1 })).toBe(4 + 1 + 12);
  });

  it("opens each monthly period once, with that plan's allowance", async () => {
    await ensurePeriod(fx.clientA.id, NOW);
    await ensurePeriod(fx.clientA.id, NOW);
    expect(await prisma.aiCreditLedger.count({ where: { clientId: fx.clientA.id, kind: "ALLOWANCE" } })).toBe(1);
    expect((await aiCreditStatus(fx.clientA.id, NOW)).allowance).toBe(500);
  });

  it("uses the allowance first, then bundles, and every row adds up to the charge", async () => {
    await prisma.aiCreditLedger.create({ data: { clientId: fx.clientA.id, kind: "BUNDLE", amount: 250, createdAt: NOW } });
    await prisma.aiCreditLedger.create({ data: { clientId: fx.clientA.id, kind: "USAGE", amount: -498, fundedBy: "allowance", sourceType: "skill", sourceKey: "ad_gen", sourceName: "Ad gen", createdAt: NOW } });
    const r = await charge(fx.clientA.id, 2000, 400); // 4 credits: 2 from the allowance, 2 from the bundle
    expect(r.credits).toBe(4);
    const s = await aiCreditStatus(fx.clientA.id, NOW);
    expect([s.allowanceLeft, s.bundleLeft, s.left, s.used]).toEqual([0, 248, 248, 502]);
    const rows = await prisma.aiCreditLedger.findMany({ where: { clientId: fx.clientA.id, kind: "USAGE", agentRunId: null, sourceKey: "ad_gen", amount: { gt: -100 } } });
    expect(rows.reduce((a, x) => a + x.amount, 0)).toBe(-4);
    expect(rows.map((x) => x.fundedBy).sort()).toEqual(["allowance", "bundle"]);
  });

  it("tells the client's admins once at 80% and once at 100%", async () => {
    const owner = await prisma.clientUser.findFirstOrThrow({ where: { clientId: fx.clientA.id, permission: "OWNER" } });
    const titles = (await prisma.notification.findMany({ where: { userId: owner.userId, clientId: fx.clientA.id } })).map((n) => n.title);
    expect(titles.filter((t) => t.includes("AI credits"))).toEqual(["You've used this month's AI credits"]);
  });

  it("blocks a skill run when nothing is left; assistants are never blocked or warned (they don't use AI credits)", async () => {
    await prisma.aiCreditLedger.create({ data: { clientId: fx.clientA.id, kind: "USAGE", amount: -248, fundedBy: "bundle", sourceType: "skill", sourceKey: "ad_gen", sourceName: "Ad gen", createdAt: NOW } });
    const skill = await aiGate(fx.clientA.id, "skill", NOW);
    expect(skill.ok).toBe(false);
    expect(!skill.ok && skill.topUp).toBe(true);
    const assistant = await aiGate(fx.clientA.id, "assistant", NOW);
    expect(assistant).toEqual({ ok: true, warning: null });
  });

  it("on Basic, logs the tokens as billed by the client's provider and deducts nothing", async () => {
    const r = await charge(fx.clientB.id, 3000, 1000);
    expect(r).toEqual({ credits: 0, billedTo: "client_provider" });
    const s = await aiCreditStatus(fx.clientB.id, NOW);
    expect([s.used, s.providerTokens]).toEqual([0, 4000]);
    const gate = await aiGate(fx.clientB.id, "skill", NOW);
    expect(!gate.ok && gate.error).toMatch(/connect your own AI model/);
  });

  it("charges only client-triggered runs, from the response's real token counts", async () => {
    const schema = z.object({ answer: z.string() });
    const before = await prisma.aiCreditLedger.count({ where: { clientId: fx.clientA.id, kind: "USAGE" } });
    // Klingit's own production work: tokens recorded on the run, never charged.
    const internal = await runAgentTask({ agentKey: "test_internal", clientId: fx.clientA.id, system: "s", prompt: "p", schema });
    expect(internal.ok).toBe(true);
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: internal.ok ? internal.runId : "" } });
    expect([run.tokensIn, run.tokensOut, run.aiCredits]).toEqual([2000, 400, null]);
    expect(await prisma.aiCreditLedger.count({ where: { clientId: fx.clientA.id, kind: "USAGE" } })).toBe(before);
    // A client-triggered assistant answer: its cost is logged (billable: false), never charged.
    await prisma.aiCreditLedger.create({ data: { clientId: fx.clientA.id, kind: "ADJUSTMENT", amount: 100, note: "test" } });
    const asked = await withAiCharge({ clientId: fx.clientA.id, sourceType: "assistant", sourceKey: "ask_your_data", sourceName: "Ask your data" }, () => runAgentTask({ agentKey: "test_internal", clientId: fx.clientA.id, system: "s", prompt: "p", schema }));
    const charged = await prisma.agentRun.findUniqueOrThrow({ where: { id: asked.ok ? asked.runId : "" } });
    expect(charged.aiCredits).toBe(0);
    const row = await prisma.aiCreditLedger.findFirstOrThrow({ where: { agentRunId: charged.id } });
    expect([row.sourceName, row.tokensIn, row.tokensOut, row.amount, row.billable]).toEqual(["Ask your data", 2000, 400, -4, false]);
    // A client-triggered skill run is charged.
    const before2 = (await aiCreditStatus(fx.clientA.id)).used;
    const ran = await withAiCharge({ clientId: fx.clientA.id, sourceType: "skill", sourceKey: "ad_gen", sourceName: "Ad gen" }, () => runAgentTask({ agentKey: "test_internal", clientId: fx.clientA.id, system: "s", prompt: "p", schema }));
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: ran.ok ? ran.runId : "" } })).aiCredits).toBe(4);
    expect((await aiCreditStatus(fx.clientA.id)).used).toBe(before2 + 4);
  });
});

describe("team credits", () => {
  it("approving an estimate takes its credits per deliverable, attributed to the approver; a revision only the difference", async () => {
    const project = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Credits test", type: "CAMPAIGN", status: "ESTIMATING" } });
    const estimate = await prisma.estimate.create({ data: { projectId: project.id, status: "APPROVED", totalCredits: 10, totalHours: 10, version: 1 } });
    await prisma.estimateLineItem.createMany({
      data: [
        { estimateId: estimate.id, deliverable: "Story 9:16", detail: "", credits: 6, hours: 6, quantity: 1, order: 0 },
        { estimateId: estimate.id, deliverable: "Feed 4:5", detail: "", credits: 4, hours: 4, quantity: 1, order: 1 },
      ],
    });
    await consumeForApprovedEstimate(estimate.id, fx.userA.id);
    let rows = await prisma.creditLedgerEntry.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.format, r.amount, r.userId])).toEqual([
      ["Story 9:16", -6, fx.userA.id],
      ["Feed 4:5", -4, fx.userA.id],
    ]);
    // Approving the same estimate again takes nothing more; a revision to 13 takes 3.
    await consumeForApprovedEstimate(estimate.id, fx.userA.id);
    await prisma.estimate.update({ where: { id: estimate.id }, data: { totalCredits: 13, version: 2 } });
    await consumeForApprovedEstimate(estimate.id, fx.userA.id);
    rows = await prisma.creditLedgerEntry.findMany({ where: { projectId: project.id } });
    expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(-13);
  });
});
