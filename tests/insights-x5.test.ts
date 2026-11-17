import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { loadWebsiteTab, trafficGroupOf } from "@/lib/insights/website-tab";

/** Phase X5: Website & search, the client's own site only. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const NOW = new Date("2026-11-17T12:00:00Z");
const iso = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const c = fx.clientA.id;
  const r = (x: { d?: number; source: string; channel?: string; metric: string; value: number; page?: string; path?: string; model?: string }) => ({ clientId: c, date: iso(x.d ?? 2), source: x.source, channel: x.channel ?? "", metric: x.metric, value: x.value, page: x.page ?? "", path: x.path ?? "", model: x.model ?? "" });
  await prisma.metricDaily.createMany({
    data: [
      r({ source: "GA4", channel: "Google organic", metric: "sessions", value: 4000 }),
      r({ source: "GA4", channel: "Meta", metric: "sessions", value: 3000 }),
      r({ source: "GA4", channel: "AI assistants", metric: "sessions", value: 1000 }),
      r({ source: "GA4", channel: "Unattributed", metric: "sessions", value: 2000 }),
      r({ source: "GA4", metric: "product_views", value: 6000 }),
      r({ source: "GA4", metric: "add_to_cart", value: 900 }),
      // Orders credited to channels (last touch only here, so they count as-is).
      r({ source: "Shopify", channel: "Google organic", metric: "orders", value: 120, path: "online", model: "last" }),
      r({ source: "Shopify", channel: "Meta", metric: "orders", value: 90, path: "online", model: "last" }),
      r({ source: "Shopify", channel: "AI assistants", metric: "orders", value: 50, path: "online", model: "last" }),
      r({ source: "Shopify", channel: "Unattributed", metric: "orders", value: 40, path: "online", model: "last" }),
      r({ source: "GA4", metric: "sessions", value: 2000, page: "/cloud-cream" }),
      r({ source: "Shopify", metric: "orders", value: 100, page: "/cloud-cream", path: "online", model: "last" }),
      r({ source: "GA4", metric: "sessions", value: 1000, page: "/sun-day-stick" }),
      r({ source: "Shopify", metric: "orders", value: 10, page: "/sun-day-stick", path: "online", model: "last" }),
      // Another client's site never shows up.
      { ...r({ source: "GA4", channel: "AI assistants", metric: "sessions", value: 99999 }), clientId: fx.clientB.id },
    ],
  });
  await prisma.searchRanking.createMany({
    data: [
      { clientId: c, keyword: "cloud cream", position: 2, previousPosition: 3, capturedAt: new Date(NOW.getTime() - 9 * 86400000) },
      { clientId: c, keyword: "cloud cream", position: 1, previousPosition: 2, capturedAt: new Date(NOW.getTime() - 2 * 86400000) },
      { clientId: c, keyword: "tinted spf sensitive skin", position: null, previousPosition: null, capturedAt: new Date(NOW.getTime() - 2 * 86400000) },
    ],
  });
});
afterAll(async () => {
  await fx.cleanup();
});

describe("Website & search", () => {
  it("groups traffic sources the way the tab shows them", () => {
    expect(trafficGroupOf("Google organic")).toBe("Google (organic)");
    expect(trafficGroupOf("Google Ads")).toBe("Paid ads");
    expect(trafficGroupOf("ChatGPT")).toBe("AI assistants");
    expect(trafficGroupOf("Klaviyo email")).toBe("Email");
    expect(trafficGroupOf("Instagram (organic)")).toBe("Instagram");
    expect(trafficGroupOf("Unattributed")).toBe("Direct");
  });

  it("visits, buy rate, the funnel's biggest drop, sources, pages and rankings", async () => {
    const t = await loadWebsiteTab(fx.clientA.id, { days: 30, now: NOW });
    expect(t.numbers.visits.value).toBe(10000);
    expect(t.numbers.google.value).toBe(4000);
    expect(t.numbers.ai.value).toBe(1000);
    expect(t.numbers.buyRate.value).toBe(3);
    expect(t.funnel!.map((s) => s.value)).toEqual([10000, 6000, 900, 300]);
    expect(t.biggestDrop).toMatchObject({ from: "Viewed a product", to: "Added to cart" });
    expect(t.sources.find((s) => s.group === "AI assistants")?.buyRate).toBe(5);
    expect(t.pages.map((p) => [p.page, p.buyRate])).toEqual([["/cloud-cream", 5], ["/sun-day-stick", 1]]);
    expect(t.rankings.map((r) => [r.keyword, r.position])).toEqual([["cloud cream", 1], ["tinted spf sensitive skin", null]]);
  });
});
