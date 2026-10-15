import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { createContract, pauseContract } from "@/lib/contracts";
import { ensureGrants, poolBalance, slotsForContract, teamBalances } from "@/lib/team-ledger";
import { consumeForApprovedEstimate } from "@/lib/team-credits";
import { aiCreditStatus, teamAllowance } from "@/lib/ai-credits";
import { slotUsage } from "@/lib/active-slots";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let pmId: string;
const d = (s: string) => new Date(`${s}T12:00:00`);

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const u = await prisma.user.create({ data: { name: "Lea Ledger", email: `ledger-${Date.now()}@test.local`, role: "INTERNAL", status: "ACTIVE" } });
  pmId = (await prisma.staffMember.create({ data: { userId: u.id, title: "ACCOUNT_LEAD" } })).id;
  await createContract({ clientId: fx.clientA.id, platformPlanKey: "enterprise", teamPackKey: "pmc20_40", termMonths: 12, startDate: new Date("2026-09-01T00:00:00"), currency: "EUR", contactStaffId: pmId }, null);
});
afterAll(async () => {
  await prisma.contract.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
});

async function approve(clientId: string, lines: { credits: number; balance: string }[], at: Date) {
  const project = await prisma.project.create({ data: { clientId, name: `Ledger ${Math.random()}`, type: "CAMPAIGN", status: "IN_PRODUCTION" } });
  const total = lines.reduce((n, l) => n + l.credits, 0);
  const est = await prisma.estimate.create({ data: { projectId: project.id, status: "APPROVED", totalCredits: total, version: 1, approvedVersion: 1 } });
  await prisma.estimateLineItem.createMany({ data: lines.map((l, i) => ({ estimateId: est.id, deliverable: l.balance === "pm" ? "PM" : "Posts", detail: "", quantity: 1, credits: l.credits, hours: l.credits, balance: l.balance, order: i })) });
  const rows = await consumeForApprovedEstimate(est.id, fx.userA.id);
  await prisma.creditLedgerEntry.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { createdAt: at } });
}

