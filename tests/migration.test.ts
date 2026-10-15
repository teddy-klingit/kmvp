import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { applyMigration, migrationPreview } from "@/lib/migration";
import { startScheduledContracts } from "@/lib/contracts";
import { teamAllowance } from "@/lib/ai-credits";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const now = new Date("2026-10-14T12:00:00");

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { planTier: "SCALE", teamCreditsOverride: 40, renewalDate: new Date("2026-12-22T00:00:00") } });
  await prisma.client.update({ where: { id: fx.clientB.id }, data: { planTier: "SCALE", teamCreditsOverride: 0, renewalDate: null } });
  await prisma.project.create({ data: { clientId: fx.clientB.id, name: "Running job", type: "CAMPAIGN", status: "IN_PRODUCTION" } });
});
afterAll(async () => {
  await prisma.contract.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
});

describe("migration preview", () => {
  it("proposes the nearest PM + creative pack, keeps the override visible, and changes nothing", async () => {
    const before = await Promise.all([prisma.contract.count(), prisma.auditLog.count(), prisma.client.findMany({ select: { id: true, planTier: true, teamCreditsOverride: true } })]);
    const { rows } = await migrationPreview(now);
    const a = rows.find((r) => r.clientId === fx.clientA.id)!;
    expect(a.proposed).toMatchObject({ way: 3, packKey: "pmc10_20", planKey: "enterprise", termMonths: 12, invoicing: "quarterly" }); // 40 → 30 (nearer than 60)
    expect(a.proposed.start.toISOString().slice(0, 10)).toBe(new Date("2026-12-22T00:00:00").toISOString().slice(0, 10)); // the next renewal
    expect(a.withoutOverride).not.toBeNull();
    expect(a.flags.join(" ")).toContain("Override: 40");
    const b = rows.find((r) => r.clientId === fx.clientB.id)!;
    expect(b.proposed).toMatchObject({ way: 3, packKey: "per_request" }); // no team credits, but active work
    expect(b.flags.join(" ")).toContain("No renewal date");
    expect(b.proposed.start.getDate()).toBe(1);
    expect(await Promise.all([prisma.contract.count(), prisma.auditLog.count(), prisma.client.findMany({ select: { id: true, planTier: true, teamCreditsOverride: true } })])).toEqual(before);
  });

  it("applying one client schedules its contract at the next renewal: today's setup runs until then, then it goes live", async () => {
    const lead = await prisma.staffMember.findFirstOrThrow({ where: { title: { in: ["ACCOUNT_LEAD", "PROJECT_MANAGER"] } } });
    await prisma.client.update({ where: { id: fx.clientA.id }, data: { accountLeadId: lead.id } });
    const before = await teamAllowance(fx.clientA.id);
    const r = await applyMigration(fx.clientA.id, { useOverride: true }, fx.adminUser.id, now);
    expect(r.contract).toMatchObject({ status: "scheduled", teamPackKey: "pmc10_20", contactStaffId: lead.id });
    expect(r.emailDraft).toContain("Subject: Your Klingit plan from");
    expect(await teamAllowance(fx.clientA.id)).toEqual(before); // still the old plan
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, area: "migration" } })).toBe(1);
    expect(await prisma.notification.count({ where: { clientId: fx.clientA.id, title: { startsWith: "Your new plan starts" } } })).toBeGreaterThan(0);
    await expect(applyMigration(fx.clientA.id, { useOverride: true }, null, now)).rejects.toThrow(); // once only
    const { migrated } = await migrationPreview(now);
    expect(migrated.find((m) => m.id === fx.clientA.id)).toMatchObject({ status: "scheduled" });
    await startScheduledContracts(new Date("2026-12-23T12:00:00"));
    expect((await teamAllowance(fx.clientA.id)).source).toBe("contract");
  });

  it("a team pack without a contact person can't be applied", async () => {
    await prisma.client.update({ where: { id: fx.clientB.id }, data: { accountLeadId: null } });
    await expect(applyMigration(fx.clientB.id, { useOverride: true }, null, now)).rejects.toThrow(/Marketing PM/);
  });
});
