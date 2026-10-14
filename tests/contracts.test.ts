import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { addMonths, applyDueChanges, cancelContract, createContract, endContract, noticeDeadlineFor, ordersPaused, pauseContract, renewals, resumeContract, scheduleDowngrade, scheduleUpgrade, setContact } from "@/lib/contracts";
import { loadPricing, monthlyPrice } from "@/lib/pricing";
import { startBriefAction } from "@/lib/actions/brief-studio-actions";
import { setMockSession } from "./setup";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let pm: { id: string; userId: string };
const d = (s: string) => new Date(`${s}T00:00:00`);
const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const u = await prisma.user.create({ data: { name: "Mia Marketing PM", email: `mpm-${Date.now()}@test.local`, role: "INTERNAL", status: "ACTIVE" } });
  pm = await prisma.staffMember.create({ data: { userId: u.id, title: "ACCOUNT_LEAD" } });
});
afterAll(async () => {
  await prisma.contract.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await prisma.auditLog.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
  await prisma.staffMember.delete({ where: { id: pm.id } });
  await prisma.user.delete({ where: { id: pm.userId } });
});

describe("contracts (Phase S)", () => {
  it("locks prices at signing, needs Enterprise and a contact person for a team pack, and sets the notice deadline", async () => {
    await expect(createContract({ clientId: fx.clientA.id, platformPlanKey: "pro", teamPackKey: "pmc20_40", termMonths: 12, startDate: d("2026-09-01"), currency: "EUR", contactStaffId: pm.id }, null)).rejects.toThrow(/needs the Enterprise/);
    await expect(createContract({ clientId: fx.clientA.id, platformPlanKey: "enterprise", teamPackKey: "pmc20_40", termMonths: 12, startDate: d("2026-09-01"), currency: "EUR" }, null)).rejects.toThrow(/contact person/);
    const c = await createContract({ clientId: fx.clientA.id, platformPlanKey: "enterprise", teamPackKey: "pmc20_40", termMonths: 12, startDate: d("2026-09-01"), currency: "EUR", contactStaffId: pm.id }, fx.adminUser.id);
    expect(c).toMatchObject({ platformPrice: 249, teamPrice: 4600, pmCreditsPerMonth: 20, creativeCreditsPerMonth: 40, invoicing: "quarterly", status: "active" });
    expect([ymd(c.endDate), ymd(c.noticeDeadline)]).toEqual(["2027-09-01", "2027-07-01"]);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: fx.clientA.id } })).accountLeadId).toBe(pm.id);
    // List prices change; the signed contract doesn't.
    await prisma.teamPack.update({ where: { key: "pmc20_40" }, data: { priceEur: 5000 } });
    try {
      expect((await prisma.contract.findUniqueOrThrow({ where: { id: c.id } })).teamPrice).toBe(4600);
    } finally {
      await prisma.teamPack.update({ where: { key: "pmc20_40" }, data: { priceEur: 4600 } });
    }
    await expect(createContract({ clientId: fx.clientA.id, platformPlanKey: "pro", termMonths: 3, startDate: d("2026-09-01"), currency: "EUR" }, null)).rejects.toThrow(/already has a contract/);
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, area: "contract" } })).toBeGreaterThan(0);
  });

  it("renews for the same term unless cancelled by the notice deadline", async () => {
    const c = await prisma.contract.findFirstOrThrow({ where: { clientId: fx.clientA.id } });
    await expect(cancelContract(c.id, null, d("2027-07-02"))).rejects.toThrow(/notice deadline was 2027-07-01/);
    await applyDueChanges(c.id, d("2027-09-02"));
    const renewed = await prisma.contract.findUniqueOrThrow({ where: { id: c.id } });
    expect([renewed.status, ymd(renewed.startDate), ymd(renewed.endDate), ymd(renewed.noticeDeadline)]).toEqual(["active", "2027-09-01", "2028-09-01", "2028-07-01"]);
    await cancelContract(c.id, null, d("2028-06-30"));
    await applyDueChanges(c.id, d("2028-09-01"));
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("ended");
  });

  it("upgrade: 7 days' notice, at least 3 months, priced at the upgrade length's rate, then back", async () => {
    const c = await createContract({ clientId: fx.clientB.id, platformPlanKey: "enterprise", teamPackKey: "pmc20_40", termMonths: 12, startDate: d("2026-09-01"), currency: "EUR", contactStaffId: pm.id }, null);
    await expect(scheduleUpgrade(c.id, { teamPackKey: "pmc40_80", months: 2 }, null, d("2026-10-14"))).rejects.toThrow(/at least 3 months/);
    await expect(scheduleUpgrade(c.id, { teamPackKey: "pm10", months: 3 }, null, d("2026-10-14"))).rejects.toThrow(/not an upgrade/);
    const up = await scheduleUpgrade(c.id, { teamPackKey: "pmc40_80", months: 3 }, null, d("2026-10-14"));
    expect([ymd(up.effectiveFrom), ymd(up.until!)]).toEqual(["2026-10-21", "2027-01-21"]);
    const threeMonthRate = monthlyPrice(await loadPricing(), { planKey: "enterprise", packKey: "pmc40_80", term: 3, currency: "EUR" }).team;
    expect((up.after as { teamPrice: number }).teamPrice).toBe(threeMonthRate); // the 3-month rate, not the contract's 12
    await applyDueChanges(c.id, d("2026-10-20"));
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: c.id } })).creativeCreditsPerMonth).toBe(40);
    await applyDueChanges(c.id, d("2026-10-21"));
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ creativeCreditsPerMonth: 80, teamPrice: threeMonthRate });
    await applyDueChanges(c.id, d("2027-01-21"));
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ creativeCreditsPerMonth: 40, teamPrice: 4600 });
  });

  it("downgrade: once a month, from the first of the month after a month's notice", async () => {
    const c = await prisma.contract.findFirstOrThrow({ where: { clientId: fx.clientB.id, status: "active" } });
    const down = await scheduleDowngrade(c.id, { teamPackKey: "pmc10_20" }, null, d("2027-02-10"));
    expect(ymd(down.effectiveFrom)).toBe("2027-04-01");
    await expect(scheduleDowngrade(c.id, { teamPackKey: "pm10" }, null, d("2027-02-20"))).rejects.toThrow(/One downgrade a month/);
    await applyDueChanges(c.id, d("2027-04-01"));
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: c.id } })).creativeCreditsPerMonth).toBe(20);
  });

  it("pause: platform stays, new projects stop, and the end date moves by the pause", async () => {
    const c = await prisma.contract.findFirstOrThrow({ where: { clientId: fx.clientB.id, status: "active" } });
    const end = c.endDate;
    await pauseContract(c.id, null, "Summer break", d("2027-05-01"));
    expect(await ordersPaused(fx.clientB.id)).toBe(true);
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    expect(await startBriefAction("A summer campaign")).toEqual({ error: expect.stringMatching(/paused/) });
    await resumeContract(c.id, null, d("2027-05-31"));
    const after = await prisma.contract.findUniqueOrThrow({ where: { id: c.id } });
    expect(Math.round((after.endDate.getTime() - end.getTime()) / 86400000)).toBe(30);
    expect(ymd(after.noticeDeadline)).toBe(ymd(noticeDeadlineFor(after.endDate)));
    expect(await ordersPaused(fx.clientB.id)).toBe(false);
  });

  it("the contact person is required with a pack, logged and told to the client", async () => {
    const c = await prisma.contract.findFirstOrThrow({ where: { clientId: fx.clientB.id, status: "active" } });
    await expect(setContact(c.id, null, null)).rejects.toThrow(/needs a contact person/);
    await setContact(c.id, pm.id, fx.adminUser.id);
    expect(await prisma.notification.count({ where: { clientId: fx.clientB.id, title: { contains: "is your Marketing PM" } } })).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientB.id, action: "contact person changed" } })).toBe(1);
  });

  it("Renewals: soonest notice deadline first, urgent from 30 days before it", async () => {
    const c = await prisma.contract.findFirstOrThrow({ where: { clientId: fx.clientB.id, status: "active" } });
    const list = await renewals(new Date(c.noticeDeadline.getTime() - 10 * 86400000));
    const row = list.find((r) => r.contract.id === c.id)!;
    expect([row.urgent, row.daysToNotice]).toEqual([true, 10]);
    await endContract(c.id, null, "test done");
    expect(addMonths(d("2027-01-31"), 1).getDate()).toBe(28);
  });
});
