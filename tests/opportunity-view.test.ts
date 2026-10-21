import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { linkInsights, upsertInsight } from "@/lib/insight-records";
import { byScore, opportunityViews, trackRecord, type Prediction, type Result } from "@/lib/opportunity-view";
import { askForOpportunityAction } from "@/lib/actions/opportunity-actions";

/** Phase W step 3: the Opportunities page's numbers, all computed: confidence, expected effect, the sort, the track record. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const DAY = 86400000;
const now = new Date("2026-10-21T10:00:00Z");

const include = { routes: { orderBy: { sortOrder: "asc" as const } }, insights: { include: { insight: true } } };
async function make(title: string, data: { kind?: string; status?: string; channels?: string[]; insights: { key: string; source: string; kind?: "data" | "market" | "plan" }[]; windowStart?: Date; result?: Result; prediction?: Prediction; resultAt?: Date; combined?: object; confidence?: string }) {
  const o = await prisma.opportunity.create({
    data: {
      clientId: fx.clientA.id,
      title,
      summary: `${title}.`,
      kind: data.kind ?? "content",
      status: data.status ?? "new",
      windowStart: data.windowStart ?? null,
      windowEnd: data.windowStart ?? null,
      result: data.result,
      prediction: data.prediction,
      resultAt: data.resultAt ?? null,
      combined: data.combined,
      confidence: data.confidence ?? null,
      createdAt: new Date(now.getTime() - 20 * DAY),
      routes: { create: [{ letter: "A", name: "A", description: "d", formats: ["Post"], channels: data.channels ?? ["Instagram"] }] },
    },
  });
  const ids = [];
  for (const i of data.insights) ids.push((await upsertInsight(fx.clientA.id, { key: i.key, kind: i.kind ?? "data", title: i.key, value: "1", sources: [i.source] })).id);
  await linkInsights(fx.clientA.id, o.id, ids);
  return prisma.opportunity.findUniqueOrThrow({ where: { id: o.id }, include });
}
const result = (actual: number, outcome: Result["outcome"]): Result => ({ outcome, actual, unit: "money", currency: "EUR", text: `+€${actual}` });
const prediction = (low: number, high: number): Prediction => ({ metric: "revenue", unit: "money", low, high, currency: "EUR", windowStart: "2026-07-01", windowEnd: "2026-07-31", baseline: 0, text: `+€${low / 1000}–${high / 1000}k` });

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

describe("expected effect and confidence", () => {
  it("without past results of its kind, it says so; with them, the range is the middle half of what they brought", async () => {
    const before = await make("Content, first one", { insights: [{ key: "v:a", source: "Meta" }, { key: "v:b", source: "GA4" }] });
    expect((await opportunityViews(fx.clientA.id, [before], now)).get(before.id)!.estimate).toMatchObject({ text: "Unclear: no results yet for content opportunities", low: null });

    for (const [n, a] of [1800, 2400, 3100, 2600].entries()) await make(`Done ${n}`, { status: "result", insights: [{ key: `v:done${n}`, source: "Meta" }], result: result(a, "met"), prediction: prediction(2000, 3000), resultAt: new Date(now.getTime() - (n + 1) * DAY) });
    const v = (await opportunityViews(fx.clientA.id, [before], now)).get(before.id)!;
    expect(v.estimate).toMatchObject({ low: 2000, high: 3000, unit: "money", days: 30, text: "+€2–3k in 30 days" });
    expect(v.estimate.maths[0]).toMatch(/Your last 4 content opportunities brought/);
    // Two independent sources (Meta, GA4), enough data: Medium (credit models can't be checked on content).
    expect(v.confidence).toBe("medium");
  });

  it("a disconnected source shows a warning, lowers the confidence and makes the effect unclear", async () => {
    await prisma.dataSource.create({ data: { clientId: fx.clientA.id, source: "TikTok", status: "needs_reconnect" } });
    const o = await make("Refill on TikTok", { kind: "trend", channels: ["TikTok"], insights: [{ key: "v:refill", source: "Meta", kind: "market" }, { key: "v:pouch", source: "Planner", kind: "plan" }] });
    const v = (await opportunityViews(fx.clientA.id, [o], now)).get(o.id)!;
    expect(v.missing).toEqual(["TikTok"]);
    expect(v.warning).toMatch(/^TikTok disconnected, so we can't check this against your results\. Reconnect to raise confidence\.$/);
    expect(v.estimate.text).toBe("Unclear: no TikTok data");
    expect(v.confidence).toBe("low");
    // A route that also runs on Instagram can still be measured there: no warning.
    const both = await make("Refill everywhere", { kind: "trend", channels: ["Instagram", "TikTok"], insights: [{ key: "v:refill2", source: "Meta", kind: "market" }] });
    expect((await opportunityViews(fx.clientA.id, [both], now)).get(both.id)!.warning).toBeNull();
  });

  it("sorts by impact × urgency: the middle of the range per day left to decide; no range after", async () => {
    const effect = (low: number, high: number) => ({ kind: "budget-shift", headline: "h", effect: { low, high, point: low, currency: "EUR", days: 60, text: `≈ +€${low / 1000}–${high / 1000}k revenue over 60 days` }, cost: { spend: 0, credits: 6, text: "€0 extra" }, decideBy: null as string | null, evidence: [], maths: [], mathsNote: "", checks: [], blind: [], disagree: null, actions: { addToPlan: null, brief: { label: "b", href: "/brief/new" }, askPm: true }, sources: [], dataSize: "" });
    const big = await make("Big, decide in 30 days", { kind: "budget", combined: { ...effect(8000, 10000), decideBy: new Date(now.getTime() + 30 * DAY).toISOString() }, confidence: "high", insights: [{ key: "s:1", source: "Shopify" }] });
    const soon = await make("Smaller, decide in 3 days", { kind: "budget", combined: { ...effect(2000, 3000), decideBy: new Date(now.getTime() + 3 * DAY).toISOString() }, confidence: "high", insights: [{ key: "s:2", source: "Shopify" }] });
    const none = await make("No range", { kind: "seasonal", insights: [{ key: "s:3", source: "Key moments", kind: "plan" }] });
    const views = await opportunityViews(fx.clientA.id, [big, soon, none], now);
    expect([none, big, soon].sort(byScore(views)).map((o) => o.title)).toEqual(["Smaller, decide in 3 days", "Big, decide in 30 days", "No range"]);
    expect(views.get(big.id)!.estimate.text).toBe("+€8–10k in 60 days");
  });
});

describe("track record", () => {
  it("counts suggested, acted on, met or beat, and the revenue from measured ones", async () => {
    await make("Missed one", { status: "result", insights: [{ key: "t:m", source: "Meta" }], result: result(900, "missed"), prediction: prediction(2000, 3000), resultAt: now });
    await prisma.opportunity.updateMany({ where: { clientId: fx.clientA.id, title: "Missed one" }, data: { learning: "Pinterest suggestions now need 90 days of Pinterest data.", learningStatus: "approved" } });
    const r = await trackRecord(fx.clientA.id, now);
    expect(r.measured).toBe(5);
    expect(r.metOrBeat).toBe(4);
    expect(r.revenue).toEqual({ value: 1800 + 2400 + 3100 + 2600 + 900, currency: "EUR" });
    expect(r.actedOn).toBe(5);
    expect(r.recent.map((x) => x.title)).toEqual(["Missed one", "Done 0", "Done 1"]);
    expect(r.learning).toBe("Pinterest suggestions now need 90 days of Pinterest data.");
  });
});

describe("Ask for an opportunity", () => {
  it("goes to the PM thread and is logged", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const f = new FormData();
    f.set("what", "Anything for the spring launch in Norway?");
    await expect(askForOpportunityAction(f)).rejects.toThrow("REDIRECT:/opportunities?asked=1");
    expect(await prisma.clientMessage.count({ where: { clientId: fx.clientA.id, body: { contains: "spring launch in Norway" } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, area: "opportunities", action: { contains: "Asked for an opportunity" } } })).toBe(1);
  });
});
