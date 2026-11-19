import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { competitorLimit, loadCompetitorsTab, loadTrendsTab, trendLimit } from "@/lib/insights/market-tabs";
import { removeCompetitorAction, trackCompetitorAction } from "@/lib/actions/market-intelligence-actions";

/** Phase X7: Competitors and Trends from stored checks only. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const NOW = new Date("2026-11-17T12:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86400000);

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const c = fx.clientA.id;
  const client = await prisma.client.update({ where: { id: c }, data: { competitorBrands: ["Plume Skin", "Dewlab"] } });
  const m = (named: string[]) => ["Plume Skin", "Dewlab", client.name].map((brand) => ({ brand, mentioned: named.includes(brand) }));
  // 4 answers in the latest run: Plume Skin named in 3, you in 2, Dewlab in 1. An older run doesn't count.
  await prisma.aiVisibilityCheck.createMany({
    data: [
      { clientId: c, engine: "chatgpt", question: "best fragrance-free moisturiser", answer: "", mentions: m(["Plume Skin", client.name]), checkedAt: ago(2) },
      { clientId: c, engine: "chatgpt", question: "tinted SPF for sensitive skin", answer: "", mentions: m(["Plume Skin"]), checkedAt: ago(2) },
      { clientId: c, engine: "claude", question: "refill skincare Sweden", answer: "", mentions: [{ brand: client.name, mentioned: true }, { brand: "Plume Skin", mentioned: true }, { brand: "Dewlab", mentioned: false }], checkedAt: ago(2) },
      { clientId: c, engine: "claude", question: "serum under 400 kr", answer: "", mentions: m(["Dewlab"]), checkedAt: ago(2) },
      { clientId: c, engine: "chatgpt", question: "old question", answer: "", mentions: m([client.name]), checkedAt: ago(20) },
    ],
  });
  await prisma.siteAudit.createMany({ data: [{ clientId: c, subject: "Own site", domain: "a.test", seoScore: 34, onPageChecks: {} }, { clientId: c, subject: "Plume Skin", domain: "p.test", seoScore: 41, onPageChecks: {} }] });
  await prisma.competitorSnapshot.createMany({ data: [{ clientId: c, brand: "Plume Skin", platform: "Meta", totalAds: null, adIds: ["a", "b", "c"], capturedAt: ago(1) }, { clientId: c, brand: "Plume Skin", platform: "Meta", totalAds: null, adIds: ["a"], capturedAt: ago(5) }] });
  await prisma.marketSignal.create({ data: { clientId: c, type: "COMPETITOR", title: "Plume Skin launched a tinted SPF fluid", summary: "", publishedAt: ago(12) } });
  // Trends: an older batch and the newest one (4 topics).
  await prisma.trendTopic.create({ data: { clientId: c, topic: "old topic", change: 9, series: [1, 2], stage: "Rising", fit: 3, capturedAt: ago(30) } });
  await prisma.trendTopic.createMany({ data: ["refill with me", "skin barrier", "tinted SPF", "glass skin"].map((topic, i) => ({ clientId: c, topic, change: [1.8, 0.64, 0.52, -0.15][i], series: [1, 2, 3], stage: ["Rising", "Rising", "Peaking", "Fading"][i], fit: [3, 3, 2, 1][i], sortOrder: i, capturedAt: ago(1) })) });
  await prisma.keyMoment.createMany({ data: [{ name: "Lucia (test)", date: ago(-26), markets: ["SE"] }, { name: "Planned day (test)", date: ago(-10), markets: ["SE"] }] });
  await prisma.clientCalendarItem.create({ data: { clientId: c, title: "Planned day (test) post", date: ago(-10), channel: "Instagram" } });
});
afterAll(async () => {
  await prisma.keyMoment.deleteMany({ where: { name: { endsWith: "(test)" } } });
  await fx.cleanup();
});

describe("Competitors", () => {
  it("share of AI answers, where you're named per question, Google visibility, ads live and the latest move", async () => {
    const t = await loadCompetitorsTab(fx.clientA.id, { days: 30, now: NOW });
    const row = (b: string) => t.table.find((r) => r.brand === b)!;
    // Phase X 2b: ranked by share of AI answers, each competitor with its gap to you.
    expect(t.table.map((r) => r.brand)).toEqual(["Plume Skin", t.brand, "Dewlab"].filter((b) => t.table.some((r) => r.brand === b)).concat(t.table.map((r) => r.brand).filter((b) => !["Plume Skin", t.brand, "Dewlab"].includes(b))));
    expect(t.table.find((r) => r.own)).toMatchObject({ aiShare: 0.5, rank: 2, vsYou: null });
    expect(row("Plume Skin")).toMatchObject({ rank: 1, vsYou: 25 });
    expect(t.answers).toMatchObject({ total: 4, win: t.questions.filter((q) => q.ownPosition === 1).length });
    expect(row("Plume Skin")).toMatchObject({ aiShare: 0.75, google: 41, ads: 3 });
    expect(row("Plume Skin").move?.title).toContain("tinted SPF");
    expect(row("Dewlab").aiShare).toBe(0.25);
    expect(t.questions.find((q) => q.question === "refill skincare Sweden")?.ownPosition).toBe(1);
    expect(t.questions.find((q) => q.question === "tinted SPF for sensitive skin")?.ownPosition).toBeNull();
    expect(t.questions).toHaveLength(4);
  });

  it("tracks up to the plan's limit and stops tracking a brand", async () => {
    expect(competitorLimit("pro")).toBe(3);
    expect(competitorLimit("enterprise")).toBe(4);
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const f = new FormData();
    f.set("brand", "https://www.kindritual.example/shop");
    await trackCompetitorAction(f);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: fx.clientA.id } })).competitorBrands).toEqual(["Plume Skin", "Dewlab", "kindritual.example"]);
    const g = new FormData();
    g.set("brand", "Dewlab");
    await removeCompetitorAction(g);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: fx.clientA.id } })).competitorBrands).toEqual(["Plume Skin", "kindritual.example"]);
  });
});

describe("Trends", () => {
  it("the newest batch only, top ones on Pro, and moments with nothing in the Planner flagged", async () => {
    expect(trendLimit("pro")).toBe(3);
    const pro = await loadTrendsTab(fx.clientA.id, { now: NOW, tier: "pro" });
    expect(pro.rows.map((r) => r.topic)).toEqual(["refill with me", "skin barrier", "tinted SPF"]);
    expect(pro.hidden).toBe(1);
    const ent = await loadTrendsTab(fx.clientA.id, { now: NOW, tier: "enterprise" });
    expect(ent.rows).toHaveLength(4);
    const lucia = ent.moments.find((m) => m.name === "Lucia (test)")!;
    expect(lucia.planned).toBeNull();
    expect(ent.moments.find((m) => m.name === "Planned day (test)")?.planned).not.toBeNull();
  });
});
