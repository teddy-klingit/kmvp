import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// The scan's model call: whatever the test sets, including a fact id that doesn't exist.
const scan = vi.hoisted(() => ({ output: null as unknown, prompts: [] as string[] }));
vi.mock("@/lib/ai/run-agent", () => ({
  runAgentTask: vi.fn(async (args: { agentKey: string; prompt: string }) => {
    scan.prompts.push(args.prompt);
    return args.agentKey === "opportunity_scan" ? { ok: true, data: scan.output, prompt: args.prompt } : { ok: false, error: "no model in tests" };
  }),
}));

import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { dismissOpportunity, listOpportunities, loadOpportunity, newOpportunities, opportunityFacts, prefillFromOpportunity, runOpportunityScan } from "@/lib/opportunities";
import { dismissOpportunityAction, briefRouteAction } from "@/lib/actions/opportunity-actions";
import { addPlanItemAction } from "@/lib/actions/plan-item-actions";
import OpportunityPage from "@/app/(portal)/planner/opportunities/[id]/page";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let oppA: string;
let oppB: string;
const DAY = 86400000;

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const mk = (clientId: string, title: string, secret: string) =>
    prisma.opportunity.create({
      data: {
        clientId,
        title,
        summary: `${title}.`,
        sources: ["data"],
        evidence: [{ value: "7.4%", text: secret, source: "Insights · Performance", kind: "data" }],
        windowStart: new Date(Date.now() + 10 * DAY),
        windowEnd: new Date(Date.now() + 14 * DAY),
        routes: { create: [{ letter: "A", name: "Route A", description: "One way.", formats: ["Post"], channels: ["Instagram"], sampleLine: "soft, every day." }] },
      },
    });
  oppA = (await mk(fx.clientA.id, "A's opportunity", "client A's own CTR")).id;
  oppB = (await mk(fx.clientB.id, "B's opportunity", "client B's private CTR")).id;
  await prisma.marketSignal.create({ data: { clientId: fx.clientB.id, type: "COMPETITOR", title: "B-only competitor signal", summary: "Only client B tracks this.", publishedAt: new Date() } });
  await prisma.marketSignal.create({ data: { clientId: fx.clientA.id, type: "TREND", title: "A trend for A", summary: "Refills are up.", publishedAt: new Date() } });
});
afterAll(async () => {
  await fx.cleanup();
});

describe("opportunity evidence is scoped to its client", () => {
  it("client A never sees client B's opportunity, evidence or routes", async () => {
    expect(await loadOpportunity(fx.clientA.id, oppB)).toBeNull();
    expect(await prefillFromOpportunity(fx.clientA.id, oppB)).toBeNull();
    const list = await listOpportunities(fx.clientA.id);
    expect(list.map((o) => o.id)).toEqual([oppA]);
    expect(JSON.stringify(list)).not.toContain("client B's private CTR");
    expect((await newOpportunities(fx.clientA.id)).newest.map((o) => o.id)).toEqual([oppA]);
  });

  it("the page 404s on another client's opportunity", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    await expect(OpportunityPage({ params: Promise.resolve({ id: oppB }), searchParams: Promise.resolve({}) })).rejects.toThrow(/NOT_FOUND|notFound/i);
  });

  it("client A can't dismiss, brief or plan client B's opportunity", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const f = new FormData();
    f.set("id", oppB);
    f.set("reason", "Off-brand");
    await dismissOpportunityAction(f);
    f.set("route", "A");
    await briefRouteAction(f);
    const add = new FormData();
    for (const [k, v] of Object.entries({ title: "steal", date: "2026-12-01", requestKey: "steal-1", opportunityId: oppB })) add.set(k, v);
    expect(await addPlanItemAction({}, add)).toEqual({ error: "That opportunity isn't yours." });
    const b = await prisma.opportunity.findUniqueOrThrow({ where: { id: oppB }, include: { routes: true } });
    expect(b.status).toBe("new");
    expect(b.dismissReason).toBeNull();
    expect(b.routes[0].planItemId).toBeNull();
    expect(await prisma.clientCalendarItem.count({ where: { clientId: fx.clientA.id, opportunityId: oppB } })).toBe(0);
  });

  it("a scan only sees its own client's facts, and drops evidence it wasn't given", async () => {
    const facts = await opportunityFacts(fx.clientA.id);
    expect(facts.some((f) => f.text.includes("A trend for A"))).toBe(true);
    expect(facts.some((f) => f.text.includes("B-only"))).toBe(false);
    const trend = facts.find((f) => f.text.includes("A trend for A"))!;
    scan.output = {
      opportunities: [
        { title: "Refill rituals", summary: "Show the refill.", whyNow: "Refills are up.", evidenceIds: [trend.id, "S99"], windowStart: "", windowEnd: "", routes: [0, 1].map((i) => ({ name: `R${i}`, description: "d", formats: ["Post", "Hologram"], channels: ["Instagram", "MySpace"], sampleLine: "refill what you love." })) },
        { title: "Made up", summary: "No evidence.", whyNow: "Trust me.", evidenceIds: ["D42"], windowStart: "", windowEnd: "", routes: [0, 1].map((i) => ({ name: `R${i}`, description: "d", formats: ["Post"], channels: ["Instagram"], sampleLine: "x" })) },
      ],
    };
    const r = await runOpportunityScan(fx.clientA.id, { origin: "weekly" });
    expect(r).toEqual({ created: 1, error: null });
    expect(scan.prompts.at(-1)).not.toContain("B-only");
    const made = await prisma.opportunity.findFirstOrThrow({ where: { clientId: fx.clientA.id, title: "Refill rituals" }, include: { routes: true } });
    expect(made.evidence).toEqual([{ kind: "market", value: trend.value, text: trend.text, source: trend.source, ref: trend.ref, demo: false }]);
    expect(made.sources).toEqual(["trend"]);
    expect(made.routes[0].formats).toEqual(["Post"]);
    expect(made.routes[0].channels).toEqual(["Instagram"]);
    expect(await prisma.opportunity.count({ where: { title: "Made up" } })).toBe(0);
  });
});

