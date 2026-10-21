import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { linkInsights, upsertInsight } from "@/lib/insight-records";
import { advanceOpportunities, measureMetric, outcomeOf } from "@/lib/opportunity-results";
import { predictionOf, resultOf, trackRecord, type Prediction } from "@/lib/opportunity-view";
import { saveLearningAction } from "@/lib/actions/ops-opportunity-actions";

/** Phase W step 6: predictions stored when work goes live, results measured from the data layer when the window ends. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

async function opp(title: string, data: object) {
  const o = await prisma.opportunity.create({ data: { clientId: fx.clientA.id, title, summary: "s", kind: "content", ...data } });
  const i = await upsertInsight(fx.clientA.id, { key: `r:${title}`, kind: "data", title, value: "1", sources: ["Meta"] });
  await linkInsights(fx.clientA.id, o.id, [i.id]);
  return o;
}
const revenue = (outputId: string, date: string, value: number) =>
  prisma.metricDaily.createMany({ data: (["first", "last"] as const).map((model) => ({ clientId: fx.clientA.id, date, source: "Shopify", channel: "Meta", outputId, utmContent: outputId, path: "online", model, metric: "revenue", value, currency: "EUR" })) });

describe("Beat, Met or Missed", () => {
  it("is above, in or below the range; without a range it's only Measured", () => {
    expect(outcomeOf({ low: 2000, high: 3000 }, 3500)).toBe("beat");
    expect(outcomeOf({ low: 2000, high: 3000 }, 3000)).toBe("met");
    expect(outcomeOf({ low: 2000, high: 3000 }, 2000)).toBe("met");
    expect(outcomeOf({ low: 2000, high: 3000 }, 1999)).toBe("missed");
    expect(outcomeOf({ low: null, high: null }, 5000)).toBe("measured");
  });
});

describe("the learning loop", () => {
  it("goes Running when its work goes live (prediction stored), then Result when the window ends (from the data layer)", async () => {
    const asset = await prisma.asset.create({ data: { clientId: fx.clientA.id, projectId: fx.projectA.id, name: "Refill reel", format: "Reel 9:16" } });
    const o = await opp("Refill reel", { status: "in_plan" });
    const live = new Date("2026-09-01T10:00:00Z");
    // Not live yet: a planned item on a past date doesn't count until it's ready or published.
    const item = await prisma.clientCalendarItem.create({ data: { clientId: fx.clientA.id, title: "Refill reel", channel: "Instagram", date: live, status: "planned", opportunityId: o.id, publishedAssetId: asset.id } });
    await advanceOpportunities(fx.clientA.id, new Date("2026-09-02T10:00:00Z"));
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("in_plan");

    await prisma.clientCalendarItem.update({ where: { id: item.id }, data: { status: "published" } });
    await advanceOpportunities(fx.clientA.id, new Date("2026-09-02T10:00:00Z"));
    const running = await prisma.opportunity.findUniqueOrThrow({ where: { id: o.id } });
    expect(running.status).toBe("running");
    // No past results of its kind: no range, so it'll be Measured, not judged.
    expect(predictionOf(running)).toMatchObject({ metric: "work_revenue", low: null, high: null, windowStart: "2026-09-01", windowEnd: "2026-09-30", baseline: 0, text: "not estimated" });

    // Revenue its piece brought, inside and outside the window (shared credit = the average of first and last).
    await revenue(asset.id, "2026-09-10", 1200);
    await revenue(asset.id, "2026-10-05", 999);
    await advanceOpportunities(fx.clientA.id, new Date("2026-09-20T10:00:00Z"));
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("running");
    await advanceOpportunities(fx.clientA.id, new Date("2026-10-02T10:00:00Z"));
    const done = await prisma.opportunity.findUniqueOrThrow({ where: { id: o.id } });
    expect(done.status).toBe("result");
    expect(resultOf(done)).toMatchObject({ outcome: "measured", actual: 1200, text: "+€1.2k" });
  });

  it("a miss gets a draft of what we learned; the client and the PM are told; an approved one shows on the track record", async () => {
    const asset = await prisma.asset.create({ data: { clientId: fx.clientA.id, projectId: fx.projectA.id, name: "Pinterest teaser", format: "Pin 2:3" } });
    const p: Prediction = { metric: "work_revenue", unit: "money", low: 2000, high: 3000, currency: "EUR", windowStart: "2026-08-01", windowEnd: "2026-08-30", baseline: 0, text: "+€2–3k" };
    const o = await opp("Pre-launch teaser on Pinterest", { status: "running", prediction: p });
    await prisma.clientCalendarItem.create({ data: { clientId: fx.clientA.id, title: "Teaser", channel: "Pinterest", date: new Date("2026-08-01T10:00:00Z"), status: "published", opportunityId: o.id, publishedAssetId: asset.id } });
    await revenue(asset.id, "2026-08-12", 900);
    const before = await prisma.notification.count({ where: { clientId: fx.clientA.id, title: { contains: "missed our estimate" } } });
    await advanceOpportunities(fx.clientA.id, new Date("2026-09-03T10:00:00Z"));
    const done = await prisma.opportunity.findUniqueOrThrow({ where: { id: o.id } });
    expect(resultOf(done)).toMatchObject({ outcome: "missed", actual: 900, text: "+€900" });
    expect(done).toMatchObject({ learningStatus: "draft" });
    expect(done.learning).toMatch(/^We expected \+€2–3k and got \+€900\./);
    expect(await prisma.notification.count({ where: { clientId: fx.clientA.id, title: { contains: "missed our estimate" } } })).toBeGreaterThan(before);
    // A draft stays with staff.
    expect((await trackRecord(fx.clientA.id)).learning).toBeNull();

    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    const f = new FormData();
    for (const [k, v] of Object.entries({ clientId: fx.clientA.id, id: o.id, learning: "Pinterest suggestions now need 90 days of Pinterest data.", approve: "1" })) f.set(k, v);
    await saveLearningAction(f);
    expect((await trackRecord(fx.clientA.id)).learning).toBe("Pinterest suggestions now need 90 days of Pinterest data.");
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, action: { startsWith: "Approved what we learned" } } })).toBe(1);
  });

  it("Story revenue counts only Story pieces, and only this client's", async () => {
    const story = await prisma.asset.create({ data: { clientId: fx.clientA.id, projectId: fx.projectA.id, name: "Story", format: "Story 9:16" } });
    const feed = await prisma.asset.create({ data: { clientId: fx.clientA.id, projectId: fx.projectA.id, name: "Feed", format: "Feed 4:5" } });
    await revenue(story.id, "2026-11-30", 500);
    await revenue(feed.id, "2026-11-30", 700);
    await prisma.metricDaily.create({ data: { clientId: fx.clientB.id, date: "2026-11-30", source: "Shopify", channel: "Meta", outputId: story.id, model: "first", metric: "revenue", value: 9999 } });
    expect(await measureMetric(fx.clientA.id, { metric: "story_revenue", windowStart: "2026-11-24", windowEnd: "2026-12-31" }, [])).toBe(500);
  });
});
