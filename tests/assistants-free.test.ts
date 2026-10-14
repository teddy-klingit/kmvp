import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const model = vi.hoisted(() => ({ usage: { input_tokens: 3000, output_tokens: 600 } }));
vi.mock("@/lib/ai/client", () => ({
  AGENT_MODEL: "claude-opus-5",
  anthropic: { messages: { parse: async () => ({ parsed_output: { answer: "ok" }, usage: model.usage }) } },
}));

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { aiCreditStatus } from "@/lib/ai-credits";
import { ASSISTANTS, assistantCharge, withAiCharge } from "@/lib/ai-context";
import { runAgentTask } from "@/lib/ai/run-agent";
import { getSetting } from "@/lib/platform-settings";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const schema = z.object({ answer: z.string() });
const ask = (clientId: string, a: (typeof ASSISTANTS)[keyof typeof ASSISTANTS]) => withAiCharge(assistantCharge(clientId, null, a), () => runAgentTask({ agentKey: "test_assistant", clientId, system: "s", prompt: "p", schema }));

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.plan.upsert({ where: { tier: "STARTER" }, update: { monthlyAiCredits: 500, ownModel: false }, create: { tier: "STARTER", activeSlots: 1, name: "Starter", monthlyAiCredits: 500 } });
  await prisma.client.updateMany({ where: { id: { in: [fx.clientA.id, fx.clientB.id] } }, data: { planTier: "STARTER" } });
  await prisma.agent.upsert({ where: { key: "test_assistant" }, update: {}, create: { key: "test_assistant", name: "Test assistant", category: "FEEDBACK", description: "test", kind: "ASSISTANT" } });
});
afterAll(async () => {
  await prisma.platformSetting.upsert({ where: { key: "assistantFairUsePerDay" }, update: { value: 200 }, create: { key: "assistantFairUsePerDay", value: 200 } });
  await prisma.agentRun.deleteMany({ where: { agent: { key: "test_assistant" } } });
  await prisma.agent.deleteMany({ where: { key: "test_assistant" } });
  await fx.cleanup();
});

describe("assistants never use AI credits (Phase S)", () => {
  it("every built-in assistant logs its cost as not billable and leaves the balance alone", async () => {
    const before = await aiCreditStatus(fx.clientA.id);
    for (const a of Object.values(ASSISTANTS)) {
      const r = await ask(fx.clientA.id, a);
      expect(r.ok, a.sourceName).toBe(true);
      const row = await prisma.aiCreditLedger.findFirstOrThrow({ where: { agentRunId: r.ok ? r.runId : "" } });
      expect([row.sourceKey, row.billable, row.amount < 0]).toEqual([a.sourceKey, false, true]);
    }
    const after = await aiCreditStatus(fx.clientA.id);
    expect([after.used, after.left]).toEqual([before.used, before.left]);
  });

  it("no assistant call site charges as a skill", () => {
    // Every assistant goes through assistantCharge (sourceType "assistant"); a hand-written skill context would charge.
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : f.endsWith(".ts") && files.push(path.join(d, f))));
    walk(path.join(__dirname, "../src/lib"));
    const offenders = files.filter((f) => /ASSISTANTS\.\w+/.test(readFileSync(f, "utf8")) && /sourceType:\s*"skill"[^}]*ASSISTANTS/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("past the fair-use limit it answers with a calm message and charges nothing", async () => {
    await prisma.platformSetting.upsert({ where: { key: "assistantFairUsePerDay" }, update: { value: 2 }, create: { key: "assistantFairUsePerDay", value: 2 } });
    expect(await getSetting("assistantFairUsePerDay")).toBe(2);
    const used = await prisma.aiCreditLedger.count({ where: { clientId: fx.clientB.id, kind: "USAGE" } });
    expect((await ask(fx.clientB.id, ASSISTANTS.ask)).ok).toBe(true);
    expect((await ask(fx.clientB.id, ASSISTANTS.brief)).ok).toBe(true);
    const third = await ask(fx.clientB.id, ASSISTANTS.ruleCheck);
    expect(third.ok).toBe(false);
    expect(!third.ok && third.error).toMatch(/breather until tomorrow/);
    expect(await prisma.aiCreditLedger.count({ where: { clientId: fx.clientB.id, kind: "USAGE" } })).toBe(used + 2);
    expect((await aiCreditStatus(fx.clientB.id)).used).toBe(0);
  });
});
