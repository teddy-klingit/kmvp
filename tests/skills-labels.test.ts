import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { listSkills } from "@/lib/skills";
import { askKlingitAction } from "@/lib/actions/skills-actions";
import { runSkillVersionsAction } from "@/lib/actions/self-service-agent-actions";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

describe("skills by goal, with a label", () => {
  it("clients see self-service, Klingit-run and their own skills, never internal ones or assistants", async () => {
    const skills = await listSkills(fx.clientA.id);
    const keys = skills.map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(["carousel_builder", "video_cutdowns", "localisation", "performance_deep_dive"]));
    expect(keys).not.toContain("rule_check");
    expect(keys).not.toContain("brief_agent");
    expect(skills.find((s) => s.key === "video_cutdowns")).toMatchObject({ availability: "klingit_run", goal: "make_ad", teamCredits: 3 });
    expect(skills.find((s) => s.key === "carousel_builder")).toMatchObject({ availability: "self_service", goal: "make_ad", aiPerRun: 30 });
    expect(new Set(skills.map((s) => s.goal))).toEqual(new Set(["make_ad", "write_copy", "plan_brief"]));
  });

  it("a skill Klingit runs can't be run by the client; they ask Klingit instead", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const cutdowns = await prisma.agent.findUniqueOrThrow({ where: { key: "video_cutdowns" } });
    const f = new FormData();
    f.set("agentId", cutdowns.id);
    f.set("say", "cut the brand film");
    expect(await runSkillVersionsAction({}, f)).toEqual({ error: "This skill isn't one you can run yourself." });
  });

  it("Ask Klingit makes a request for the PM with the skill's team-credit estimate, once", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const cutdowns = await prisma.agent.findUniqueOrThrow({ where: { key: "video_cutdowns" } });
    const f = new FormData();
    f.set("skillId", cutdowns.id);
    f.set("text", "6s and 15s cuts of the brand film for TikTok");
    const first = await askKlingitAction({}, f);
    const second = await askKlingitAction({}, f);
    expect(first.projectId).toBeTruthy();
    expect(second.projectId).toBe(first.projectId);
    const p = await prisma.project.findUniqueOrThrow({ where: { id: first.projectId! }, include: { brief: true } });
    expect(p).toMatchObject({ clientId: fx.clientA.id, status: "BRIEFING", creditsQuoted: 3 });
    expect(p.brief?.rawIntake).toContain("Video cutdowns");
  });
});
