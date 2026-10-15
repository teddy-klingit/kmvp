import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";
import { priceListGaps } from "@/lib/price-list-gaps";
import { assignPmAction, addDraftItemsAction } from "@/lib/actions/admin-setup-actions";
import { clientsWithoutPm } from "@/lib/admin-jobs";
import { loadToday } from "@/lib/today";
import { offerable } from "@/lib/estimate-lines";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let pm: { id: string; userId: string };
const NEEDS = ["Ad copywriting (6 variants)", "Ad copy variants for Meta", "Meta ad copy variants", "Captions and subtitles for reels", "Subtitles for reels", "Music licensing"];

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const u = await prisma.user.create({ data: { name: "Pim Picked", email: `picked-${Date.now()}@test.local`, role: "INTERNAL", status: "ACTIVE" } });
  pm = await prisma.staffMember.create({ data: { userId: u.id, title: "ACCOUNT_LEAD" } });
  await prisma.client.update({ where: { id: fx.clientB.id }, data: { accountLeadId: null } });
  const p = await prisma.project.create({ data: { clientId: fx.clientB.id, name: "Gap work", type: "CAMPAIGN", status: "ESTIMATING", dueDate: new Date("2026-10-01T12:00:00") } });
  await prisma.estimate.create({ data: { projectId: p.id, status: "DRAFT", totalCredits: 0, unresolvedNeeds: NEEDS.map((description) => ({ description })) } });
});
afterAll(async () => {
  await prisma.priceListItem.deleteMany({ where: { status: "draft", category: "Drafts" } });
  await fx.cleanup();
  await prisma.staffMember.deleteMany({ where: { id: pm.id } });
  await prisma.user.deleteMany({ where: { id: pm.userId } });
});

describe("Admin → To set up", () => {
  it("groups this month's quotes by similar wording; what's asked more than once is a suggested item", async () => {
    const g = await priceListGaps();
    const counts = Object.fromEntries(g.gaps.map((x) => [x.name.toLowerCase(), x.count]));
    expect(g.total).toBeGreaterThanOrEqual(6);
    expect(Object.values(counts)).toEqual(expect.arrayContaining([3, 2]));
    expect(g.repeated.map((x) => x.count).sort()).toEqual(expect.arrayContaining([2, 3]));
  });

  it("'Add N items' makes drafts with blank credits that the estimate agent never offers", async () => {
    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    await expect(addDraftItemsAction(Object.assign(new FormData(), {}) as FormData)).rejects.toThrow(/REDIRECT/);
    const fd = new FormData();
    fd.append("name", "Ad copy variants");
    await expect(addDraftItemsAction(fd)).rejects.toThrow(/REDIRECT:\/ops\/admin\/price-list\?/);
    const d = await prisma.priceListItem.findFirstOrThrow({ where: { deliverableType: "Ad copy variants", status: "draft" } });
    expect([d.creditCost, d.visibleToClients, offerable(d)]).toEqual([null, false, false]);
  });

  it("a client without a PM is on nobody's Today until an admin assigns one (logged)", async () => {
    expect((await clientsWithoutPm()).some((c) => c.id === fx.clientB.id)).toBe(true);
    expect((await loadToday({ mine: false, clientIds: null }, new Date(), pm)).tasks.some((t) => t.clientId === fx.clientB.id)).toBe(false);
    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    const fd = new FormData();
    fd.append("clientId", fx.clientB.id);
    fd.append("staffId", pm.id);
    await expect(assignPmAction(fd)).rejects.toThrow(/REDIRECT/);
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientB.id, action: "Marketing PM assigned" } })).toBe(1);
    const mine = await loadToday({ mine: true, clientIds: [fx.clientB.id] }, new Date(), pm);
    expect(mine.tasks.some((t) => t.clientId === fx.clientB.id)).toBe(true);
  });
});
