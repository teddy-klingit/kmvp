import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { creditSummary } from "@/lib/client-home";
import { loadNavSummary } from "@/lib/nav-summary";
import { loadUsage } from "@/lib/usage";
import { teamAllowance } from "@/lib/ai-credits";
import { setTeamCreditsOverrideAction } from "@/lib/actions/ops-client-admin-actions";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let growth: number;

/** What every client screen says this client gets a month. */
async function everywhere() {
  return {
    summary: (await creditSummary(fx.clientA.id)).allowance,
    menu: (await loadNavSummary({ id: fx.clientUserA.id, clientId: fx.clientA.id })).team.allowance,
    usage: (await loadUsage(fx.clientA.id)).team.allowance,
  };
}

beforeAll(async () => {
  fx = await createSecurityFixtures();
  growth = (await prisma.plan.findUniqueOrThrow({ where: { tier: "GROWTH" } })).monthlyTeamCredits;
  // A stale copy on the client that nothing may read any more.
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { planTier: "GROWTH", monthlyCreditAllowance: 7, teamCreditsOverride: null } });
});
afterAll(async () => {
  await prisma.plan.update({ where: { tier: "GROWTH" }, data: { monthlyTeamCredits: growth } });
  await prisma.auditLog.deleteMany({ where: { clientId: fx.clientA.id } });
  await fx.cleanup();
});

describe("team credits: the Plan table is the one source", () => {
  it("every screen shows the plan's value, never the client's stale copy", async () => {
    const v = growth;
    expect(await everywhere()).toEqual({ summary: v, menu: v, usage: v });
  });

  it("editing the plan changes every screen", async () => {
    await prisma.plan.update({ where: { tier: "GROWTH" }, data: { monthlyTeamCredits: growth + 4 } });
    try {
      const v = growth + 4;
      expect(await everywhere()).toEqual({ summary: v, menu: v, usage: v });
    } finally {
      await prisma.plan.update({ where: { tier: "GROWTH" }, data: { monthlyTeamCredits: growth } });
    }
  });

  it("no screen reads the client's old copy or a hard-coded plan number", () => {
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : /\.tsx?$/.test(f) && files.push(path.join(d, f))));
    walk(path.join(process.cwd(), "src/app"));
    walk(path.join(process.cwd(), "src/components"));
    walk(path.join(process.cwd(), "src/lib"));
    const readers = files.filter((f) => !/generated|demo|actions/.test(f) && /monthlyCreditAllowance/.test(readFileSync(f, "utf8")));
    expect(readers.map((f) => path.relative(process.cwd(), f))).toEqual([]);
    // Plan numbers live in the Plan table: no page keeps its own list of plan credits or prices.
    const lists = files.filter((f) => /credits:\s*(16|40|80|160)\b/.test(readFileSync(f, "utf8")) && !/demo/.test(f));
    expect(lists.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it("a staff override wins everywhere, is logged, and clears back to the plan", async () => {
    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    const form = (override: string) => {
      const f = new FormData();
      f.set("clientId", fx.clientA.id);
      f.set("override", override);
      return f;
    };
    await setTeamCreditsOverrideAction(form("25"));
    expect(await teamAllowance(fx.clientA.id)).toMatchObject({ value: 25, planValue: growth, source: "override" });
    expect(await everywhere()).toEqual({ summary: 25, menu: 25, usage: 25 });

    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    await setTeamCreditsOverrideAction(form(""));
    expect(await teamAllowance(fx.clientA.id)).toMatchObject({ value: growth, source: "plan" });
    const log = await prisma.auditLog.findMany({ where: { clientId: fx.clientA.id, area: "team-credits" }, orderBy: { createdAt: "asc" } });
    expect(log.map((l) => [(l.before as { override: number | null }).override, (l.after as { override: number | null }).override])).toEqual([
      [null, 25],
      [25, null],
    ]);
    expect(log.every((l) => l.actorUserId === fx.adminUser.id)).toBe(true);
  });

  it("a creator can't set an override", async () => {
    setMockSession({ user: { id: fx.creatorUser.id, role: "INTERNAL" } });
    await expect(setTeamCreditsOverrideAction((() => { const f = new FormData(); f.set("clientId", fx.clientA.id); f.set("override", "99"); return f; })())).rejects.toThrow();
    expect((await teamAllowance(fx.clientA.id)).value).toBe(growth);
  });
});
