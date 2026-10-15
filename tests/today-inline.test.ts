import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { saveEstimate, sendEstimate } from "@/lib/estimate-ops";
import { mergeDuplicateBriefs } from "@/lib/duplicate-briefs";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let viewer: { id: string; userId: string; user: { name: string } };
let keep: string;
let copy: string;
let itemId: string;

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const staff = await prisma.staffMember.findFirstOrThrow({ where: { userId: fx.adminUser.id }, include: { user: true } });
  viewer = { id: staff.id, userId: staff.userId, user: { name: staff.user.name } };
  itemId = (await prisma.priceListItem.findFirstOrThrow({ where: { status: "estimate", archivedAt: null } })).id;
  const mk = async (createdAt: Date) => {
    const p = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Meta awareness posts", type: "CAMPAIGN", status: "ESTIMATING", createdAt } });
    const e = await prisma.estimate.create({ data: { projectId: p.id, status: "DRAFT", totalCredits: 0, unresolvedNeeds: [{ description: "Music licensing" }] } });
    await prisma.estimateLineItem.create({ data: { estimateId: e.id, deliverable: "Image retouching", detail: "", quantity: 1, credits: 0, hours: 0, priceListItemId: itemId, needsConfirm: true } });
    return p.id;
  };
  keep = await mk(new Date("2026-10-12T12:29:00"));
  copy = await mk(new Date("2026-10-12T12:37:00"));
  await prisma.clientCalendarItem.create({ data: { clientId: fx.clientA.id, title: "Add 1 Instagram Reel/week", date: new Date("2026-11-09"), channel: "Instagram", maker: "klingit_help", projectId: copy } });
});
afterAll(async () => {
  await fx.cleanup();
});

describe("Today's inline estimate editor", () => {
  it("can't send while a Check or Quote line has no number; sends once every line has one", async () => {
    const line = { kind: "price", priceListItemId: itemId, quantity: 12, detail: "Gift guide shots" };
    await saveEstimate(viewer, keep, { lines: [{ ...line, credits: null, confirmed: false }], resolutions: [], reason: "" });
    expect((await sendEstimate(viewer, keep)).error).toMatch(/needs your number|needs a PM quote/);
    await saveEstimate(viewer, keep, { lines: [{ ...line, credits: 24, confirmed: true }], resolutions: [], reason: "" });
    expect((await sendEstimate(viewer, keep)).error).toMatch(/PM quote/); // the music licensing quote is still open
    await saveEstimate(viewer, keep, { lines: [{ ...line, credits: 24, confirmed: true }], resolutions: [{ index: 0, kind: "priced", credits: 8 }], reason: "" });
    expect(await sendEstimate(viewer, keep)).toMatchObject({ ok: expect.stringContaining("sent") });
    expect((await prisma.estimate.findUniqueOrThrow({ where: { projectId: keep } })).status).toBe("SENT");
    expect(await prisma.decisionLog.count({ where: { projectId: keep, area: "estimate", action: { startsWith: "Sent estimate" } } })).toBe(1);
  });

  it("sending merges the duplicate brief: the copy and its plan item are archived, never deleted, and logged", async () => {
    expect(await mergeDuplicateBriefs(viewer.userId, keep, [copy])).toBe(1);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: copy } })).status).toBe("ARCHIVED");
    expect((await prisma.clientCalendarItem.findFirstOrThrow({ where: { projectId: copy } })).archivedAt).not.toBeNull();
    expect(await prisma.decisionLog.count({ where: { projectId: { in: [keep, copy] }, action: { contains: "uplicate" } } })).toBe(2);
  });
});
