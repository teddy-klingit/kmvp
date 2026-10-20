import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";
import { salesDisconnectAction, salesFinishAction, salesLoginAction, salesStagesAction, salesWaitlistAction } from "@/lib/actions/sales-connection-actions";
import { purgeDisconnectedSources } from "@/lib/metrics";

/**
 * Phase V: Sales & revenue connections. Demo-only sign-in for now (approved): a demo client logs in, maps its stages
 * and chooses what to sync; a real client asks Klingit. Read-only, totals only, logged, deleted 30 days after a
 * disconnect.
 */

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { isDemo: true } });
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
});

describe("Sales & revenue connections", () => {
  it("a demo client connects HubSpot in 3 steps: log in, map stages (pre-filled), choose what to sync", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const login = await salesLoginAction("HubSpot");
    expect(login.status).toBe("setting_up");
    expect(Object.fromEntries(login.settings!.stages!.map((s) => [s.name, s.mapTo]))).toEqual({ Lead: "new_lead", "Marketing qualified lead": "qualified", "Meeting booked": "qualified", "Proposal sent": "deal", "Closed won": "customer", "Closed lost": "lost" });
    expect(login.settings!.stages![0].deals12m).toBe(1240);

    const staged = await salesStagesAction("HubSpot", { "Meeting booked": "deal" });
    expect(staged.settings!.step).toBe(3);
    expect(staged.settings!.stages!.find((s) => s.name === "Meeting booked")!.mapTo).toBe("deal");

    const done = await salesFinishAction("HubSpot", { pipelines: ["Retail"], currency: "EUR", historyMonths: 12 });
    expect(done.status).toBe("connected");
    const ds = await prisma.dataSource.findUniqueOrThrow({ where: { clientId_source: { clientId: fx.clientA.id, source: "HubSpot" } } });
    expect(ds).toMatchObject({ status: "connected", isDemo: true, health: { withSource: 0.82, of: "deals" } });
    expect((ds.settings as { pipelines: { name: string; selected: boolean }[] }).pipelines).toEqual([
      { name: "Retail", selected: true },
      { name: "Wholesale", selected: false },
    ]);
    const log = await prisma.auditLog.findMany({ where: { clientId: fx.clientA.id, area: "connections" }, orderBy: { createdAt: "asc" } });
    expect(log.map((l) => l.action)).toEqual(["Connected HubSpot (read-only, setting up)", "HubSpot set up: syncing Retail, 12 months"]);
  });

  it("only the client's admins can connect", async () => {
    await prisma.clientUser.updateMany({ where: { userId: fx.userB.id }, data: { permission: "VIEWER" } });
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    await expect(salesLoginAction("Shopify")).rejects.toThrow(/admins/);
    await prisma.clientUser.updateMany({ where: { userId: fx.userB.id }, data: { permission: "OWNER" } });
  });

  it("a real client's Connect asks Klingit's admins (no demo data, logged)", async () => {
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    const r = await salesLoginAction("Shopify");
    expect(r.status).toBe("requested");
    expect(await prisma.dataSource.findUniqueOrThrow({ where: { clientId_source: { clientId: fx.clientB.id, source: "Shopify" } } })).toMatchObject({ status: "requested", isDemo: false, settings: null });
    expect(await prisma.notification.count({ where: { userId: fx.adminUser.id, clientId: fx.clientB.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientB.id, area: "connections", action: "Asked Klingit to connect Shopify" } })).toBe(1);
  });

  it("coming soon: Tell me when it's ready", async () => {
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    await salesWaitlistAction(form({ source: "Salesforce" }));
    expect((await prisma.dataSource.findUniqueOrThrow({ where: { clientId_source: { clientId: fx.clientB.id, source: "Salesforce" } } })).status).toBe("waitlist");
  });

  it("disconnect: syncing stops now, its numbers are deleted 30 days later and nothing else is touched", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const row = (source: string, metric: string) => ({ clientId: fx.clientA.id, date: "2026-10-01", source, channel: "Meta", metric, value: 10, path: "retail" });
    await prisma.metricDaily.createMany({ data: [row("HubSpot", "deals"), row("HubSpot", "won"), row("Shopify", "orders")] });
    await salesDisconnectAction(form({ source: "HubSpot" }));
    const ds = await prisma.dataSource.findUniqueOrThrow({ where: { clientId_source: { clientId: fx.clientA.id, source: "HubSpot" } } });
    expect(ds.status).toBe("disconnected");
    const days = Math.round((ds.purgeAfter!.getTime() - Date.now()) / 86400000);
    expect(days).toBe(30);
    expect(await purgeDisconnectedSources(new Date())).toBe(0);
    expect(await prisma.metricDaily.count({ where: { clientId: fx.clientA.id, source: "HubSpot" } })).toBe(2);
    expect(await purgeDisconnectedSources(new Date(Date.now() + 31 * 86400000))).toBe(1);
    expect(await prisma.metricDaily.count({ where: { clientId: fx.clientA.id, source: "HubSpot" } })).toBe(0);
    expect(await prisma.metricDaily.count({ where: { clientId: fx.clientA.id, source: "Shopify" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, action: { startsWith: "Deleted 2 synced numbers from HubSpot" } } })).toBe(1);
  });

  it("the data layer has no place for personal data: totals only", () => {
    const fields = Object.keys(Prisma.MetricDailyScalarFieldEnum).join(" ");
    expect(fields).not.toMatch(/email|phone|address|firstName|lastName|customerName|personName/i);
  });
});
