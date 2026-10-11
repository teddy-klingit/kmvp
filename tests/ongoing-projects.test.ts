import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// The Brief assistant is offline here: the studio still creates the draft from the text.
vi.mock("@/lib/ai/agents/brief-studio-agent", () => ({
  runSmartStartAgent: vi.fn(async () => ({ ok: false, error: "offline" })),
  runBriefUpdateAgent: vi.fn(async () => ({ ok: false, error: "offline" })),
  runTaskAgent: vi.fn(async () => ({ ok: false, error: "offline" })),
}));

import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { slotUsage } from "@/lib/active-slots";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { planTier: "GROWTH" } });
  await prisma.plan.upsert({ where: { tier: "GROWTH" }, update: { activeSlots: 3 }, create: { tier: "GROWTH", activeSlots: 3 } });
  setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
});
afterAll(async () => {
  await fx.cleanup();
});

describe("active slots", () => {
  it("count only the Active column: a project in review with the client frees its slot", async () => {
    const make = (name: string, status: "IN_PRODUCTION" | "AWAITING_REVIEW") => prisma.project.create({ data: { clientId: fx.clientA.id, name, type: "CAMPAIGN", status, activatedAt: new Date() } });
    await make("Producing one", "IN_PRODUCTION");
    await make("Producing two", "IN_PRODUCTION");
    const review = await make("With the client", "AWAITING_REVIEW");
    // A review round with assets waiting on the client: it's in the In review column, not Active.
    const a = await prisma.asset.create({ data: { projectId: review.id, clientId: fx.clientA.id, name: "Story", format: "Story 9:16", sentVersion: 1, status: "IN_REVIEW" } });
    await prisma.assetVersion.create({ data: { assetId: a.id, projectId: review.id, number: 1, state: "SENT_TO_CLIENT" } });
    expect(await slotUsage(fx.clientA.id)).toEqual({ total: 3, used: 2, free: 1 });
  });
});

describe("Brief studio: /brief/new?q=… started twice", () => {
  it("reopens the same draft on a reload instead of creating another", async () => {
    const { startBriefAction } = await import("@/lib/actions/brief-studio-actions");
    const a = await startBriefAction("A teaser for the refill pouch on Instagram");
    const b = await startBriefAction("A teaser for the refill pouch on Instagram");
    expect(a.projectId).toBeTruthy();
    expect(b.projectId).toBe(a.projectId);
  });
});
