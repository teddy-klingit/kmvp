import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { isGrounded, numbersIn, textGrounded } from "@/lib/insights/number-guard";
import { groundAction, groundTakeaway } from "@/lib/insights-brief";
import { loadDaily } from "@/lib/insights/daily";
import { perfChange, signalsPerWeek } from "@/lib/insights/signals";

// The daily rows are written by the test; never call the ad platforms.
vi.mock("@/lib/integrations/ad-daily", () => ({ DAILY_WINDOW_DAYS: 90, dailyMetricsFreshness: async () => ({ lastSynced: new Date(), stale: false }), syncDailyAdMetrics: async () => ({}) }));

const iso = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

describe("number guard: no invented numbers", () => {
  const pool = numbersIn('"NO awareness": 251000 impressions, 214 clicks, 0.09% CTR, 3822 SEK spent; Story 9:16: 6.1% across 3 asset(s); Static 1:1: 2.1%');

  it("reads numbers with commas, decimals and minus signs", () => {
    expect(numbersIn("SEK 3,822 · −44% · 0.08%")).toEqual([3822, -44, 0.08]);
  });

  it("accepts numbers from the data, their roundings, ratios and % changes", () => {
    expect(isGrounded(6.1, pool)).toBe(true);
    expect(isGrounded(3822, pool)).toBe(true);
    expect(isGrounded(2.9, pool)).toBe(true); // 6.1 / 2.1
    expect(textGrounded("Story 9:16 6.1% vs 2.1%", pool)).toBe(true);
  });

  it("rejects a number that isn't in the data", () => {
    expect(isGrounded(4.7, pool)).toBe(false);
    expect(textGrounded("CTR up 37.5%", pool)).toBe(false);
  });

  it("drops ungrounded chart bars and chips before they're stored", () => {
    const t = groundTakeaway(
      { tag: "Creative", metric: "9.9×", headline: "Stories beat statics", compare: [{ label: "Story", value: 6.1, display: "6.1%" }, { label: "Made up", value: 4.7, display: "4.7%" }], action: { kind: "brief", label: "Brief stories", view: null }, why: "…" },
      pool
    );
    expect(t?.compare.map((c) => c.label)).toEqual(["Story"]);
    expect(t?.metric).toBe("6.1%");
    expect(groundAction({ headline: "Do it", chip: "4.7% vs 1%", why: "", brief: "" }, pool).chip).toBe("");
  });
});

describe("signals", () => {
  it("parses a performance signal's before → after from older summaries", () => {
    expect(perfChange({ type: "PERFORMANCE", summary: "LinkedIn: 0.82% → 0.46% CTR.", data: null })).toEqual({ before: 0.82, after: 0.46 });
    expect(perfChange({ type: "PERFORMANCE", summary: "x", data: { before: 1, after: 0.5 } })).toEqual({ before: 1, after: 0.5 });
    expect(perfChange({ type: "TREND", summary: "LinkedIn: 0.82% → 0.46% CTR.", data: null })).toBeNull();
  });

  it("counts signals per calendar week, only the types present", () => {
    const now = new Date("2026-10-02T12:00:00Z"); // a Friday
    const w = signalsPerWeek(
      [
        { type: "TREND", publishedAt: new Date("2026-10-01T09:00:00Z") },
        { type: "COMPETITOR", publishedAt: new Date("2026-09-29T09:00:00Z") },
        { type: "TREND", publishedAt: new Date("2026-09-22T09:00:00Z") },
        { type: "TREND", publishedAt: new Date("2026-01-01T09:00:00Z") },
      ],
      4,
      now
    );
    expect(w.series.map((s) => s.name)).toEqual(["Trend", "Competitor"]);
    const label = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d));
    expect(w.data.map((d) => d.x)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"].map(label));
    expect(w.data.at(-1)?.values).toEqual([1, 1]);
    expect(w.data.at(-2)?.values).toEqual([1, 0]);
    expect(w.total).toBe(3);
  });
});

describe("daily ad numbers", () => {
  let fx: Awaited<ReturnType<typeof createSecurityFixtures>>;
  beforeAll(async () => {
    fx = await createSecurityFixtures();
    await prisma.client.update({ where: { id: fx.clientA.id }, data: { paidMediaInScope: true, isSampleAccount: false } });
    const row = (n: number, campaignId: string, impressions: number, clicks: number, spend: number) => ({ clientId: fx.clientA.id, platform: "Meta", accountName: "Acct", currency: "SEK", campaignId, campaignName: `Campaign ${campaignId}`, date: iso(n), impressions, clicks, spend });
    await prisma.adDailyMetric.createMany({
      data: [row(0, "a", 1000, 10, 100), row(2, "a", 1000, 20, 50), row(2, "b", 500, 5, 25), row(10, "a", 2000, 10, 80), row(20, "a", 1000, 1, 10)],
    });
  });
  afterAll(async () => {
    await prisma.adDailyMetric.deleteMany({ where: { clientId: fx.clientA.id } });
    await fx.cleanup();
  });

  it("zero-fills the days in range and never more", async () => {
    const d = await loadDaily(fx.clientA.id, 7);
    expect(d.days).toHaveLength(7);
    expect(d.days.at(-1)).toMatchObject({ date: iso(0), spend: 100, clicks: 10 });
    expect(d.days.find((x) => x.date === iso(1))).toMatchObject({ spend: 0, clicks: 0 });
    expect(d.totals).toMatchObject({ spend: 175, clicks: 35, impressions: 2500 });
    expect(d.campaigns.map((c) => c.campaignId)).toEqual(["a", "b"]);
  });

  it("compares with a previous period only when the stored window covers it", async () => {
    const week = await loadDaily(fx.clientA.id, 7);
    expect(week.previous).toMatchObject({ spend: 80, clicks: 10 });
    const quarter = await loadDaily(fx.clientA.id, 90);
    expect(quarter.previous).toBeNull();
  });

  it("a client without paid media has no daily numbers", async () => {
    await prisma.client.update({ where: { id: fx.clientB.id }, data: { paidMediaInScope: false } });
    const d = await loadDaily(fx.clientB.id, 30);
    expect(d.has).toBe(false);
    expect(d.live).toBe(false);
  });
});
