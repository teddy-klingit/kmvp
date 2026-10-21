import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { insightsOf, linkInsights, recentFindings, refreshInsights, shortTitle, upsertInsight } from "@/lib/insight-records";
import { listOpportunities, loadOpportunity, newOpportunities, opportunityFacts } from "@/lib/opportunities";
import { addOpportunityAction, linkInsightAction } from "@/lib/actions/ops-opportunity-actions";

/** Phase W step 2: findings are records; an opportunity is built from them, and never reaches the client without one. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

const opp = (clientId: string, title: string) => prisma.opportunity.create({ data: { clientId, title, summary: `${title}.` } });

describe("an opportunity needs an insight", () => {
  it("without one, staff see it and the client doesn't; linking one brings it to the client", async () => {
    const o = await opp(fx.clientA.id, "No evidence yet");
    expect(await loadOpportunity(fx.clientA.id, o.id)).toBeNull();
    expect(await loadOpportunity(fx.clientA.id, o.id, { staff: true })).not.toBeNull();
    expect((await listOpportunities(fx.clientA.id)).some((x) => x.id === o.id)).toBe(false);
    expect((await newOpportunities(fx.clientA.id)).newest.some((x) => x.id === o.id)).toBe(false);

    const i = await upsertInsight(fx.clientA.id, { key: "test:saves", kind: "data", title: "Saves on ritual posts", value: "+64%", sources: ["Meta"] });
    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    const f = new FormData();
    for (const [k, v] of Object.entries({ clientId: fx.clientA.id, id: o.id, insightId: i.id })) f.set(k, v);
    await linkInsightAction(f);
    expect((await insightsOf(fx.clientA.id, o.id)).map((x) => x.id)).toEqual([i.id]);
    expect(await loadOpportunity(fx.clientA.id, o.id)).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, area: "opportunities", action: { contains: "Saves on ritual posts" } } })).toBe(1);
  });

  it("never links another client's insight", async () => {
    const o = await opp(fx.clientA.id, "Steal B's finding");
    const b = await upsertInsight(fx.clientB.id, { key: "test:b-secret", kind: "data", title: "B's private number", value: "9%", sources: ["Meta"] });
    expect(await linkInsights(fx.clientA.id, o.id, [b.id])).toBe(0);
    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    const f = new FormData();
    for (const [k, v] of Object.entries({ clientId: fx.clientA.id, id: o.id, insightId: b.id })) f.set(k, v);
    await linkInsightAction(f);
    expect(await prisma.opportunityInsight.count({ where: { opportunityId: o.id } })).toBe(0);
    expect(await loadOpportunity(fx.clientA.id, o.id)).toBeNull();
  });

  it("staff can't add one by hand without an insight", async () => {
    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    const f = new FormData();
    for (const [k, v] of Object.entries({ clientId: fx.clientA.id, title: "By hand, no insight", summary: "s" })) f.set(k, v);
    await addOpportunityAction(f);
    expect(await prisma.opportunity.count({ where: { clientId: fx.clientA.id, title: "By hand, no insight" } })).toBe(0);

    const i = await upsertInsight(fx.clientA.id, { key: "test:hand", kind: "data", title: "A finding", value: "41%", sources: ["Klaviyo"] });
    f.set("title", "By hand, with one");
    f.append("insightId", i.id);
    await addOpportunityAction(f);
    const made = await prisma.opportunity.findFirstOrThrow({ where: { clientId: fx.clientA.id, title: "By hand, with one" } });
    expect((await insightsOf(fx.clientA.id, made.id)).map((x) => x.key)).toEqual(["test:hand"]);
  });
});

describe("insight records", () => {
  it("are updated by key, and a changed number counts as found again", async () => {
    const t0 = new Date("2026-10-01T10:00:00Z");
    const a = await upsertInsight(fx.clientA.id, { key: "test:upsert", kind: "data", title: "Opens", value: "40%", sources: ["Klaviyo"] }, { now: t0 });
    const same = await upsertInsight(fx.clientA.id, { key: "test:upsert", kind: "data", title: "Opens", value: "40%", sources: ["Klaviyo"] }, { now: new Date("2026-10-05T10:00:00Z") });
    expect(same.id).toBe(a.id);
    expect(same.foundAt.getTime()).toBe(t0.getTime());
    const changed = await upsertInsight(fx.clientA.id, { key: "test:upsert", kind: "data", title: "Opens", value: "41%", sources: ["Klaviyo"] }, { now: new Date("2026-10-09T10:00:00Z") });
    expect(changed.foundAt.toISOString()).toBe("2026-10-09T10:00:00.000Z");
  });

  it("a refresh archives detector findings that are no longer true, and leaves other kinds alone", async () => {
    await upsertInsight(fx.clientA.id, { key: "fatigue:meta:gone", kind: "data", title: "Gone", value: "1% → 0.5%", sources: ["Meta"] });
    await upsertInsight(fx.clientA.id, { key: "test:staff-kept", kind: "data", title: "Kept", value: "1", sources: ["Klingit"], origin: "staff" });
    await refreshInsights(fx.clientA.id);
    const rows = await prisma.insight.findMany({ where: { clientId: fx.clientA.id, key: { in: ["fatigue:meta:gone", "test:staff-kept"] } } });
    expect(Object.fromEntries(rows.map((r) => [r.key, r.status]))).toEqual({ "fatigue:meta:gone": "archived", "test:staff-kept": "active" });
  });

  it("a scan's facts are the client's own insights, and the signal it cites becomes a link", async () => {
    await prisma.marketSignal.create({ data: { clientId: fx.clientB.id, type: "COMPETITOR", title: "B-only signal", summary: "x", publishedAt: new Date() } });
    const s = await prisma.marketSignal.create({ data: { clientId: fx.clientA.id, type: "TREND", title: "Refills are up", summary: "y", publishedAt: new Date() } });
    const facts = await opportunityFacts(fx.clientA.id);
    expect(facts.some((f) => f.text.includes("B-only"))).toBe(false);
    const fact = facts.find((f) => f.ref === `signal:${s.id}`)!;
    const insight = await prisma.insight.findUniqueOrThrow({ where: { id: fact.insightId } });
    expect(insight).toMatchObject({ clientId: fx.clientA.id, key: `signal:${s.id}`, kind: "market", title: "Refills are up" });
  });
});

describe("What we found this month (Insights Overview)", () => {
  it("shows each finding's opportunities, and the bridge counts only open, visible ones", async () => {
    const C = fx.clientB.id;
    const mk = (key: string, title: string) => upsertInsight(C, { key, kind: "data", title, value: "1", sources: ["Meta"] });
    const [story, email, retail, opens] = [await mk("f:story", "Story ads bring bigger orders"), await mk("f:email", "Email brings Story buyers back"), await mk("f:retail", "Retail fairs don't pay back"), await mk("f:opens", "Newsletter opens are steady")];
    const opp = async (title: string, status: string, ids: string[], extra: object = {}) => {
      const o = await prisma.opportunity.create({ data: { clientId: C, title, summary: "s", status, ...extra } });
      await linkInsights(C, o.id, ids);
      return o;
    };
    await opp("Move €2,000 of Black Friday budget to Story ads", "new", [story.id, email.id], { combined: { actions: { addToPlan: { label: "Add to Black Friday plan" } } } });
    await opp("Singles Day: self-care, not discounts", "result", [retail.id]);
    await opp("Set aside", "dismissed", [opens.id]);
    await upsertInsight(C, { key: "f:old", kind: "data", title: "Old", value: "1", sources: ["Meta"], foundAt: new Date(Date.now() - 60 * 86400000) });
    await upsertInsight(C, { key: "f:plan", kind: "plan", title: "Planner context", value: "1", sources: ["Planner"] });

    const r = await recentFindings(C);
    const used = Object.fromEntries(r.findings.map((f) => [f.insight.title, f.used.map((u) => `${u.title}${u.done ? " (done)" : ""}`)]));
    expect(used["Story ads bring bigger orders"]).toEqual(["Black Friday Stories"]);
    expect(used["Retail fairs don't pay back"]).toEqual(["Singles Day (done)"]);
    expect(used["Newsletter opens are steady"]).toEqual([]);
    expect(Object.keys(used)).not.toContain("Old");
    expect(Object.keys(used)).not.toContain("Planner context");
    expect(r.findings.some((f) => f.insight.clientId !== C)).toBe(false);
    // 2 findings feed 1 open opportunity; the dismissed one doesn't count, so 1 finding is unused.
    expect(r.bridge).toMatchObject({ feeding: 2, open: 1 });
    expect(r.bridge.unused).toBe(r.findings.filter((f) => f.used.length === 0).length);
  });

  it("names an opportunity on a chip: the budget move by its plan item, else its title up to a colon", () => {
    expect(shortTitle({ title: "Move €2,000…", combined: { actions: { addToPlan: { label: "Add to Black Friday plan" } } } })).toBe("Black Friday Stories");
    expect(shortTitle({ title: "Singles Day: self-care, not discounts", combined: null })).toBe("Singles Day");
  });
});
