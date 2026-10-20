import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";
import { createContract } from "@/lib/contracts";
import { loadRevenue } from "@/lib/revenue";
import { entitlements } from "@/lib/entitlements";
import { uploadStoreSalesAction } from "@/lib/actions/revenue-actions";

/** Phase V: the Revenue tab's numbers, worked out in code from the data layer; plans; never another client's rows. */

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const day = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
const row = (o: { source: string; channel: string; metric: string; value: number; model?: string; path?: string }) => ({ clientId: fx.clientA.id, date: day, currency: "EUR", model: "", path: "", ...o });

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.dataSource.createMany({ data: [{ clientId: fx.clientA.id, source: "Shopify", status: "connected", health: { withSource: 0.9, of: "orders" } }, { clientId: fx.clientA.id, source: "Klaviyo", status: "connected" }] });
  await prisma.metricDaily.createMany({
    data: [
      row({ source: "Meta", channel: "Meta", metric: "spend", value: 1000 }),
      row({ source: "Shopify", channel: "Meta", metric: "revenue", value: 3000, model: "first", path: "online" }),
      row({ source: "Shopify", channel: "Meta", metric: "revenue", value: 1000, model: "last", path: "online" }),
      row({ source: "Shopify", channel: "Google Ads", metric: "revenue", value: 1000, model: "first", path: "online" }),
      row({ source: "Shopify", channel: "Google Ads", metric: "revenue", value: 3000, model: "last", path: "online" }),
      // Klaviyo only reports last touch: used as-is under every model.
      row({ source: "Klaviyo", channel: "Klaviyo email", metric: "revenue", value: 500, model: "last", path: "online" }),
    ],
  });
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { clientId: fx.clientA.id } });
  await fx.cleanup();
});

describe("Revenue", () => {
  it("credit models: first, last, shared (the average); a last-touch-only source counts as-is", async () => {
    const meta = async (model: "first" | "last" | "shared") => (await loadRevenue(fx.clientA.id, { days: 30, model })).tables.channel.find((c) => c.name === "Meta")!.revenue;
    expect([await meta("first"), await meta("last"), await meta("shared")]).toEqual([3000, 1000, 2000]);
    const r = await loadRevenue(fx.clientA.id, { days: 30, model: "first" });
    expect(r.tables.channel.find((c) => c.name === "Klaviyo email")!.revenue).toBe(500);
    expect(r.lastOnly).toEqual(["Klaviyo"]);
    expect(r.tiles.revenue.value).toBe(4500);
    expect(r.tiles.roas.value).toBe(4.5);
    // No previous period stored: no made-up change.
    expect(r.tiles.revenue.change).toBeNull();
    expect(r.blind.map((b) => b.text).join(" ")).toMatch(/10% of orders have no source/);
  });

  it("another client sees none of it, and with nothing connected the tab is the empty state", async () => {
    const b = await loadRevenue(fx.clientB.id, { days: 90 });
    expect(b.connected).toBe(false);
    expect(b.tiles.revenue.value).toBe(0);
    expect(b.tables.channel).toEqual([]);
  });

  it("plans: tiles on every plan; the table and work on Pro; credit choice, mapping and the upload on Enterprise", async () => {
    await createContract({ clientId: fx.clientA.id, platformPlanKey: "pro", termMonths: 12, startDate: new Date("2026-09-01T00:00:00"), currency: "EUR" }, null);
    const pro = await entitlements(fx.clientA.id);
    expect([pro.tier, pro.has("revenueTiles"), pro.has("revenueTable"), pro.has("attributionChoice"), pro.needs("offlineUpload")]).toEqual(["pro", true, true, false, "Enterprise"]);
    // Old plans map to the new ones.
    await prisma.client.update({ where: { id: fx.clientB.id }, data: { planTier: "GROWTH" } });
    expect((await entitlements(fx.clientB.id)).tier).toBe("pro");
    await prisma.client.update({ where: { id: fx.clientB.id }, data: { planTier: "SCALE" } });
    expect((await entitlements(fx.clientB.id)).tier).toBe("enterprise");
  });

  it("monthly store sales upload: Enterprise only, kept apart from marketing revenue, logged", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const f = new FormData();
    f.set("csv", "month,market,revenue,orders\n2026-09,SE,12500,140");
    await expect(uploadStoreSalesAction(f)).rejects.toThrow(/REDIRECT:.*Enterprise/);
    await prisma.contract.updateMany({ where: { clientId: fx.clientA.id }, data: { platformPlanKey: "enterprise" } });
    await expect(uploadStoreSalesAction(f)).rejects.toThrow(/REDIRECT:.*uploaded/);
    expect(await prisma.metricDaily.count({ where: { clientId: fx.clientA.id, source: "Offline", metric: "store_revenue", value: 12500, market: "SE" } })).toBe(1);
    const bad = new FormData();
    bad.set("csv", "September,SE,lots");
    await expect(uploadStoreSalesAction(bad)).rejects.toThrow(/REDIRECT:.*Line%201/);
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, action: { startsWith: "Uploaded store sales" } } })).toBe(1);
  });
});
