import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { goalViews } from "@/lib/insights/goals";
import { deleteGoalAction, saveGoalAction } from "@/lib/actions/ops-goal-actions";

/** Phase X8: the client's goals, measured from the data layer or by hand, set by staff. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const NOW = new Date("2026-11-01T12:00:00Z");

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const c = fx.clientA.id;
  // Online sales: 1,310 this year to date vs 1,000 the same days last year (+31%).
  await prisma.metricDaily.createMany({
    data: [
      { clientId: c, date: "2026-03-01", source: "Shopify", channel: "Meta", path: "online", model: "first", metric: "revenue", value: 1310 },
      { clientId: c, date: "2026-03-01", source: "Shopify", channel: "Meta", path: "online", model: "last", metric: "revenue", value: 1310 },
      { clientId: c, date: "2025-03-01", source: "Shopify", channel: "Meta", path: "online", model: "first", metric: "revenue", value: 1000 },
      { clientId: c, date: "2025-03-01", source: "Shopify", channel: "Meta", path: "online", model: "last", metric: "revenue", value: 1000 },
      // A page-level row is a breakdown, never counted again.
      { clientId: c, date: "2026-03-01", source: "Shopify", channel: "", page: "/x", path: "online", model: "last", metric: "revenue", value: 999 },
    ],
  });
  await prisma.clientGoal.createMany({
    data: [
      { clientId: c, title: "+40% online sales vs 2025", measure: "online_sales_yoy", target: 40, startAt: new Date("2026-01-01T12:00:00Z"), dueAt: new Date("2026-12-31T12:00:00Z"), sortOrder: 0 },
      { clientId: c, title: "10,000 community members", target: 10000, current: 6100, unit: "members", note: "sign-ups slowed since August", startAt: new Date("2026-01-01T12:00:00Z"), dueAt: new Date("2026-12-31T12:00:00Z"), sortOrder: 1 },
    ],
  });
});
afterAll(async () => {
  await fx.cleanup();
});

describe("goals", () => {
  it("measures online sales vs last year from the data layer, and hand-entered goals against the target", async () => {
    const [sales, members] = await goalViews(fx.clientA.id, NOW);
    expect(sales.line).toBe("+31% so far");
    expect(sales.progress).toBeCloseTo(31 / 40);
    expect(sales.status).toBe("On track");
    expect(members.progress).toBeCloseTo(0.61);
    expect(members.status).toBe("Behind");
    expect(members.line).toBe("6,100 members · sign-ups slowed since August");
  });

  it("staff add and remove goals (logged); a client can't", async () => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ clientId: fx.clientA.id, title: "Launch in Finland by March", target: "1", current: "0.3", dueAt: "2027-03-31" })) f.set(k, v);
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    await expect(saveGoalAction(f)).rejects.toThrow();
    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    await saveGoalAction(f);
    const g = await prisma.clientGoal.findFirstOrThrow({ where: { clientId: fx.clientA.id, title: "Launch in Finland by March" } });
    expect(g.sortOrder).toBe(2);
    const d = new FormData();
    d.set("clientId", fx.clientA.id);
    d.set("id", g.id);
    await deleteGoalAction(d);
    expect(await prisma.clientGoal.count({ where: { id: g.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, area: "insights", action: { contains: "Launch in Finland" } } })).toBe(2);
  });
});
