import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { loadToday } from "@/lib/today";
import { markTaskDone } from "@/lib/today-done";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let pm: { id: string; userId: string };
const now = new Date("2026-10-15T09:00:00");
const scope = () => ({ mine: true, clientIds: [fx.clientA.id, fx.clientB.id] });

async function estimating(name: string, createdAt: Date) {
  const p = await prisma.project.create({ data: { clientId: fx.clientA.id, name, type: "CAMPAIGN", status: "ESTIMATING", dueDate: new Date("2026-10-08T12:00:00"), createdAt } });
  const e = await prisma.estimate.create({ data: { projectId: p.id, status: "DRAFT", totalCredits: 20, unresolvedNeeds: [{ description: "Music licensing" }, { description: "Sound design" }] } });
  await prisma.estimateLineItem.create({ data: { estimateId: e.id, deliverable: "Creative concept", detail: "", quantity: 1, credits: 40, hours: 40, needsConfirm: true } });
  return p;
}

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const u = await prisma.user.create({ data: { name: "Tova Today", email: `today-${Date.now()}@test.local`, role: "INTERNAL", status: "ACTIVE" } });
  pm = await prisma.staffMember.create({ data: { userId: u.id, title: "ACCOUNT_LEAD" } });
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { accountLeadId: pm.id } });
  await prisma.client.update({ where: { id: fx.clientB.id }, data: { accountLeadId: null } });
  await estimating("Meta awareness posts", new Date("2026-10-12T12:29:00"));
  await estimating("Meta awareness posts", new Date("2026-10-12T12:37:00"));
  await prisma.project.create({ data: { clientId: fx.clientB.id, name: "Nobody's project", type: "CAMPAIGN", status: "IN_PRODUCTION", dueDate: new Date("2026-09-01T12:00:00") } });
});
afterAll(async () => {
  await prisma.todayDone.deleteMany({ where: { staffId: pm.id } });
  await fx.cleanup();
  await prisma.staffMember.deleteMany({ where: { id: pm.id } });
  await prisma.user.deleteMany({ where: { id: pm.userId } });
});

describe("Today: one row = one decision", () => {
  it("every quote and number line on one estimate (and its duplicate) is one task; the deadline is its due tag", async () => {
    const { tasks } = await loadToday(scope(), now, pm);
    const meta = tasks.filter((t) => t.subject === "Meta awareness posts");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toMatchObject({ kind: "ESTIMATE", section: "now", due: { tone: "late", label: "7 days late" } });
    expect(meta[0].sentence).toBe("Price 4 lines and check 2 before the estimate goes out");
    expect(meta[0].duplicates).toHaveLength(1); // "This brief exists twice"
    expect(tasks.some((t) => t.kind === "DEADLINE" && t.subject === "Meta awareness posts")).toBe(false);
  });

  it("a client with no Marketing PM is on nobody's Today (it's an Admin job)", async () => {
    const { tasks } = await loadToday({ mine: false, clientIds: null }, now, pm);
    expect(tasks.some((t) => t.clientId === fx.clientB.id)).toBe(false);
  });

  it("a ticked task leaves the list and counts as done today; tomorrow it's back if still open", async () => {
    const before = await loadToday(scope(), now, pm);
    const t = before.tasks[0];
    await markTaskDone(pm.id, { key: t.key, label: t.sentence }, "ticked", now);
    const after = await loadToday(scope(), now, pm);
    expect(after.tasks.some((x) => x.key === t.key)).toBe(false);
    expect(after.done.map((d) => d.taskKey)).toEqual([t.key]);
    const tomorrow = await loadToday(scope(), new Date(now.getTime() + 86400000), pm);
    expect(tomorrow.tasks.some((x) => x.key === t.key)).toBe(true);
  });
});
