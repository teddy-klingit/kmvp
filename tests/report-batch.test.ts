import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// The Batch API is faked: create returns an id; the batch has ended; one result with real-looking usage.
const fake = vi.hoisted(() => ({ requests: [] as { custom_id: string }[] }));
vi.mock("@/lib/ai/client", () => ({
  anthropic: {
    messages: {
      batches: {
        create: async (b: { requests: { custom_id: string }[] }) => ((fake.requests = b.requests), { id: "msgbatch_test_1" }),
        retrieve: async () => ({ processing_status: "ended" }),
        results: async () =>
          (async function* () {
            for (const r of fake.requests) yield { custom_id: r.custom_id, result: { type: "succeeded", message: { content: [{ type: "text", text: JSON.stringify({ takeaways: [{ title: "Beach hero won the week", detail: "2.1% CTR" }] }) }], usage: { input_tokens: 10000, output_tokens: 1000 } } } };
          })(),
      },
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { collectReportBatches, submitReportBatch } from "@/lib/ai/batch";
import { lastClosed } from "@/lib/report-data";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const now = new Date("2026-10-15T09:00:00");

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const period = lastClosed("WEEKLY", now);
  await prisma.contentPost.create({ data: { clientId: fx.clientA.id, title: "Beach hero", platform: "Instagram", channelType: "ORGANIC", status: "PUBLISHED", publishedDate: new Date(period.start.getTime() + 86400000), engagementRate: 4.2, impressions: 1200 } });
  await prisma.agent.upsert({ where: { key: "performance_agent" }, update: {}, create: { key: "performance_agent", name: "Performance agent", category: "PRODUCTION", description: "Writes reports" } });
});
afterAll(async () => {
  await prisma.aiBatchJob.deleteMany({ where: { batchId: "msgbatch_test_1" } });
  await fx.cleanup();
});

describe("scheduled reports through the Batch API", () => {
  it("sends due reports once, then saves them and logs the run at half price", async () => {
    const due = [{ clientId: fx.clientA.id, period: lastClosed("WEEKLY", now) }];
    expect(await submitReportBatch(due)).toBe(1);
    expect(await submitReportBatch(due)).toBe(0); // already waiting in a batch
    expect(await collectReportBatches()).toBe(1);
    const report = await prisma.generatedReport.findFirstOrThrow({ where: { clientId: fx.clientA.id, kind: "WEEKLY" } });
    expect((report.takeaways as { title: string }[])[0].title).toBe("Beach hero won the week");
    const run = await prisma.agentRun.findFirstOrThrow({ where: { clientId: fx.clientA.id, decision: { contains: "batch" } } });
    // Sonnet: (10,000 × $3 + 1,000 × $15) / 1M = $0.045, halved by the batch discount.
    expect(run.costUsd).toBeCloseTo(0.0225);
    expect((await prisma.aiBatchJob.findUniqueOrThrow({ where: { batchId: "msgbatch_test_1" } })).status).toBe("done");
  });
});
