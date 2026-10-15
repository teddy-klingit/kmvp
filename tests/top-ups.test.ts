import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";
import { createContract } from "@/lib/contracts";
import { aiCreditStatus, aiGate, chargeAi } from "@/lib/ai-credits";
import { topUpOptions } from "@/lib/top-ups";
import { createRequest } from "@/lib/requests";
import { billingProfile } from "@/lib/invoicing";
import { topUpAction } from "@/lib/actions/top-up-actions";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const NOW = new Date("2026-10-15T12:00:00");
const run = (clientId: string, dollars: number) => chargeAi({ clientId, sourceType: "skill", sourceKey: "ad_gen", sourceName: "Ad gen", tokensIn: 0, tokensOut: Math.round((dollars * 1_000_000) / 15), model: "claude-sonnet-5-5" }, NOW);

beforeAll(async () => {
  fx = await createSecurityFixtures();
  for (const c of [fx.clientA, fx.clientB]) await createContract({ clientId: c.id, platformPlanKey: "basic", termMonths: 12, startDate: new Date("2026-09-01T00:00:00"), currency: "EUR" }, null);
  await billingProfile(fx.clientA.id);
  await billingProfile(fx.clientB.id);
});
afterAll(async () => {
  await prisma.contract.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
});

describe("AI top-ups (Phase U)", () => {
  it("offers 1,000 / 3,000 / 10,000 for €25 / €65 / €190, each with how long it lasts at the client's pace", async () => {
    const o = await topUpOptions(fx.clientA.id, 280, NOW);
    expect(o.map((x) => [x.credits, x.price, x.save])).toEqual([
      [1000, 25, 0],
      [3000, 65, 13],
      [10000, 190, 24],
    ]);
    expect(o[0].lasts).toMatch(/about/i);
  });

  it("a top-up is added right away, goes on the next invoice and rolls over to next month", async () => {
    await createRequest(fx.clientA.id, fx.userA.id, "ai_topup", { option: 0 }, NOW);
    expect((await aiCreditStatus(fx.clientA.id, NOW)).bundleLeft).toBe(1000);
    expect(await prisma.billingItem.count({ where: { clientId: fx.clientA.id, kind: "ai_topup", amount: 25 } })).toBe(1);
    expect((await aiCreditStatus(fx.clientA.id, new Date("2026-11-10T12:00:00"))).bundleLeft).toBe(1000);
  });

  it("at most €250 of top-ups a month", async () => {
    await createRequest(fx.clientA.id, fx.userA.id, "ai_topup", { option: 2 }, NOW); // 25 + 190 = 215
    await expect(createRequest(fx.clientA.id, fx.userA.id, "ai_topup", { option: 1 }, NOW)).rejects.toThrow(/limit/); // +65 > 250
  });

  it("only client admins can top up", async () => {
    await prisma.clientUser.updateMany({ where: { userId: fx.userB.id }, data: { permission: "VIEWER" } });
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    const fd = new FormData();
    fd.set("option", "0");
    expect((await topUpAction({}, fd)).error).toMatch(/admin/);
  });

  it("at 100% skills pause by default; 'bill overage' keeps them running and bills the extra at the top-up rate", async () => {
    await run(fx.clientB.id, 3.2); // $3.20 = 320 credits on Basic's 300
    expect((await aiGate(fx.clientB.id, "skill", NOW)).ok).toBe(false);
    expect((await aiGate(fx.clientB.id, "assistant", NOW)).ok).toBe(true);
    await prisma.billingProfile.update({ where: { clientId: fx.clientB.id }, data: { aiOverage: "bill" } });
    expect((await aiGate(fx.clientB.id, "skill", NOW)).ok).toBe(true);
    await run(fx.clientB.id, 0.5);
    const over = await prisma.billingItem.findFirstOrThrow({ where: { clientId: fx.clientB.id, kind: "ai_overage" } });
    expect(over.quantity).toBe(50);
    expect(over.amount).toBeCloseTo(1.25); // 50 × €25 / 1,000
  });

  it("automatic top-up: 1,000 when below 100, at most 3 a month", async () => {
    await prisma.billingProfile.update({ where: { clientId: fx.clientB.id }, data: { autoTopUp: true, aiOverage: null } });
    await prisma.aiCreditLedger.create({ data: { clientId: fx.clientB.id, kind: "ADJUSTMENT", amount: 1000, note: "test", createdAt: NOW } });
    for (let i = 0; i < 6; i++) await run(fx.clientB.id, 9.5);
    const auto = (await prisma.purchaseRequest.findMany({ where: { clientId: fx.clientB.id, kind: "ai_topup" } })).filter((r) => (r.payload as { auto?: boolean }).auto);
    expect(auto.length).toBe(3);
  });
});
