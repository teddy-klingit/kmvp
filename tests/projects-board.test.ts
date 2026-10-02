import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";

// Staffing itself isn't under test here: autopilot is a no-op.
vi.mock("@/lib/autopilot-runner", () => ({ runAutopilot: vi.fn(async () => []) }));

import { activateQueued, enqueue, queuedProjects, reorderQueue, slotUsage, DEFAULT_ACTIVE_SLOTS } from "@/lib/active-slots";
import { dragRule, canPickUp } from "@/lib/board-rules";
import { clientStageFor } from "@/lib/project-state";
import { approveEstimateAction, signOffProjectAction } from "@/lib/actions/project-actions";
import { reorderQueueAction } from "@/lib/actions/projects-board-actions";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const DAY = 86400000;

async function project(name: string, data: Record<string, unknown> = {}) {
  return prisma.project.create({ data: { clientId: fx.clientA.id, name, type: "CAMPAIGN", status: "ESTIMATING", ...data } });
}
async function withSentEstimate(name: string) {
  const p = await project(name);
  await prisma.brief.create({ data: { projectId: p.id, status: "ACCEPTED" } });
  const e = await prisma.estimate.create({ data: { projectId: p.id, status: "SENT", totalCredits: 20, sentAt: new Date() } });
  await enqueue(p.id, fx.clientA.id);
  return { p, e };
}
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  fx = await createSecurityFixtures();
  // A is on Growth (2 slots); start from the placeholder.
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { planTier: "GROWTH" } });
  await prisma.plan.upsert({ where: { tier: "GROWTH" }, update: { activeSlots: 2 }, create: { tier: "GROWTH", activeSlots: 2 } });
  // The fixtures' own SENT-estimate project would take part in the queue: park it.
  await prisma.project.update({ where: { id: fx.projectA.id }, data: { status: "ARCHIVED" } });
  setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
});
afterAll(async () => fx.cleanup());

describe("active slots", () => {
  it("counts activated projects until sign-off; a paused one keeps its slot", async () => {
    expect(DEFAULT_ACTIVE_SLOTS).toMatchObject({ GROWTH: 2, SCALE: 3, ENTERPRISE: 5 });
    expect(await slotUsage(fx.clientA.id)).toEqual({ total: 2, used: 0, free: 2 });
    const a = await project("Active one", { status: "IN_PRODUCTION", activatedAt: new Date() });
    const paused = await project("Paused one", { status: "PAUSED", pausedFromStatus: "IN_PRODUCTION", activatedAt: new Date() });
    await project("Delivered one", { status: "DELIVERED", activatedAt: new Date(Date.now() - 9 * DAY), deliveredAt: new Date() });
    expect(await slotUsage(fx.clientA.id)).toEqual({ total: 2, used: 2, free: 0 });
    await prisma.project.updateMany({ where: { id: { in: [a.id, paused.id] } }, data: { status: "ARCHIVED" } });
    expect((await slotUsage(fx.clientA.id)).used).toBe(0);
  });

  it("activates on approval when a slot is free, queues when none is, and activates when one frees", async () => {
    const { p: first, e: e1 } = await withSentEstimate("First");
    const { p: second, e: e2 } = await withSentEstimate("Second");
    const { p: third, e: e3 } = await withSentEstimate("Third");

    await approveEstimateAction(fd({ estimateId: e1.id }));
    await approveEstimateAction(fd({ estimateId: e2.id }));
    const [p1, p2] = await Promise.all([prisma.project.findUniqueOrThrow({ where: { id: first.id } }), prisma.project.findUniqueOrThrow({ where: { id: second.id } })]);
    expect(p1.activatedAt).toBeTruthy();
    expect(p1.status).toBe("STAFFING");
    expect(p2.activatedAt).toBeTruthy();

    // Both slots taken: the third waits, approved, in the queue.
    await approveEstimateAction(fd({ estimateId: e3.id }));
    let p3 = await prisma.project.findUniqueOrThrow({ where: { id: third.id }, include: { estimate: true } });
    expect(p3.activatedAt).toBeNull();
    expect(p3.status).toBe("ESTIMATING");
    expect(p3.estimate?.status).toBe("APPROVED");
    expect(clientStageFor({ brief: { status: "ACCEPTED" } as never, activatedAt: null, deliveredAt: null }, "staffing", "klingit", false, new Date())).toBe("queued");

    // The first one is signed off: its slot goes to the third, and the client hears about it.
    await prisma.project.update({ where: { id: first.id }, data: { status: "IN_FEEDBACK" } });
    await signOffProjectAction(fd({ projectId: first.id }));
    p3 = await prisma.project.findUniqueOrThrow({ where: { id: third.id }, include: { estimate: true } });
    expect(p3.activatedAt).toBeTruthy();
    expect(p3.status).toBe("STAFFING");
    expect(await prisma.notification.count({ where: { projectId: third.id, title: { contains: "is now active" } } })).toBeGreaterThan(0);
    await prisma.project.updateMany({ where: { id: { in: [second.id, third.id] } }, data: { status: "ARCHIVED" } });
  });
});

