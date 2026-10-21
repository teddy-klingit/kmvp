import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const scan = vi.hoisted(() => ({ output: null as unknown, prompts: [] as string[] }));
vi.mock("@/lib/ai/run-agent", () => ({
  runAgentTask: vi.fn(async (args: { agentKey: string; prompt: string }) => {
    scan.prompts.push(args.prompt);
    return args.agentKey === "opportunity_scan" ? { ok: true, data: scan.output, prompt: args.prompt } : { ok: false, error: "no model in tests" };
  }),
}));

import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { linkInsights, upsertInsight } from "@/lib/insight-records";
import { dismissOpportunity, opportunityFacts, runOpportunityScan } from "@/lib/opportunities";
import { isExcluded, opportunityPrefs, setMinDataDays } from "@/lib/opportunity-learning";
import { clearOpportunityRuleAction } from "@/lib/actions/ops-opportunity-actions";

/** Phase W step 7: "Not for us" changes what's suggested next, and the PM sees why. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const DAY = 86400000;

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

async function opp(title: string) {
  const o = await prisma.opportunity.create({ data: { clientId: fx.clientA.id, title, summary: "s" } });
  const i = await upsertInsight(fx.clientA.id, { key: `l:${title}`, kind: "data", title, value: "1", sources: ["Meta"] });
  await linkInsights(fx.clientA.id, o.id, [i.id]);
  return o;
}
const route = { name: "R", description: "d", formats: ["Post"], channels: ["Instagram"], sampleLine: "soft." };

describe("simple rules first", () => {
  it("Budget is fixed: for 60 days only €0-spend suggestions, logged", async () => {
    const o = await opp("Boost the gift guide");
    const now = new Date();
    await dismissOpportunity(fx.clientA.id, fx.userA.id, o.id, "Budget is fixed");
    const p = await opportunityPrefs(fx.clientA.id);
    expect(Math.round((p.budgetFixedUntil!.getTime() - now.getTime()) / DAY)).toBe(60);
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, action: { startsWith: "Not for us: “Boost the gift guide” (Budget is fixed). Until" } } })).toBe(1);

    await prisma.marketSignal.create({ data: { clientId: fx.clientA.id, type: "TREND", title: "Refills are up", summary: "y", publishedAt: new Date() } });
    const fact = (await opportunityFacts(fx.clientA.id)).find((f) => f.text.startsWith("Refills are up"))!;
    scan.output = { opportunities: [] };
    await runOpportunityScan(fx.clientA.id, { origin: "weekly" });
    expect(scan.prompts.at(-1)).toContain("THE BUDGET IS FIXED: only suggest options with no extra paid spend");
    expect(fact).toBeTruthy();
  });

  it("Off-brand: the topic goes on the exclude list, and the scan drops a suggestion about it", async () => {
    const o = await opp("Discount countdown for Black Friday");
    await dismissOpportunity(fx.clientA.id, fx.userA.id, o.id, "Off-brand");
    expect((await opportunityPrefs(fx.clientA.id)).excludeTopics.map((t) => t.topic)).toEqual(["Discount countdown for Black Friday"]);
    expect(isExcluded("A Black Friday discount countdown, 48h", (await opportunityPrefs(fx.clientA.id)).excludeTopics)).toBe(true);
    expect(isExcluded("Refill rituals on TikTok", (await opportunityPrefs(fx.clientA.id)).excludeTopics)).toBe(false);

    const fact = (await opportunityFacts(fx.clientA.id)).find((f) => f.text.startsWith("Refills are up"))!;
    scan.output = {
      opportunities: [
        { title: "Black Friday discount countdown", summary: "A countdown to the discount.", whyNow: "w", evidenceIds: [fact.id], windowStart: "", windowEnd: "", routes: [route, route] },
        { title: "Refill rituals", summary: "Show the refill.", whyNow: "w", evidenceIds: [fact.id], windowStart: "", windowEnd: "", routes: [route, route] },
      ],
    };
    expect(await runOpportunityScan(fx.clientA.id, { origin: "weekly" })).toEqual({ created: 1, error: null });
    expect(scan.prompts.at(-1)).toContain("NEVER SUGGEST (the client said off-brand): Discount countdown for Black Friday");
    expect(await prisma.opportunity.count({ where: { clientId: fx.clientA.id, title: "Black Friday discount countdown" } })).toBe(0);
  });

  it("Don't trust the data: the PM is told, and more data checks for 60 days", async () => {
    const o = await opp("Shift budget to Stories");
    await dismissOpportunity(fx.clientA.id, fx.userA.id, o.id, "Don't trust the data");
    expect((await opportunityPrefs(fx.clientA.id)).moreChecksUntil).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, action: { contains: "(Don't trust the data). Until" } } })).toBe(1);
  });

  it("a learned rule: a source too new can't carry a suggestion", async () => {
    await upsertInsight(fx.clientA.id, { key: "l:pin", kind: "data", title: "Pins are saved a lot", value: "+40%", sources: ["Pinterest"], origin: "staff" });
    expect((await opportunityFacts(fx.clientA.id)).some((f) => f.text.startsWith("Pins are saved"))).toBe(true);
    await setMinDataDays(fx.clientA.id, fx.adminUser.id, "Pinterest", 90);
    scan.output = { opportunities: [] };
    await runOpportunityScan(fx.clientA.id, { origin: "weekly" });
    expect(scan.prompts.at(-1)).not.toContain("Pins are saved");
  });

  it("staff can take a rule off, logged; a client can't", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const f = new FormData();
    for (const [k, v] of Object.entries({ clientId: fx.clientA.id, rule: "topic", value: "Discount countdown for Black Friday" })) f.set(k, v);
    await expect(clearOpportunityRuleAction(f)).rejects.toThrow();
    expect((await opportunityPrefs(fx.clientA.id)).excludeTopics).toHaveLength(1);
    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    await clearOpportunityRuleAction(f);
    expect((await opportunityPrefs(fx.clientA.id)).excludeTopics).toHaveLength(0);
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, action: "Took off “Discount countdown for Black Friday” from the exclude list" } })).toBe(1);
  });
});
