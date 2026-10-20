import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const calls = vi.hoisted(() => ({ news: 0, meta: 0, linkedIn: 0 }));
vi.mock("@/lib/integrations/industry-news", () => ({ getIndustryNews: async () => (calls.news++, [{ title: "Skincare goes refillable", url: "https://example.com/a", source: "Example", publishedAt: new Date().toISOString() }]) }));
vi.mock("@/lib/integrations/meta-ad-library", () => ({ getCompetitorAdLibraryActivity: async (brands: string[]) => (calls.meta++, brands.map((brand) => ({ ok: true, brand, ads: [{ id: `${brand}-1`, snapshotUrl: `https://ads.example/${brand}` }] }))) }));
vi.mock("@/lib/integrations/linkedin-ad-library", () => ({ getLinkedInCompetitorAds: async () => (calls.linkedIn++, []) }));

import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { latestCompetitorChecks, refreshMarketSources } from "@/lib/integrations/market-refresh";

/** Phase V: the Market tabs read stored checks; the outside sources are read by the scheduler, at most every 6 hours. */
let fx: Awaited<ReturnType<typeof createSecurityFixtures>>;
beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { competitorBrands: ["Rival"], industry: "Skincare", isDemo: false } });
});
afterAll(() => fx.cleanup());

describe("market refresh", () => {
  it("stores the checks once, then skips until 6 hours have passed", async () => {
    const now = new Date();
    expect((await refreshMarketSources(fx.clientA.id, now)).refreshed).toBe(true);
    expect((await refreshMarketSources(fx.clientA.id, new Date(now.getTime() + 60 * 60 * 1000))).refreshed).toBe(false);
    expect(calls).toMatchObject({ news: 1, meta: 1 });
    const checks = await latestCompetitorChecks(fx.clientA.id);
    expect(checks.get("Rival")).toEqual({ checked: ["Meta"], ads: [{ href: "https://ads.example/Rival", label: "Meta ad" }] });
    // Another client sees none of it.
    expect((await latestCompetitorChecks(fx.clientB.id)).size).toBe(0);
  });
});
