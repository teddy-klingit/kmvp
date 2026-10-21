import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { linkInsights, upsertInsight } from "@/lib/insight-records";
import { markRoute } from "@/lib/opportunities";
import { savePmNoteAction, setOpportunityStatusAction } from "@/lib/actions/ops-opportunity-actions";
import OpportunityPage from "@/app/(portal)/opportunities/[id]/page";

/** Phase W step 4: the opportunity page moves the status on its own, and staff can override it and write the PM note. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let id: string;

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const o = await prisma.opportunity.create({ data: { clientId: fx.clientA.id, title: "Answer the SPF launch", summary: "s", kind: "competitor", routes: { create: [{ letter: "A", name: "Daily glow", description: "d", formats: ["Post"], channels: ["Instagram"] }] } } });
  const i = await upsertInsight(fx.clientA.id, { key: "page:spf", kind: "market", title: "Competitor launch", value: "3 ads live", sources: ["Meta"] });
  await linkInsights(fx.clientA.id, o.id, [i.id]);
  id = o.id;
});
afterAll(async () => {
  await fx.cleanup();
});

const staffForm = (data: Record<string, string>) => {
  setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
  const f = new FormData();
  for (const [k, v] of Object.entries({ clientId: fx.clientA.id, id, ...data })) f.set(k, v);
  return f;
};

describe("status moves on its own", () => {
  it("the client opening it makes a new one Considering, once", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    await OpportunityPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
    const a = await prisma.opportunity.findUniqueOrThrow({ where: { id } });
    expect(a.status).toBe("considering");
    expect(a.viewedAt).not.toBeNull();
    await OpportunityPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id } })).viewedAt).toEqual(a.viewedAt);
  });

  it("adding it to the Planner makes it In plan, and never moves a running one back", async () => {
    await markRoute(fx.clientA.id, id, "A", "added", {});
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id } })).status).toBe("in_plan");
    await prisma.opportunity.update({ where: { id }, data: { status: "running" } });
    await markRoute(fx.clientA.id, id, "A", "briefed", {});
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id } })).status).toBe("running");
  });

  it("another client's user can't open it (and it doesn't move)", async () => {
    await prisma.opportunity.update({ where: { id }, data: { status: "new", viewedAt: null } });
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    await expect(OpportunityPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })).rejects.toThrow(/NOT_FOUND|notFound/i);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id } })).status).toBe("new");
  });
});

describe("staff", () => {
  it("override the status, logged", async () => {
    await setOpportunityStatusAction(staffForm({ status: "running" }));
    const o = await prisma.opportunity.findUniqueOrThrow({ where: { id } });
    expect(o).toMatchObject({ status: "running", statusSetByUserId: fx.adminUser.id });
    expect(o.runningAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, action: "Moved “Answer the SPF launch” from New to Running" } })).toBe(1);
    await setOpportunityStatusAction(staffForm({ status: "nonsense" }));
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id } })).status).toBe("running");
  });

  it("write the PM note (empty removes it), logged", async () => {
    await savePmNoteAction(staffForm({ pmNote: "I'd do this one. Concept B is ready." }));
    expect(await prisma.opportunity.findUniqueOrThrow({ where: { id } })).toMatchObject({ pmNote: "I'd do this one. Concept B is ready.", pmNoteByUserId: fx.adminUser.id });
    await savePmNoteAction(staffForm({ pmNote: "" }));
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id } })).pmNote).toBeNull();
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, action: { contains: "PM note" } } })).toBe(2);
  });

  it("a client can't use the staff actions", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const f = new FormData();
    for (const [k, v] of Object.entries({ clientId: fx.clientA.id, id, status: "result" })) f.set(k, v);
    await expect(setOpportunityStatusAction(f)).rejects.toThrow();
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id } })).status).toBe("running");
  });
});