describe("team credit ledgers: PM and creative, never pooled", () => {
  it("grants the pack on the 1st, into two balances; teamAllowance reads the contract", async () => {
    await ensureGrants(fx.clientA.id, d("2026-09-15"));
    expect([await poolBalance(fx.clientA.id, "pm"), await poolBalance(fx.clientA.id, "creative")]).toEqual([20, 40]);
    expect(await teamAllowance(fx.clientA.id)).toMatchObject({ value: 60, source: "contract", planName: "PM + creative 20 + 40" });
    // A second run changes nothing, even several at once (pages load balances in parallel).
    await Promise.all(Array.from({ length: 6 }, () => ensureGrants(fx.clientA.id, d("2026-09-20"))));
    expect(await prisma.creditLedgerEntry.count({ where: { clientId: fx.clientA.id, type: "ALLOWANCE" } })).toBe(2);
  });

  it("approving an estimate takes PM lines from PM and creative lines from creative", async () => {
    await approve(fx.clientA.id, [{ credits: 10, balance: "creative" }, { credits: 2, balance: "pm" }], d("2026-09-20"));
    expect([await poolBalance(fx.clientA.id, "pm"), await poolBalance(fx.clientA.id, "creative")]).toEqual([18, 30]);
  });

  it("rolls over up to 150% of the monthly amount; the rest expires at the next grant", async () => {
    await Promise.all(Array.from({ length: 5 }, () => ensureGrants(fx.clientA.id, d("2026-10-02"))));
    // PM: 18 left, at most 10 carries (30 − 20) → 8 expire; creative: 30 left, 20 carries → 10 expire.
    expect([await poolBalance(fx.clientA.id, "pm"), await poolBalance(fx.clientA.id, "creative")]).toEqual([30, 60]);
    const expired = await prisma.creditLedgerEntry.findMany({ where: { clientId: fx.clientA.id, type: "EXPIRY" }, orderBy: { pool: "asc" } });
    expect(expired.map((e) => [e.pool, e.amount, e.periodKey])).toEqual([
      ["creative", -10, "2026-10"],
      ["pm", -8, "2026-10"],
    ]);
    const b = await teamBalances(fx.clientA.id, d("2026-10-02"));
    expect(b!.pm).toMatchObject({ monthly: 20, granted: 20, carried: 10, expired: 8, left: 30 });
    expect(b!.creative).toMatchObject({ monthly: 40, granted: 40, carried: 20, expired: 10, left: 60 });
  });

  it("fixed-credit services take their credits from creative each month, for their months only, and never roll over", async () => {
    await prisma.serviceAllocation.create({ data: { clientId: fx.clientA.id, name: "Meta Ads", creditsPerMonth: 15, startDate: new Date("2026-11-01T00:00:00"), months: 2 } });
    await ensureGrants(fx.clientA.id, d("2027-01-05"));
    const svc = await prisma.creditLedgerEntry.findMany({ where: { clientId: fx.clientA.id, type: "SERVICE" }, orderBy: { periodKey: "asc" } });
    expect(svc.map((s) => [s.periodKey, s.amount, s.pool])).toEqual([
      ["2026-11", -15, "creative"],
      ["2026-12", -15, "creative"],
    ]);
    const jan = await teamBalances(fx.clientA.id, d("2027-01-05"));
    expect(jan!.creative.services).toBe(0);
    expect(jan!.services.map((s) => s.name)).toEqual(["Meta Ads"]);
  });

  it("an extra creative pack adds to creative only", async () => {
    const before = await poolBalance(fx.clientA.id, "creative");
    await prisma.creditLedgerEntry.create({ data: { clientId: fx.clientA.id, pool: "creative", type: "PURCHASE", amount: 10, balanceAfter: before + 10, note: "Extra pack of 10", createdAt: d("2027-01-06") } });
    const b = await teamBalances(fx.clientA.id, d("2027-01-07"));
    expect([b!.creative.purchased, b!.creative.left, b!.pm.purchased]).toEqual([10, before + 10, 0]);
  });

  it("no PM balance (platform only, one-off work): the PM line comes from creative", async () => {
    await createContract({ clientId: fx.clientB.id, platformPlanKey: "pro", termMonths: 3, startDate: new Date("2026-09-01T00:00:00"), currency: "SEK" }, null);
    await prisma.creditLedgerEntry.create({ data: { clientId: fx.clientB.id, pool: "creative", type: "PURCHASE", amount: 10, balanceAfter: 10, note: "Pack of 10", createdAt: d("2026-09-02") } });
    await approve(fx.clientB.id, [{ credits: 6, balance: "creative" }, { credits: 0.5, balance: "pm" }], d("2026-09-03"));
    expect([await poolBalance(fx.clientB.id, "pm"), await poolBalance(fx.clientB.id, "creative")]).toEqual([0, 3.5]);
    // A row from before the contract (the earlier single-balance model) never counts.
    await prisma.creditLedgerEntry.create({ data: { clientId: fx.clientB.id, type: "CONSUMPTION", amount: -50, balanceAfter: -50, note: "Before the contract", createdAt: d("2026-08-15") } });
    expect(await poolBalance(fx.clientB.id, "creative")).toBe(3.5);
  });

  it("a paused month gets no grant", async () => {
    const c = await prisma.contract.findFirstOrThrow({ where: { clientId: fx.clientA.id } });
    await pauseContract(c.id, null, null, new Date("2027-01-20T00:00:00"));
    await ensureGrants(fx.clientA.id, d("2027-02-10"));
    expect(await prisma.creditLedgerEntry.count({ where: { clientId: fx.clientA.id, type: "ALLOWANCE", periodKey: "2027-02" } })).toBe(0);
  });

  it("slots come from creative credits (1 per 10, at least 1) plus extra slots, not the platform plan", async () => {
    expect(await slotsForContract({ creativeCreditsPerMonth: 40, pmCreditsPerMonth: 20, extraSlots: 0 })).toBe(4);
    expect(await slotsForContract({ creativeCreditsPerMonth: 0, pmCreditsPerMonth: 20, extraSlots: 0 })).toBe(1);
    expect(await slotsForContract({ creativeCreditsPerMonth: 80, pmCreditsPerMonth: 40, extraSlots: 1 })).toBe(9);
    expect((await slotUsage(fx.clientA.id)).total).toBe(4);
  });

  it("AI credits come from the contract's platform plan and don't roll over", async () => {
    const s = await aiCreditStatus(fx.clientA.id, d("2026-10-10"));
    expect([s.plan.name, s.allowance]).toEqual(["Enterprise", 3000]);
    const basicLike = await aiCreditStatus(fx.clientB.id, d("2026-10-10"));
    expect([basicLike.plan.name, basicLike.allowance]).toEqual(["Pro", 1000]);
    const nov = await aiCreditStatus(fx.clientA.id, d("2026-11-10"));
    expect(nov.allowance).toBe(3000); // a fresh month, nothing carried
  });
});
