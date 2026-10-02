import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";
import { computeBrandHealth, healthLabel, healthTone, BRAND_HEALTH_WEIGHTS } from "@/lib/brand-health";
import { requestAgentBuildAction } from "@/lib/actions/agent-request-actions";

const facts = (o: Partial<Record<keyof typeof BRAND_HEALTH_WEIGHTS, [number, number]>> = {}) => {
  const d = { platform: [0, 8], visual: [0, 9], voice: [0, 4], sources: [0, 6], performance: [0, 3], ...o } as Record<string, [number, number]>;
  return Object.fromEntries(Object.entries(d).map(([k, [done, total]]) => [k, { done, total }])) as Parameters<typeof computeBrandHealth>[0];
};

describe("brand health", () => {
  it("is a weighted sum of the five shares, deterministic", () => {
    expect(Object.values(BRAND_HEALTH_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(computeBrandHealth(facts()).score).toBe(0);
    const full = facts({ platform: [8, 8], visual: [9, 9], voice: [4, 4], sources: [6, 6], performance: [3, 3] });
    expect(computeBrandHealth(full)).toMatchObject({ score: 100, label: "Strong", biggestLift: null });
    // The design's example: 1/8, 5/9, 1/4, 6/6, 1/3.
    const h = computeBrandHealth(facts({ platform: [1, 8], visual: [5, 9], voice: [1, 4], sources: [6, 6], performance: [1, 3] }));
    expect(h.score).toBe(Math.round(35 / 8 + (20 * 5) / 9 + 20 / 4 + 10 + 15 / 3));
    expect(h.biggestLift?.key).toBe("platform");
    expect(h.biggestLift?.points).toBe(31);
    expect(computeBrandHealth(facts({ platform: [1, 8] }))).toEqual(computeBrandHealth(facts({ platform: [1, 8] })));
  });

  it("labels and bar tones follow the thresholds", () => {
    expect([healthLabel(39), healthLabel(40), healthLabel(69), healthLabel(70), healthLabel(84), healthLabel(85)]).toEqual(["Weak", "Fair", "Fair", "Good", "Good", "Strong"]);
    expect([healthTone(0.39), healthTone(0.4), healthTone(0.79), healthTone(0.8)]).toEqual(["orange", "ink", "ink", "lime"]);
  });
});

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
beforeAll(async () => {
  fx = await createSecurityFixtures();
  setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
});
afterAll(async () => fx.cleanup());

describe("agent build requests", () => {
  it("become a project that's sent to Klingit, queued, and opened; asking again opens the same one", async () => {
    const f = new FormData();
    f.set("name", "Seasonal content agent");
    f.set("description", "Drafts seasonal briefs ahead.");
    await expect(requestAgentBuildAction(f)).rejects.toThrow(/REDIRECT:\/projects\//);
    const p = await prisma.project.findFirstOrThrow({ where: { clientId: fx.clientA.id, agentBuild: true }, include: { brief: true } });
    expect(p).toMatchObject({ name: "Seasonal content agent", status: "BRIEFING" });
    expect(p.brief?.status).toBe("SUBMITTED");
    expect(p.queuePosition).toBeGreaterThan(0);
    await expect(requestAgentBuildAction(f)).rejects.toThrow(`REDIRECT:/projects/${p.id}`);
    expect(await prisma.project.count({ where: { clientId: fx.clientA.id, agentBuild: true } })).toBe(1);
  });
});
