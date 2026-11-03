import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { latestBatchMeta, loadBatch } from "@/lib/skill-run";

/** A skill page shows a batch only by its id, and only the signed-in user's own runs of that skill. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const made: string[] = [];

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await prisma.agentRun.deleteMany({ where: { agentId: { in: made } } });
  await prisma.agent.deleteMany({ where: { id: { in: made } } });
  await fx.cleanup();
});

const run = (agentId: string, clientId: string, userId: string, batchId: string, version: string, at: Date) =>
  prisma.agentRun.create({ data: { agentId, clientId, requestedByUserId: userId, status: "SUCCESS", createdAt: at, input: { batchId, version, startedAt: at.toISOString(), settings: { format: "Story 9:16", channel: null, product: null, say: "hi", startFrom: "blank", versions: 2, projectId: null } }, output: { headline: `v${version}` } } });

describe("skill batches", () => {
  it("loads a batch by id, the latest is only offered as a link, and nobody else's batch loads", async () => {
    const k = Date.now();
    const agent = await prisma.agent.create({ data: { key: `t-ad-${k}`, name: "Ad gen (test)", description: "t", category: "FOUNDATION", kind: "SKILL" } });
    const other = await prisma.agent.create({ data: { key: `t-other-${k}`, name: "Other (test)", description: "t", category: "FOUNDATION", kind: "SKILL" } });
    made.push(agent.id, other.id);
    const t = (h: number) => new Date(Date.now() - h * 3600000);
    await run(agent.id, fx.clientA.id, fx.userA.id, "old-batch", "A", t(5));
    await run(agent.id, fx.clientA.id, fx.userA.id, "new-batch", "A", t(1));
    await run(agent.id, fx.clientA.id, fx.userA.id, "new-batch", "B", t(1));
    await run(agent.id, fx.clientB.id, fx.userB.id, "b-batch", "A", t(0));
    await run(other.id, fx.clientA.id, fx.userA.id, "other-skill", "A", t(0));

    expect((await latestBatchMeta(fx.clientA.id, fx.userA.id, agent))?.batchId).toBe("new-batch");
    expect((await loadBatch(fx.clientA.id, fx.userA.id, agent, "new-batch"))?.versions.map((v) => v.letter)).toEqual(["A", "B"]);
    expect((await loadBatch(fx.clientA.id, fx.userA.id, agent, "old-batch"))?.versions).toHaveLength(1);
    expect(await loadBatch(fx.clientA.id, fx.userA.id, agent, "b-batch")).toBeNull();
    expect(await loadBatch(fx.clientA.id, fx.userA.id, agent, "other-skill")).toBeNull();
  });
});
