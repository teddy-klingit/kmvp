import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";
import { budgetShiftOpportunity, confidenceFrom, upsertCombinedOpportunity } from "@/lib/combined";
import { addCombinedToPlanAction, dismissOpportunityAction } from "@/lib/actions/opportunity-actions";

/** Phase V: confidence from rules; no recommendation below the minimums; Do it and "Don't trust the data". */

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let pmUserId: string;
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const u = await prisma.user.create({ data: { name: "Tove PM", email: `tove-${Date.now()}@test.local`, role: "INTERNAL", status: "ACTIVE" } });
  pmUserId = u.id;
  const pm = await prisma.staffMember.create({ data: { userId: u.id, title: "ACCOUNT_LEAD" } });
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { accountLeadId: pm.id } });
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { clientId: fx.clientA.id } });
  await fx.cleanup();
  await prisma.staffMember.deleteMany({ where: { userId: pmUserId } });
  await prisma.user.deleteMany({ where: { id: pmUserId } });
});

describe("rules for AI on combined data", () => {
  it("confidence comes from rules, not the model: High / Medium / Low, nothing below the minimums", () => {
    expect(confidenceFrom({ enough: true, agree: true, holds: true })).toBe("high");
    expect(confidenceFrom({ enough: true, agree: false, holds: true })).toBe("medium");
    expect(confidenceFrom({ enough: true, agree: null, holds: false })).toBe("low");
    expect(confidenceFrom({ enough: false, agree: true, holds: true })).toBeNull();
  });

  it("below the minimums there's no recommendation, only \"not enough data yet\"", async () => {
    const asset = await prisma.asset.create({ data: { clientId: fx.clientA.id, projectId: fx.projectA.id, name: "Story", format: "Story 9:16", status: "DELIVERED", sentVersion: 1 } });
    const day = new Date().toISOString().slice(0, 10);
    await prisma.metricDaily.createMany({
      data: (["first", "last"] as const).flatMap((model) => [
        { clientId: fx.clientA.id, date: day, source: "Shopify", channel: "Meta", outputId: asset.id, utmContent: asset.id, path: "online", model, metric: "orders", value: 40 },
        { clientId: fx.clientA.id, date: day, source: "Shopify", channel: "Meta", outputId: asset.id, utmContent: asset.id, path: "online", model, metric: "revenue", value: 2000 },
      ]),
    });
    const r = await budgetShiftOpportunity(fx.clientA.id);
    expect(r && "notEnough" in r && r.notEnough).toMatch(/Not enough data yet: 40 Story and 0 Feed orders/);
    await upsertCombinedOpportunity(fx.clientA.id);
    expect(await prisma.opportunity.count({ where: { clientId: fx.clientA.id, origin: "combined" } })).toBe(0);
  });

  it("Add to plan puts the formats on the plan item; \"Don't trust the data\" is logged and goes to the PM", async () => {
    const item = await prisma.clientCalendarItem.create({ data: { clientId: fx.clientA.id, title: "Black Friday", date: new Date(Date.now() + 30 * 86400000), channel: "Meta", formats: ["Feed ad", "Email"] } });
    const combined = { actions: { addToPlan: { planItemId: item.id, label: "Add to Black Friday plan", formats: ["Stories"] } } };
    const a = await prisma.opportunity.create({ data: { clientId: fx.clientA.id, title: "Move budget", summary: "s", origin: "combined", combined } });
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    await expect(addCombinedToPlanAction(form({ id: a.id }))).rejects.toThrow(/REDIRECT:\/planner\?item=/);
    expect((await prisma.clientCalendarItem.findUniqueOrThrow({ where: { id: item.id } })).formats).toEqual(["Feed ad", "Email", "Stories"]);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("added");
    // Client B can't add client A's.
    const b = await prisma.opportunity.create({ data: { clientId: fx.clientA.id, title: "Another", summary: "s", origin: "combined", combined } });
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    await addCombinedToPlanAction(form({ id: b.id }));
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("new");

    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    await expect(dismissOpportunityAction(form({ id: b.id, reason: "Don't trust the data", back: "1" }))).rejects.toThrow(/REDIRECT/);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: b.id } })).dismissReason).toBe("Don't trust the data");
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, area: "opportunities", action: { contains: "trust the data" } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: pmUserId, clientId: fx.clientA.id } })).toBe(1);
  });
});
