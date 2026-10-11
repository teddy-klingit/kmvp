import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { loadMyUsage, loadUsage } from "@/lib/usage";
import { GET as exportCsv } from "@/app/api/usage/export/route";
import UsagePage from "@/app/(portal)/settings/usage/page";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let member: { userId: string; name: string };
const sum = (rows: { value: number }[]) => Math.round(rows.reduce((a, r) => a + r.value, 0) * 10) / 10;

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { planTier: "GROWTH", monthlyCreditAllowance: 40 } });
  await prisma.plan.upsert({ where: { tier: "GROWTH" }, update: { monthlyAiCredits: 1500, ownModel: false }, create: { tier: "GROWTH", activeSlots: 3, name: "Growth", monthlyAiCredits: 1500 } });
  const u = await prisma.user.create({ data: { name: "Erik Karlsson", email: `erik-${Date.now()}@test.local`, role: "CLIENT", status: "ACTIVE" } });
  await prisma.clientUser.create({ data: { userId: u.id, clientId: fx.clientA.id, permission: "APPROVER" } });
  member = { userId: u.id, name: u.name };
  const project = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Milk wash series", type: "CAMPAIGN", status: "IN_PRODUCTION" } });
  const now = new Date();
  const usage = (userId: string | null, sourceType: string, sourceName: string, amount: number, projectId: string | null = null) =>
    prisma.aiCreditLedger.create({ data: { clientId: fx.clientA.id, userId, kind: "USAGE", fundedBy: "allowance", sourceType, sourceKey: sourceName.toLowerCase().replace(/ /g, "_"), sourceName, amount: -amount, projectId, createdAt: now } });
  // Eight sources (so some fold into "Other"), two people, one row with nobody attributed.
  for (const [who, type, name, amt] of [
    [fx.userA.id, "skill", "Ad gen", 25],
    [fx.userA.id, "skill", "Ad gen", 25],
    [member.userId, "skill", "Image gen", 20],
    [fx.userA.id, "assistant", "Brief assistant", 6.5],
    [member.userId, "assistant", "Ask your data", 3],
    [fx.userA.id, "skill", "Instagram caption", 4],
    [fx.userA.id, "skill", "LinkedIn post", 4],
    [member.userId, "skill", "Email copy", 6],
    [fx.userA.id, "assistant", "Market ideas", 12],
    [null, "assistant", "Performance insights", 9],
  ] as const)
    await usage(who, type, name, amt, name === "Ad gen" ? project.id : null);
  await prisma.creditLedgerEntry.createMany({
    data: [
      { clientId: fx.clientA.id, projectId: project.id, userId: fx.userA.id, format: "Video", type: "CONSUMPTION", amount: -6, balanceAfter: 34 },
      { clientId: fx.clientA.id, projectId: project.id, userId: member.userId, format: "Story", type: "CONSUMPTION", amount: -4, balanceAfter: 30 },
    ],
  });
});
afterAll(async () => {
  await fx.cleanup();
});

describe("Usage", () => {
  it("every breakdown adds up to the month's total", async () => {
    const u = await loadUsage(fx.clientA.id);
    expect(u.ai.usedThisMonth).toBe(114.5);
    for (const rows of [u.ai.bySource, u.ai.byProject, u.ai.byFormat, u.ai.byPerson]) expect(sum(rows)).toBe(u.ai.usedThisMonth);
    expect(u.ai.totals.skills + u.ai.totals.assistants).toBe(u.ai.usedThisMonth);
    expect(sum(u.ai.perDay.map((d) => ({ value: d.used })))).toBe(u.ai.usedThisMonth);
    // Per person: the members' rows plus the unattributed row are the whole month.
    expect(u.ai.byPerson.find((r) => r.label === "Not attributed")?.value).toBe(9);
    expect(u.members.reduce((a, m) => a + m.ai, 0) + 9).toBe(u.ai.usedThisMonth);
    expect(sum(u.team.byPerson)).toBe(u.team.usedThisMonth);
    expect(u.team.usedThisMonth).toBe(10);
  });

  it("forecasts from the average a day so far", async () => {
    const u = await loadUsage(fx.clientA.id);
    expect(u.ai.average).toBe(Math.round(114.5 / u.period.today));
    expect(u.ai.projected).toBe(Math.round(114.5 + Math.round((114.5 / u.period.today) * (u.period.daysInMonth - u.period.today))));
  });

  it("members get only their own usage, enforced on the server", async () => {
    const mine = await loadMyUsage(fx.clientA.id, member.userId);
    expect([mine.ai, mine.team]).toEqual([29, 4]);
    setMockSession({ user: { id: member.userId, role: "CLIENT" } });
    expect((await exportCsv()).status).toBe(404);
    // The page hands a member the My usage view (an async component), never the admin one.
    const el = (await UsagePage()) as unknown as { type: (p: unknown) => Promise<React.ReactElement>; props: unknown };
    expect(el.type.name).toBe("MyUsage");
    const html = renderToStaticMarkup(await el.type(el.props));
    expect(html).toContain("Your AI credits");
    expect(html).not.toContain(fx.userA.name);
    expect(html).not.toContain("Where AI credits go");

    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const csv = await (await exportCsv()).text();
    expect(csv.split("\n")).toHaveLength(1 + 2 + 10 + 1); // header + team rows + AI usage rows + the month's allowance
  });
});
