import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { loadPmThread, markPmRead, pmUnread, replyTime, sendPmMessage, type ThreadMessage } from "@/lib/pm-thread";
import { loadToday } from "@/lib/today";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let pm: { id: string; userId: string; name: string };
let projectId: string;
let clientUser: { id: string; userId: string; name: string };

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const u = await prisma.user.create({ data: { name: "Tess PM", email: `tess-${Date.now()}@test.local`, role: "INTERNAL", status: "ACTIVE" } });
  const s = await prisma.staffMember.create({ data: { userId: u.id, title: "ACCOUNT_LEAD" } });
  pm = { id: s.id, userId: u.id, name: u.name };
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { accountLeadId: s.id } });
  projectId = (await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Brand film", type: "MOTION_VIDEO", status: "IN_PRODUCTION" } })).id;
  const cu = await prisma.clientUser.findFirstOrThrow({ where: { userId: fx.userA.id }, include: { user: true } });
  clientUser = { id: cu.id, userId: cu.userId, name: cu.user.name };
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.staffMember.deleteMany({ where: { id: pm.id } });
  await prisma.user.deleteMany({ where: { id: pm.userId } });
});

describe("Message your PM", () => {
  it("a general message is one thread per client; a message about a project is that project's Comment, shown in both", async () => {
    await sendPmMessage({ clientId: fx.clientA.id, author: { userId: clientUser.userId, clientUserId: clientUser.id, name: clientUser.name }, body: "Can we talk about the Stockholm pop-up?" });
    await sendPmMessage({ clientId: fx.clientA.id, author: { userId: clientUser.userId, clientUserId: clientUser.id, name: clientUser.name }, body: "Saw the cut-downs!", projectId });
    expect(await prisma.clientMessage.count({ where: { clientId: fx.clientA.id } })).toBe(1);
    expect(await prisma.comment.count({ where: { projectId, kind: "MESSAGE", body: "Saw the cut-downs!" } })).toBe(1);
    const t = await loadPmThread(fx.clientA.id, clientUser.userId);
    expect(t.map((m) => [m.source, m.project?.name ?? null, m.mine])).toEqual([
      ["general", null, true],
      ["project", "Brand film", true],
    ]);
    expect(await prisma.notification.count({ where: { userId: pm.userId, clientId: fx.clientA.id } })).toBe(2);
  });

  it("the rest of a project's Discussion (the team, the client's colleagues) stays in the project", async () => {
    await prisma.comment.create({ data: { projectId, authorClientUserId: clientUser.id, body: "Could the end card be bigger?" } });
    const t = await loadPmThread(fx.clientA.id, clientUser.userId);
    expect(t.some((m) => m.body === "Could the end card be bigger?")).toBe(false);
  });

  it("a message about another client's project is refused", async () => {
    const other = await prisma.project.create({ data: { clientId: fx.clientB.id, name: "Theirs", type: "CAMPAIGN", status: "IN_PRODUCTION" } });
    await expect(sendPmMessage({ clientId: fx.clientA.id, author: { userId: clientUser.userId, clientUserId: clientUser.id, name: clientUser.name }, body: "x", projectId: other.id })).rejects.toThrow();
  });

  it("the client's Internal channel never shows in the thread", async () => {
    await prisma.clientInternalMessage.create({ data: { projectId, clientId: fx.clientA.id, authorClientUserId: clientUser.id, body: "Between us: the budget is tight" } });
    expect((await loadPmThread(fx.clientA.id, pm.userId)).some((m) => m.body.includes("Between us"))).toBe(false);
  });

  it("an unanswered general message is 'Reply to …' on the PM's Today; a reply clears it", async () => {
    const t1 = await loadToday({ mine: true, clientIds: [fx.clientA.id] }, new Date(), pm);
    expect(t1.tasks.find((t) => t.key === `MESSAGE:general:${fx.clientA.id}`)?.sentence).toBe(`Reply to ${clientUser.name}`);
    expect(await pmUnread(fx.clientA.id, pm.userId, "staff")).toBeGreaterThan(0);
    await sendPmMessage({ clientId: fx.clientA.id, author: { userId: pm.userId, clientUserId: null, name: pm.name }, body: "Love it. Thursday?" });
    const t2 = await loadToday({ mine: true, clientIds: [fx.clientA.id] }, new Date(), pm);
    expect(t2.tasks.some((t) => t.key === `MESSAGE:general:${fx.clientA.id}`)).toBe(false);
    expect(await pmUnread(fx.clientA.id, clientUser.userId, "client")).toBe(1);
    await markPmRead(fx.clientA.id, clientUser.userId);
    expect(await pmUnread(fx.clientA.id, clientUser.userId, "client")).toBe(0);
  });

  it("'usually replies within …' needs at least 5 replies, and uses the median", () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 1) + h * 3600000).toISOString();
    const m = (h: number, k: boolean): ThreadMessage => ({ id: String(h), source: "general", project: null, body: "", attachments: [], authorName: k ? "PM" : "C", fromKlingit: k, mine: false, createdAt: at(h) });
    const pairs = (n: number) => Array.from({ length: n }, (_, i) => [m(i * 10, false), m(i * 10 + 2, true)]).flat();
    expect(replyTime(pairs(4), new Date(Date.UTC(2026, 9, 5)))).toBeNull();
    expect(replyTime(pairs(5), new Date(Date.UTC(2026, 9, 5)))).toBe("within 2 hours");
  });
});
