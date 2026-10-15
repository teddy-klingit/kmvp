import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";
import { createContract } from "@/lib/contracts";
import { chargeAi } from "@/lib/ai-credits";
import { loadAiUsage } from "@/lib/ai-usage-admin";
import { saveAiPlansAction } from "@/lib/actions/ai-usage-actions";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const TEST_PLAN = `test_plan_${Date.now()}`;
const NOW = new Date("2026-10-15T12:00:00");
const run = (clientId: string, dollars: number, sourceType: "skill" | "assistant" = "skill") =>
  chargeAi({ clientId, sourceType, sourceKey: sourceType === "skill" ? "ad_gen" : "brand_chat", sourceName: sourceType === "skill" ? "Ad gen" : "Brand chat", tokensIn: 0, tokensOut: Math.round((dollars * 1_000_000) / 15), model: "claude-sonnet-5-5" }, NOW);

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.platformPlan.create({ data: { key: TEST_PLAN, name: "Test plan", priceEur: 50, aiCreditsPerMonth: 500, aiBudgetUsd: 5, active: false } });
  await createContract({ clientId: fx.clientA.id, platformPlanKey: "basic", termMonths: 12, startDate: new Date("2026-09-01T00:00:00"), currency: "EUR" }, null);
  await run(fx.clientA.id, 2.55); // 255 of 300 credits
  await run(fx.clientA.id, 0.4, "assistant"); // free for clients
});
afterAll(async () => {
  await prisma.platformPlan.delete({ where: { key: TEST_PLAN } });
  await prisma.contract.deleteMany({ where: { clientId: fx.clientA.id } });
  await fx.cleanup();
});

describe("Admin → AI usage (Phase U)", () => {
  it("shows what each plan may cost us: Basic $3 = 300 credits, and the top-up sold at a markup", async () => {
    const u = await loadAiUsage("month", NOW);
    const basic = u.plans.find((p) => p.key === "basic")!;
    expect([basic.budgetUsd, basic.credits]).toEqual([3, 300]);
    expect(u.topUp?.credits).toBe(1000);
    expect(u.topUp!.markup).toBeGreaterThan(1);
  });

  it("splits skill and assistant cost, and the client's bar is at 85% (close to the ceiling)", async () => {
    const u = await loadAiUsage("month", NOW);
    const a = u.clients.find((c) => c.id === fx.clientA.id)!;
    expect([a.used, a.of, a.pct]).toEqual([255, 300, 85]);
    expect(a.costUsd).toBeCloseTo(2.95, 2);
    expect(u.tiles.over80.some((c) => c.id === fx.clientA.id)).toBe(true);
    expect(u.skills.find((s) => s.name === "Ad gen")!.costUsd).toBeCloseTo(2.55, 2);
    expect(u.assistants.names).toContain("Brand chat");
    expect(u.tiles.costPerCredit).toBeCloseTo(0.01, 3);
  });

  it("an admin changes a plan's AI budget; the credits follow and the change is logged", async () => {
    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    const fd = new FormData();
    fd.set("usdPerCredit", "0.01");
    fd.set(`budget_${TEST_PLAN}`, "4");
    await expect(saveAiPlansAction(fd)).rejects.toThrow(/REDIRECT:\/ops\/admin\/ai-usage/);
    const plan = await prisma.platformPlan.findUniqueOrThrow({ where: { key: TEST_PLAN } });
    expect([plan.aiBudgetUsd, plan.aiCreditsPerMonth]).toEqual([4, 400]);
    expect(await prisma.auditLog.count({ where: { area: "pricing", actorUserId: fx.adminUser.id, action: { contains: "AI budget of Test plan" } } })).toBe(1);
  });
});
