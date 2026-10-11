import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";
import { computeBrandHealth, healthLabel, healthTone, BRAND_HEALTH_WEIGHTS } from "@/lib/brand-health";
import { approveSkillTestAction, requestSkillBuildAction } from "@/lib/actions/skill-request-actions";
import { runSelfServiceAgentAction } from "@/lib/actions/self-service-agent-actions";
import { listSkillBuilds, listSkills, templateSkillKey } from "@/lib/skills";
import type { AgentBuild } from "@/lib/agent-build";

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
afterAll(async () => {
  await prisma.agent.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
});

describe("custom skill requests", () => {
  it("become a project that's sent to Klingit, queued, and opened under Skills; asking again opens the same one", async () => {
    const f = new FormData();
    f.set("name", "Seasonal content planner");
    f.set("description", "Drafts seasonal briefs ahead.");
    await expect(requestSkillBuildAction(f)).rejects.toThrow(/REDIRECT:\/skills\/build\//);
    const p = await prisma.project.findFirstOrThrow({ where: { clientId: fx.clientA.id, agentBuild: true }, include: { brief: true } });
    expect(p).toMatchObject({ name: "Seasonal content planner", status: "BRIEFING" });
    expect(p.brief?.status).toBe("SUBMITTED");
    expect(p.queuePosition).toBeGreaterThan(0);
    await expect(requestSkillBuildAction(f)).rejects.toThrow(`REDIRECT:/skills/build/${p.id}`);
    expect(await prisma.project.count({ where: { clientId: fx.clientA.id, agentBuild: true } })).toBe(1);
  });

  it("show Klingit's open question, and once the last test is approved the skill is the client's to run", async () => {
    const p = await prisma.project.findFirstOrThrow({ where: { clientId: fx.clientA.id, agentBuild: true }, include: { brief: true } });
    const build: AgentBuild = { step: "Testing", dates: { Testing: "2026-10-14" }, spec: { whatItDoes: "Plans a season", whatItUses: "Brand OS", whatYouGet: "A plan", runs: "On demand" }, testOutput: null, buildCredits: 24, perRunCredits: 6 };
    await prisma.brief.update({ where: { id: p.brief!.id }, data: { agentDrafts: { agentBuild: build } } });
    await prisma.comment.create({ data: { projectId: p.id, authorUserId: fx.adminUser.id, body: "English only, or English and Swedish?" } });
    expect((await listSkillBuilds(fx.clientA.id)).map((b) => [b.name, b.question])).toEqual([["Seasonal content planner", "English only, or English and Swedish?"]]);

    const f = new FormData();
    f.set("projectId", p.id);
    await approveSkillTestAction(f);
    expect(await listSkillBuilds(fx.clientA.id)).toEqual([]);
    const mine = (await listSkills(fx.clientA.id)).filter((s) => s.custom);
    expect(mine.map((s) => [s.name, s.live, s.aiPerRun])).toEqual([["Seasonal content planner", true, 6]]);
    // Another client never sees it.
    expect((await listSkills(fx.clientB.id)).some((s) => s.name === "Seasonal content planner")).toBe(false);
  });

  it("a skill run is blocked when no AI credits are left, with Top up", async () => {
    const skill = await prisma.agent.findFirstOrThrow({ where: { clientId: fx.clientA.id, kind: "SKILL" } });
    await prisma.client.update({ where: { id: fx.clientA.id }, data: { planTier: "STARTER" } });
    await prisma.plan.upsert({ where: { tier: "STARTER" }, update: { monthlyAiCredits: 0, ownModel: false }, create: { tier: "STARTER", activeSlots: 1, name: "Starter", monthlyAiCredits: 0 } });
    const f = new FormData();
    f.set("agentId", skill.id);
    f.set("input", "Autumn");
    expect(await runSelfServiceAgentAction({}, f)).toMatchObject({ topUp: true });
    await prisma.plan.update({ where: { tier: "STARTER" }, data: { monthlyAiCredits: 500 } });
  });
});

describe("templates", () => {
  it("say which skill they run with", () => {
    expect(templateSkillKey({ name: "Story ad · 9:16", category: "Display" })).toBe("ad_gen");
    expect(templateSkillKey({ name: "Carousel · 4 cards", category: "Social" })).toBe("ad_gen");
    expect(templateSkillKey({ name: "Social post · 1:1", category: "Social" })).toBe("image_gen_agent");
    expect(templateSkillKey({ name: "Launch email", category: "Copy" })).toBe("email_copy_agent");
    expect(templateSkillKey({ name: "Product page hero", category: "Web" })).toBe("landing_page_copy_agent");
    expect(templateSkillKey({ name: "Creator brief", category: "Briefs" })).toBe("brief_generator_agent");
  });
});
