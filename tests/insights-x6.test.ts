import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { loadEmailTab } from "@/lib/insights/email-tab";
import { loadSalesTab } from "@/lib/insights/sales-tab";

/** Phase X6: Email. Its sales are the same number as Email on Sales; the rest is Klaviyo's own. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const NOW = new Date("2026-11-17T12:00:00Z");
const iso = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const c = fx.clientA.id;
  const k = (x: { d: number; id: string; name?: string; metric: string; value: number }) => ({ clientId: c, date: iso(x.d), source: "Klaviyo", channel: "Klaviyo email", campaignId: x.id, campaignName: x.name ?? "", metric: x.metric, value: x.value });
  await prisma.metricDaily.createMany({
    data: [
      // The shop's orders credited to email, first and last touch: shared = 2,600.
      { clientId: c, date: iso(3), source: "Shopify", channel: "Klaviyo email", path: "online", model: "first", metric: "revenue", value: 2200 },
      { clientId: c, date: iso(3), source: "Shopify", channel: "Klaviyo email", path: "online", model: "last", metric: "revenue", value: 3000 },
      // Flows and sends as Klaviyo reports them.
      k({ d: 5, id: "flow:welcome", name: "Welcome flow", metric: "reported_revenue", value: 1200 }),
      k({ d: 5, id: "flow:welcome", name: "Welcome flow", metric: "sends", value: 1000 }),
      k({ d: 5, id: "flow:welcome", name: "Welcome flow", metric: "opens", value: 600 }),
      k({ d: 5, id: "flow:abandoned", name: "Abandoned cart", metric: "reported_revenue", value: 600 }),
      ...[
        ["send:a", "your skin, but softer", 10, 500, 2400, 1200, 6],
        ["send:b", "11 days of self-care", 8, 300, 2200, 1000, 4],
        ["send:c", "last chance: 20% off", 2, 100, 1450, 1000, 8],
      ].flatMap(([id, name, d, rev, opens, sends, unsub]) => [
        k({ d: d as number, id: id as string, name: name as string, metric: "reported_revenue", value: rev as number }),
        k({ d: d as number, id: id as string, name: name as string, metric: "opens", value: opens as number }),
        k({ d: d as number, id: id as string, name: name as string, metric: "sends", value: sends as number }),
        k({ d: d as number, id: id as string, name: name as string, metric: "unsubscribes", value: unsub as number }),
      ]),
      k({ d: 0, id: "", metric: "subscribers", value: 38200 }),
      k({ d: 0, id: "", metric: "inactive_90d", value: 9400 }),
      k({ d: 40, id: "", metric: "subscribers", value: 37260 }),
    ],
  });
});
afterAll(async () => {
  await fx.cleanup();
});

describe("Email", () => {
  it("sales from email equal Email on Sales; flows, sends, best and worst, and list health from Klaviyo", async () => {
    const [t, sales] = await Promise.all([loadEmailTab(fx.clientA.id, { days: 30, now: NOW }), loadSalesTab(fx.clientA.id, { days: 30, model: "shared", now: NOW })]);
    expect(t.numbers.sales.value).toBe(2600);
    expect(sales.from.find((g) => g.group === "Email")?.sales).toBe(2600);
    expect(t.flows.map((f) => [f.name, f.sales])).toEqual([["Welcome flow", 1200], ["Abandoned cart", 600]]);
    expect(t.flowSales).toBe(1800);
    expect(t.newsletterSales).toBe(900);
    expect(t.best.map((b) => [b.subject, b.tag])).toEqual([["your skin, but softer", "Best"], ["11 days of self-care", "Best"], ["last chance: 20% off", "Weakest"]]);
    expect(t.discountRead).not.toBeNull();
    expect(t.list).toMatchObject({ subscribers: 38200, growth: 940, inactive: 9400 });
    expect(t.list.inactiveShare).toBeCloseTo(9400 / 38200);
    expect(t.list.unsubscribeRate).toBeCloseTo((18 / 3200) * 100);
  });

  it("another client's email numbers never show up", async () => {
    const t = await loadEmailTab(fx.clientB.id, { days: 30, now: NOW });
    expect(t.hasKlaviyoNumbers).toBe(false);
    expect(t.numbers.sales.value).toBe(0);
  });
});
