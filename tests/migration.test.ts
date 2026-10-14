import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { migrationPreview } from "@/lib/migration";

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
});
