import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";

// The agents themselves are mocked: this tests what the scheduler decides to run.
const calls = vi.hoisted(() => ({ briefs: [] as string[], reports: [] as string[] }));
vi.mock("@/lib/insights-brief", () => ({ generatePerformanceBrief: async (id: string) => (calls.briefs.push(id), { ok: true }) }));
vi.mock("@/lib/integrations/ad-daily", () => ({ syncDailyAdMetrics: async () => ({ synced: [] }) }));
vi.mock("@/lib/report-data", async (orig) => ({
  ...(await orig<typeof import("@/lib/report-data")>()),
  writeReport: async (id: string, p: { kind: string; label: string }) => (calls.reports.push(`${id}:${p.kind}:${p.label}`), { ok: true }),
}));

import { runScheduledAgents } from "@/lib/agent-scheduler";
import { lastClosed } from "@/lib/report-data";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const NOW = new Date(2026, 9, 2, 12);

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.client.updateMany({ where: { id: { in: [fx.clientA.id, fx.clientB.id] } }, data: { status: "ACTIVE" } });
  // A already has this week's takeaways and last week's report; B has nothing.
  await prisma.performanceBrief.create({ data: { clientId: fx.clientA.id, summary: "s", recommendations: [], takeaways: [{ tag: "Performance", metric: "1%", headline: "t", compare: [], action: { kind: "brief", label: "x", view: null }, why: "d" }], actions: [{ headline: "h", chip: "", why: "w", brief: "b" }], generatedAt: NOW } });
  const w = lastClosed("WEEKLY", NOW);
  await prisma.generatedReport.create({ data: { clientId: fx.clientA.id, kind: "WEEKLY", periodStart: w.start, periodEnd: w.end, label: w.label, takeaways: [], topAssetIds: [] } });
});
afterAll(async () => {
  await prisma.performanceBrief.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await prisma.generatedReport.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
});

describe("scheduled agents", () => {
  it("writes only what's missing or stale, per client", async () => {
    await runScheduledAgents(NOW);
    expect(calls.briefs).toContain(fx.clientB.id);
    expect(calls.briefs).not.toContain(fx.clientA.id);
    expect(calls.reports).toContain(`${fx.clientB.id}:WEEKLY:Week 39`);
    expect(calls.reports).toContain(`${fx.clientB.id}:MONTHLY:September 2026`);
    expect(calls.reports).not.toContain(`${fx.clientA.id}:WEEKLY:Week 39`);
    expect(calls.reports).toContain(`${fx.clientA.id}:MONTHLY:September 2026`);
  });
});