describe("the queue", () => {
  it("activates in queue order, and the client's reorder changes who goes first", async () => {
    const a = await withSentEstimate("Queue A");
    const b = await withSentEstimate("Queue B");
    const c = await withSentEstimate("Queue C");
    expect((await queuedProjects(fx.clientA.id)).map((p) => p.name)).toEqual(["Queue A", "Queue B", "Queue C"]);

    // The client drags C to the front.
    await reorderQueueAction([c.p.id, a.p.id, b.p.id]);
    expect((await queuedProjects(fx.clientA.id)).map((p) => p.name)).toEqual(["Queue C", "Queue A", "Queue B"]);

    // All three get approved while no slot is free...
    const blockers = await Promise.all([project("Block 1", { status: "IN_PRODUCTION", activatedAt: new Date() }), project("Block 2", { status: "IN_PRODUCTION", activatedAt: new Date() })]);
    await prisma.estimate.updateMany({ where: { id: { in: [a.e.id, b.e.id, c.e.id] } }, data: { status: "APPROVED" } });
    expect(await activateQueued(fx.clientA.id)).toEqual([]);
    // ...then one slot frees: the front of the queue (C) starts, and positions close up.
    await prisma.project.update({ where: { id: blockers[0].id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    expect(await activateQueued(fx.clientA.id)).toEqual([c.p.id]);
    const rest = await queuedProjects(fx.clientA.id);
    expect(rest.map((p) => [p.name, p.queuePosition])).toEqual([["Queue A", 1], ["Queue B", 2]]);
  });

  it("a reorder only moves the given projects into the places they held", async () => {
    const order = (await queuedProjects(fx.clientA.id)).map((p) => p.id);
    const hidden = (await withSentEstimate("Hidden")).p.id;
    await reorderQueue(fx.clientA.id, [order[1], order[0]]);
    const now = (await queuedProjects(fx.clientA.id)).map((p) => p.id);
    expect(now).toEqual([order[1], order[0], hidden]);
  });

  it("another client can't reorder this client's queue", async () => {
    const before = (await queuedProjects(fx.clientA.id)).map((p) => p.id);
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    await reorderQueueAction([...before].reverse());
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    expect((await queuedProjects(fx.clientA.id)).map((p) => p.id)).toEqual(before);
  });
});

describe("drag rules", () => {
  it("a draft dropped on Queued sends it; Queued reorders; everything else is Klingit's", () => {
    expect(dragRule("draft", "queued")).toEqual({ allowed: true, kind: "send" });
    expect(dragRule("queued", "queued")).toEqual({ allowed: true, kind: "reorder" });
    expect(dragRule("queued", "active")).toEqual({ allowed: false, reason: "Klingit moves projects to Active" });
    expect(dragRule("draft", "active")).toMatchObject({ allowed: false });
    expect(dragRule("draft", "in_review")).toMatchObject({ allowed: false });
    expect(dragRule("queued", "draft")).toMatchObject({ allowed: false });
    expect(dragRule("active", "queued")).toMatchObject({ allowed: false });
    expect(dragRule("delivered", "in_review")).toMatchObject({ allowed: false });
    expect(["draft", "queued", "active", "in_review", "delivered"].filter((l) => canPickUp(l as never))).toEqual(["draft", "queued"]);
  });
});
