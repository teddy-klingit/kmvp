import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { createContract } from "@/lib/contracts";
import { createRequest } from "@/lib/requests";
import { myClientIds, scopeFor } from "@/lib/staff-scope";
import { loadToday } from "@/lib/today";
import { loadClientRows } from "@/lib/client-rows";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let pmA: { id: string; userId: string; title: "ACCOUNT_LEAD" };
let pmB: { id: string; userId: string; title: "ACCOUNT_LEAD" };
let admin: { id: string; title: "ADMIN" };

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const mk = async (n: string) => {
    const u = await prisma.user.create({ data: { name: n, email: `${n.toLowerCase().replace(/\s/g, "")}-${Date.now()}@test.local`, role: "INTERNAL", status: "ACTIVE" } });
    return { ...(await prisma.staffMember.create({ data: { userId: u.id, title: "ACCOUNT_LEAD" } })), title: "ACCOUNT_LEAD" as const };
  };
  pmA = await mk("Pia A");
  pmB = await mk("Per B");
  admin = { id: (await prisma.staffMember.findFirstOrThrow({ where: { userId: fx.adminUser.id } })).id, title: "ADMIN" };
  // Client A: on a contract, contact Pia. Client B: Pia is the old account lead, but the contract names Per.
  await createContract({ clientId: fx.clientA.id, platformPlanKey: "enterprise", teamPackKey: "pm20", termMonths: 12, startDate: new Date("2026-09-01T00:00:00"), currency: "EUR", contactStaffId: pmA.id }, null);
  await createContract({ clientId: fx.clientB.id, platformPlanKey: "enterprise", teamPackKey: "pm10", termMonths: 12, startDate: new Date("2026-09-01T00:00:00"), currency: "EUR", contactStaffId: pmB.id }, null);
  await prisma.client.update({ where: { id: fx.clientB.id }, data: { accountLeadId: pmA.id } });
  await createRequest(fx.clientB.id, fx.userB.id, "creative_pack", { packs: 1 });
});
afterAll(async () => {
  await prisma.contract.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
  await prisma.staffMember.deleteMany({ where: { id: { in: [pmA.id, pmB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [pmA.userId, pmB.userId] } } });
});

describe("PM views are scoped to the PM's own clients by default", () => {
  it("my clients = the contract's contact person, else the account lead", async () => {
    const a = await myClientIds(pmA.id);
    expect(a).toContain(fx.clientA.id);
    expect(a).not.toContain(fx.clientB.id); // the contract names Per, so the old account lead doesn't count
    expect(await myClientIds(pmB.id)).toContain(fx.clientB.id);
  });

  it("a PM defaults to Mine and an admin to All; both can switch", async () => {
    expect((await scopeFor(pmA)).mine).toBe(true);
    expect((await scopeFor(pmA, "all")).clientIds).toBeNull();
    expect((await scopeFor(admin)).clientIds).toBeNull();
    expect((await scopeFor(admin, "mine")).mine).toBe(true);
  });

  it("Today shows a client's request only to that client's PM (or under All)", async () => {
    const mineA = await loadToday(await scopeFor(pmA));
    expect(mineA.items.some((i) => i.kind === "request" && i.clientId === fx.clientB.id)).toBe(false);
    const mineB = await loadToday(await scopeFor(pmB));
    expect(mineB.items.some((i) => i.kind === "request" && i.clientId === fx.clientB.id)).toBe(true);
    const all = await loadToday(await scopeFor(pmA, "all"));
    expect(all.items.some((i) => i.kind === "request" && i.clientId === fx.clientB.id)).toBe(true);
  });

  it("the Clients list follows the same scope and flags what needs attention", async () => {
    const rows = await loadClientRows(await scopeFor(pmB));
    expect(rows.map((r) => r.id)).toEqual([fx.clientB.id]);
    expect(rows[0]).toMatchObject({ way: 2, pack: "PM 10", contact: { id: pmB.id } });
    expect(rows[0].attention).toContain("1 request waiting");
  });
});
