import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { formatGroup, loadOrganicTab, slotOf } from "@/lib/insights/organic-tab";
import { askedAbout, askKey } from "@/lib/insight-records";
import { askForIdeaAction } from "@/lib/actions/insight-actions";

/** Phase X4: Organic social from the client's own posts, followers, activity and community. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const NOW = new Date("2026-11-17T12:00:00Z");
const ago = (d: number, h = 18) => new Date(Date.UTC(2026, 10, 17 - d, h - 1));

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const c = fx.clientA.id;
  const post = (d: number, contentType: string, reach: number, saves: number, theme: string | null) => ({ clientId: c, platform: "Instagram", channelType: "ORGANIC" as const, status: "PUBLISHED" as const, title: `${contentType} ${d}`, contentType, theme, publishedDate: ago(d), reach, engagements: Math.round(reach * 0.04), saves, shares: 10 });
  await prisma.contentPost.createMany({
    data: [
      // Current 30 days: 2 Reels, 2 carousels, 2 single images.
      post(2, "Reel", 30000, 400, "Rituals & how-to"), post(9, "Reel", 32000, 420, "Rituals & how-to"),
      post(4, "Carousel", 14000, 300, "Real people"), post(12, "Carousel", 14000, 280, "Real people"),
      post(6, "Static post", 8000, 150, "Product shots"), post(20, "Feed post", 8000, 140, "Product shots"),
      // The 30 days before: 4 Reels.
      post(35, "Reel", 33000, 300, null), post(40, "Reel", 33000, 300, null), post(45, "Reel", 33000, 300, null), post(50, "Reel", 33000, 300, null),
    ],
  });
  await prisma.followerSnapshot.createMany({ data: [{ clientId: c, platform: "Instagram", followerCount: 47000, capturedAt: ago(31) }, { clientId: c, platform: "Instagram", followerCount: 48200, capturedAt: ago(0) }] });
  const grid = Array.from({ length: 7 }, (_, d) => [20, 40, d === 3 ? 100 : 60]);
  await prisma.audienceActivity.create({ data: { clientId: c, platform: "Instagram", grid } });
  await prisma.communityManagementSnapshot.create({ data: { clientId: c, periodStart: ago(30), periodEnd: ago(0), commentVolume: 1500, dmVolume: 360, sentimentPositivePct: 71, sentimentNeutralPct: 22, sentimentNegativePct: 7, questions: [{ question: "Is it safe for sensitive skin?", count: 94 }] } });
});
afterAll(async () => {
  await fx.cleanup();
});

describe("Organic social", () => {
  it("groups formats and places a post in its day and time slot", () => {
    expect(formatGroup("Reel")).toBe("Reels");
    expect(formatGroup("Short-form video")).toBe("Reels");
    expect(formatGroup("Static post")).toBe("Single images");
    expect(slotOf(new Date("2026-11-19T17:00:00Z"))).toEqual({ day: 3, slot: 2 });
  });

  it("reach, followers, engagement, formats, themes, activity and community come from the client's own data", async () => {
    const t = await loadOrganicTab(fx.clientA.id, { days: 30, now: NOW });
    expect(t.numbers.reach.value).toBe(106000);
    expect(t.numbers.reach.change).toBeCloseTo(106000 / 132000 - 1);
    expect(t.numbers.followers).toMatchObject({ value: 48200, growth: 1200 });
    const reels = t.formats.find((f) => f.format === "Reels")!;
    expect(reels).toMatchObject({ posted: 2, postedBefore: 4, avgReach: 31000 });
    expect(t.themes[0].theme).toBe("Rituals & how-to");
    expect(t.activity?.best).toEqual({ day: 3, slot: 2 });
    expect(t.community?.questions[0]).toEqual({ question: "Is it safe for sensitive skin?", count: 94 });
    expect(t.top[0].reach).toBe(32000);
  });

  it("asking for an idea about a community question makes it a finding once, then a hidden request", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const q = "“Is it safe for sensitive skin?” asked 94 times";
    const f = new FormData();
    for (const [k, v] of Object.entries({ question: q, value: "94", sources: "Instagram", href: "/insights/organic", about: "community" })) f.set(k, v);
    expect(await askForIdeaAction({}, f)).toEqual({ ok: true });
    expect(await askForIdeaAction({}, f)).toEqual({ ok: true });
    const insights = await prisma.insight.findMany({ where: { clientId: fx.clientA.id, title: q } });
    expect(insights).toHaveLength(1);
    expect(await prisma.opportunity.count({ where: { clientId: fx.clientA.id, sourceKey: askKey(insights[0].id) } })).toBe(1);
    expect((await askedAbout(fx.clientA.id, "community", [q])).has(q)).toBe(true);
    expect((await askedAbout(fx.clientB.id, "community", [q])).size).toBe(0);
  });
});
