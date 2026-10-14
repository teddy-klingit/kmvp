import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { createContract } from "@/lib/contracts";
import { loadWorkload, SERVICES_SQUAD } from "@/lib/workload";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let pm: { id: string; userId: string };
const now = new Date("2026-10-14T12:00:00");

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const u = await prisma.user.create({ data: { name: "Wanda Workload", email: `workload-${Date.now()}@test.local`, role: "INTERNAL", status: "ACTIVE" } });
  pm = await prisma.staffMember.create({ data: { userId: u.id, title: "ACCOUNT_LEAD" } });
  await createContract({ clientId: fx.clientA.id, platformPlanKey: "enterprise", teamPackKey: "pmc20_40", termMonths: 12, startDate: new Date("2026-09-01T00:00:00"), currency: "EUR", contactStaffId: pm.id }, null);
  const item = await prisma.priceListItem.findFirstOrThrow({ where: { squad: "Copywriting", archivedAt: null } });
  const at = (s: string) => new Date(`${s}T12:00:00`);
  await prisma.creditLedgerEntry.createMany({
    data: [
      { clientId: fx.clientA.id, type: "CONSUMPTION", pool: "pm", amount: -22, balanceAfter: 0, createdAt: at("2026-10-03") },
      { clientId: fx.clientA.id, type: "CONSUMPTION", pool: "creative", amount: -12, balanceAfter: 0, format: item.deliverableType, createdAt: at("2026-10-05") },
      { clientId: fx.clientA.id, type: "CONSUMPTION", pool: "creative", amount: -3, balanceAfter: 0, format: item.deliverableType, createdAt: at("2026-08-05") },
      { clientId: fx.clientA.id, type: "SERVICE", pool: "creative", amount: -15, balanceAfter: 0, periodKey: "2026-10", serviceId: "svc-test", createdAt: at("2026-09-30") },
    ],
  });
});
afterAll(async () => {
  await prisma.contract.deleteMany({ where: { clientId: fx.clientA.id } });
  await fx.cleanup();
  await prisma.staffMember.deleteMany({ where: { id: pm.id } });
  await prisma.user.deleteMany({ where: { id: pm.userId } });
});

describe("Team workload", () => {
  it("per PM: their clients, PM credits sold vs used this month, creative booked, and a warning when over", async () => {
    const w = await loadWorkload(now);
    const row = w.pms.find((p) => p.staffId === pm.id)!;
    expect(row.clients.map((c) => c.id)).toEqual([fx.clientA.id]);
    expect(row).toMatchObject({ pmSold: 20, pmUsed: 22, creativeBooked: 27 });
    expect(row.warnings.join()).toContain("over what's sold");
  });

  it("per squad: creative lines go to the Price List item's squad; services are their own row", async () => {
    const w = await loadWorkload(now);
    const copy = w.squads.find((s) => s.squad === "Copywriting")!;
    expect(copy.booked).toBeGreaterThanOrEqual(12);
    expect(copy.average).toBeGreaterThanOrEqual(1);
    expect(w.squads.find((s) => s.squad === SERVICES_SQUAD)?.booked).toBeGreaterThanOrEqual(15);
  });
});