describe("Not for us, and staff hiding", () => {
  it("stores the reason and takes it off the list", async () => {
    expect(await dismissOpportunity(fx.clientA.id, fx.userA.id, oppA, "Wrong timing")).toBe(true);
    const a = await prisma.opportunity.findUniqueOrThrow({ where: { id: oppA } });
    expect(a).toMatchObject({ status: "dismissed", dismissReason: "Wrong timing", dismissedByUserId: fx.userA.id });
    expect((await listOpportunities(fx.clientA.id)).some((o) => o.id === oppA)).toBe(false);
  });

  it("a hidden opportunity never reaches the client", async () => {
    const h = await prisma.opportunity.create({ data: { clientId: fx.clientA.id, title: "Hidden one", summary: "s", hiddenAt: new Date() } });
    expect(await loadOpportunity(fx.clientA.id, h.id)).toBeNull();
    expect(await loadOpportunity(fx.clientA.id, h.id, { staff: true })).not.toBeNull();
    expect((await listOpportunities(fx.clientA.id)).some((o) => o.id === h.id)).toBe(false);
  });
});

describe("Add to plan from an opportunity", () => {
  it("is idempotent and moves the opportunity and its route on", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const o = await prisma.opportunity.create({ data: { clientId: fx.clientA.id, title: "Singles Day", summary: "s", windowEnd: new Date(Date.now() + 30 * DAY), routes: { create: [{ letter: "A", name: "Gift set", description: "d", formats: ["Carousel"], channels: ["Instagram"] }] } } });
    const f = new FormData();
    for (const [k, v] of Object.entries({ title: "Singles Day", date: "2026-11-11", maker: "klingit_help", requestKey: "opp-add-1", opportunityId: o.id, route: "A" })) f.set(k, v);
    f.append("formats", "Carousel");
    await Promise.all([addPlanItemAction({}, f), addPlanItemAction({}, f)]);
    const items = await prisma.clientCalendarItem.findMany({ where: { clientId: fx.clientA.id, opportunityId: o.id } });
    expect(items).toHaveLength(1);
    const after = await prisma.opportunity.findUniqueOrThrow({ where: { id: o.id }, include: { routes: true } });
    expect(after.status).toBe("added");
    expect(after.routes[0]).toMatchObject({ status: "added", planItemId: items[0].id });
    // Phase T: adding the same route again later (a new dialog, so a new request key) reuses the first item.
    f.set("requestKey", "opp-add-2");
    await addPlanItemAction({}, f);
    expect(await prisma.clientCalendarItem.count({ where: { clientId: fx.clientA.id, opportunityId: o.id } })).toBe(1);
  });
});
