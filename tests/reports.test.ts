import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { isoWeek, lastClosed, loadSchedule, weekOf } from "@/lib/report-data";
import { updateReportScheduleAction } from "@/lib/actions/report-actions";
import PastWeeklyReportPage from "@/app/(portal)/reports/weekly/[id]/page";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await prisma.generatedReport.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await prisma.clientReportingConfig.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
});

describe("report periods", () => {
  it("weeks run Monday to Sunday with ISO numbers", () => {
    const w = weekOf(new Date(2026, 8, 30)); // Wed 30 Sept 2026
    expect(w.start.getDay()).toBe(1);
    expect(w.label).toBe("Week 40");
    expect(w.range).toBe("28 Sept – 4 Oct");
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1); // Thu 1 Jan 2026
  });

  it("the latest report is the last period that has fully closed", () => {
    const fri = new Date(2026, 9, 2); // Fri 2 Oct
    expect(lastClosed("WEEKLY", fri).label).toBe("Week 39");
    expect(lastClosed("MONTHLY", fri).label).toBe("September 2026");
  });
});

describe("send schedule", () => {
  it("only the client's own team can be recipients", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const fd = new FormData();
    fd.set("day", "3");
    fd.set("time", "09:30");
    fd.append("recipient", fx.userA.id);
    fd.append("recipient", fx.userB.id); // someone from another client
    await updateReportScheduleAction(fd);
    const s = await loadSchedule(fx.clientA.id);
    expect(s.day).toBe(3);
    expect(s.time).toBe("09:30");
    expect(s.recipients.map((r) => r.id)).toEqual([fx.userA.id]);
  });

  it("a bad time falls back to 08:00", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const fd = new FormData();
    fd.set("day", "1");
    fd.set("time", "25:99");
    await updateReportScheduleAction(fd);
    expect((await loadSchedule(fx.clientA.id)).time).toBe("08:00");
  });
});

describe("past reports", () => {
  it("client B can't open client A's report", async () => {
    const w = weekOf(new Date(2026, 8, 23));
    const report = await prisma.generatedReport.create({
      data: { clientId: fx.clientA.id, kind: "WEEKLY", periodStart: w.start, periodEnd: w.end, label: w.label, takeaways: [{ title: "A only", detail: "x" }], topAssetIds: [] },
    });
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    await expect(PastWeeklyReportPage({ params: Promise.resolve({ id: report.id }) })).rejects.toThrow("NOT_FOUND");
  });
});
