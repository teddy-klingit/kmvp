import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { loadPaidTab } from "@/lib/insights/paid-tab";
import { loadSalesTab } from "@/lib/insights/sales-tab";
import { adPlatformOf, salesGroupOf } from "@/lib/insights/layer";
import { setAdBudgetAction } from "@/lib/actions/ops-goal-actions";
import { money } from "@/lib/insights/format";

/** Phase X3: Paid ads and Sales read one data layer with one credit rule, so their numbers agree. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const NOW = new Date("2026-11-17T12:00:00Z");
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const c = fx.clientA.id;
  const row = (r: { d: number; source: string; channel: string; metric: string; value: number; path?: string; model?: string; outputId?: string; campaignId?: string }) => ({ clientId: c, date: iso(r.d), source: r.source, channel: r.channel, metric: r.metric, value: r.value, path: r.path ?? "", model: r.model ?? "", outputId: r.outputId ?? null, campaignId: r.campaignId ?? "", currency: "EUR" });
  const rows = [];
  // 10 days of ads in the current 30 days: Meta 100/day, Google 50/day.
  for (let d = 0; d < 10; d++) {
    rows.push(row({ d, source: "Meta", channel: "Meta", metric: "spend", value: 100 }), row({ d, source: "Meta", channel: "Meta", metric: "impressions", value: 10000 }), row({ d, source: "Meta", channel: "Meta", metric: "clicks", value: 150 }));
    rows.push(row({ d, source: "Google", channel: "Google Ads", metric: "spend", value: 50 }), row({ d, source: "Google", channel: "Google Ads", metric: "impressions", value: 5000 }), row({ d, source: "Google", channel: "Google Ads", metric: "clicks", value: 50 }));
  }
  // Sales, first and last touch (shared = the average): Meta 3000/1000 → 2000; Google 1000; email 800 (last only on both).
  for (const [channel, first, last, orders, fresh] of [["Meta", 3000, 1000, 40, 30], ["Google Ads", 1000, 1000, 20, 10], ["Klaviyo email", 800, 800, 20, 4]] as const) {
    rows.push(row({ d: 3, source: "Shopify", channel, metric: "revenue", value: first, path: "online", model: "first" }), row({ d: 3, source: "Shopify", channel, metric: "revenue", value: last, path: "online", model: "last" }));
    rows.push(row({ d: 3, source: "Shopify", channel, metric: "orders", value: orders, path: "online", model: "first" }), row({ d: 3, source: "Shopify", channel, metric: "orders", value: orders, path: "online", model: "last" }));
    rows.push(row({ d: 3, source: "Shopify", channel, metric: "new_customers", value: fresh, path: "online", model: "first" }), row({ d: 3, source: "Shopify", channel, metric: "new_customers", value: fresh, path: "online", model: "last" }));
  }
  // One retail deal credited to LinkedIn: 2000.
  rows.push(row({ d: 4, source: "HubSpot", channel: "LinkedIn", metric: "won_value", value: 2000, path: "retail", model: "first" }), row({ d: 4, source: "HubSpot", channel: "LinkedIn", metric: "won_value", value: 2000, path: "retail", model: "last" }));
  rows.push(row({ d: 4, source: "HubSpot", channel: "LinkedIn", metric: "won", value: 1, path: "retail", model: "first" }), row({ d: 4, source: "HubSpot", channel: "LinkedIn", metric: "won", value: 1, path: "retail", model: "last" }));
  // A tired ad: seen 4.6 times per person, CTR 1.5% three weeks ago → 0.8% this week.
  const asset = await prisma.asset.create({ data: { clientId: c, projectId: fx.projectA.id, name: "Shop the set", format: "Feed 4:5", type: "IMAGE", status: "DELIVERED" } });
  for (let d = 22; d <= 27; d++) rows.push(row({ d, source: "Meta", channel: "Meta", metric: "impressions", value: 1000, outputId: asset.id, campaignId: `ad-${d}` }), row({ d, source: "Meta", channel: "Meta", metric: "clicks", value: 15, outputId: asset.id, campaignId: `ad-${d}` }));
  for (let d = 0; d <= 5; d++) rows.push(row({ d, source: "Meta", channel: "Meta", metric: "impressions", value: 1000, outputId: asset.id, campaignId: `ad-${d}` }), row({ d, source: "Meta", channel: "Meta", metric: "clicks", value: 8, outputId: asset.id, campaignId: `ad-${d}` }));
  rows.push(row({ d: 0, source: "Meta", channel: "Meta", metric: "frequency", value: 4.6, outputId: asset.id, campaignId: "freq" }));
  await prisma.metricDaily.createMany({ data: rows });
});
afterAll(async () => {
  await fx.cleanup();
});

describe("channels and groups", () => {
  it("maps sales channels to their ad platform and to the Sales tab's groups", () => {
    expect(adPlatformOf("Google Ads")).toBe("Google");
    expect(adPlatformOf("Instagram (organic)")).toBeNull();
    expect(adPlatformOf("Klaviyo email")).toBeNull();
    expect(salesGroupOf({ channel: "Meta", path: "online" })).toBe("Meta ads");
    expect(salesGroupOf({ channel: "LinkedIn", path: "retail" })).toBe("Retail deals");
    expect(salesGroupOf({ channel: "Klaviyo email", path: "online" })).toBe("Email");
    expect(salesGroupOf({ channel: "Instagram (organic)", path: "online" })).toBe("Organic social");
    expect(salesGroupOf({ channel: "Unattributed", path: "online" })).toBe("Search & direct");
    expect(money(141000)).toBe("€141k");
    expect(money(30600)).toBe("€30.6k");
    expect(money(31.4)).toBe("€31");
  });
});

describe("Paid ads", () => {
  it("spend, sales from ads (shared credit), cost per order and click rate come from the data layer", async () => {
    const t = await loadPaidTab(fx.clientA.id, { days: 30, now: NOW });
    expect(t.numbers.spend.value).toBe(1500);
    // Meta 2000 + Google 1000 online + LinkedIn's 2000 retail deal.
    expect(t.numbers.sales.value).toBe(5000);
    // Meta and Google sell online: 1500 / (40 + 20) orders.
    expect(t.numbers.costPerOrder.value).toBe(25);
    const meta = t.channels.find((c) => c.platform === "Meta")!;
    expect(meta).toMatchObject({ spend: 1000, sales: 2000, return: 2 });
    expect(t.channels.find((c) => c.platform === "LinkedIn")).toMatchObject({ spend: 0, sales: 2000, retailOnly: true });
    expect(t.budget).toBeNull();
  });

  it("flags an ad people see over 4 times whose click rate fell by a third", async () => {
    const t = await loadPaidTab(fx.clientA.id, { days: 30, now: NOW });
    expect(t.tired.map((a) => a.title)).toEqual(["Shop the set"]);
    expect(t.tired[0].ctrBefore).toBeCloseTo(1.5);
    expect(t.tired[0].ctrNow).toBeCloseTo(0.8);
  });
});

describe("Sales agrees with Paid ads", () => {
  it("the same ad sales under each group, and the total adds email and retail", async () => {
    const [paid, sales] = await Promise.all([loadPaidTab(fx.clientA.id, { days: 30, now: NOW }), loadSalesTab(fx.clientA.id, { days: 30, model: "shared", now: NOW })]);
    const g = (name: string) => sales.from.find((x) => x.group === name)?.sales ?? 0;
    expect(g("Meta ads")).toBe(paid.channels.find((c) => c.platform === "Meta")!.sales);
    expect(g("Google Ads")).toBe(paid.channels.find((c) => c.platform === "Google")!.sales);
    expect(g("Email")).toBe(800);
    expect(g("Retail deals")).toBe(2000);
    expect(sales.numbers.sales.value).toBe(5800);
    expect(sales.numbers.orders.value).toBe(80);
    expect(sales.customers.fresh).toBe(44);
    expect(sales.customers.returning).toBe(36);
  });

  it("first-touch credit changes the split, never the rule both tabs use", async () => {
    const first = await loadSalesTab(fx.clientA.id, { days: 30, model: "first", now: NOW });
    expect(first.from.find((x) => x.group === "Meta ads")?.sales).toBe(3000);
  });
});

describe("ad budget", () => {
  it("a PM sets the month's budget; pacing reads it; the change is logged; a client can't set it", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const f = new FormData();
    f.set("clientId", fx.clientA.id);
    f.set("month", "2026-11");
    f.set("amount:all", "3000");
    await expect(setAdBudgetAction(f)).rejects.toThrow();
    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    await setAdBudgetAction(f);
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, area: "insights", action: { contains: "Ad budget 2026-11" } } })).toBe(1);
    const t = await loadPaidTab(fx.clientA.id, { days: 30, now: NOW });
    expect(t.budget?.plan).toBe(3000);
    // Phase X 2b: the last 30 days' spend against the month's plan.
    expect(t.budget?.spent).toBeCloseTo(t.numbers.spend.value, 6);
    expect(t.budget?.left).toBeCloseTo(3000 - t.numbers.spend.value, 6);
  });
});
