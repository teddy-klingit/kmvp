import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { loadOutputLibrary } from "@/lib/output-library";
import { GET as download } from "@/app/api/library/download/route";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const ids: Record<string, string> = {};

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const project = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Summer push", type: "CAMPAIGN", status: "DELIVERED" } });
  const make = async (name: string, format: string, ctr: number | null, status: "APPROVED" | "DELIVERED" | "IN_REVIEW" = "DELIVERED") => {
    const a = await prisma.asset.create({ data: { projectId: project.id, clientId: fx.clientA.id, name, format, platform: "Instagram", performanceCtr: ctr, status, sentVersion: 1, type: "IMAGE" } });
    ids[name] = a.id;
  };
  // Five measured stories (a group big enough to rank), two measured squares (too few), one with no data.
  for (const [n, ctr] of [["Story A", 7.4], ["Story B", 3.1], ["Story C", 2.9], ["Story D", 2.8], ["Story E", 1.1]] as const) await make(n, "Story 9:16", ctr);
  await make("Square A", "Square 1:1", 9.9);
  await make("Square B", "Square 1:1", 0.2);
  await make("Fresh", "Feed 4:5", null);
  await make("Still in review", "Story 9:16", 5, "IN_REVIEW");
  const skill = await prisma.agent.upsert({ where: { key: "test_lib_skill" }, update: {}, create: { key: "test_lib_skill", name: "Caption skill", kind: "SKILL", category: "PRODUCTION", description: "x" } });
  ids.output = (await prisma.skillOutput.create({ data: { clientId: fx.clientA.id, agentId: skill.id, title: "Caption set", format: "Caption", channel: "Instagram", text: "Hello" } })).id;
  ids.otherOutput = (await prisma.skillOutput.create({ data: { clientId: fx.clientB.id, title: "B's output", text: "secret" } })).id;
});
afterAll(async () => {
  await prisma.agent.deleteMany({ where: { key: "test_lib_skill" } });
  await fx.cleanup();
});

describe("Output library", () => {
  it("holds produced work only: delivered files and skill outputs, never work still in review", async () => {
    const lib = await loadOutputLibrary(fx.clientA.id);
    const titles = lib.items.map((i) => i.title);
    expect(titles).toContain("Caption set");
    expect(titles).not.toContain("Still in review");
    expect(titles).not.toContain("B's output");
    expect(lib.summary).toEqual({ total: 9, byKlingit: 8, bySkills: 1 });
  });

  it("badges only from real numbers: quartiles within format and channel, 4+ to rank, no data no badge", async () => {
    const lib = await loadOutputLibrary(fx.clientA.id);
    const badge = (t: string) => lib.items.find((i) => i.title === t)!.badge;
    expect(badge("Story A")).toBe("Top performer");
    expect(badge("Story E")).toBe("Below average");
    expect(badge("Story C")).toBeNull();
    // Two squares can't be ranked against each other.
    expect([badge("Square A"), badge("Square B")]).toEqual([null, null]);
    expect(badge("Fresh")).toBe("New");
    expect(badge("Caption set")).toBe("Made with a skill");
    // Best performing puts the top performer first.
    expect(lib.items[0].title).toBe("Story A");
  });

  it("filters by format, made by and search", async () => {
    expect((await loadOutputLibrary(fx.clientA.id, { format: "Square 1:1" })).items.map((i) => i.title).sort()).toEqual(["Square A", "Square B"]);
    expect((await loadOutputLibrary(fx.clientA.id, { made: "skills" })).items.map((i) => i.title)).toEqual(["Caption set"]);
    expect((await loadOutputLibrary(fx.clientA.id, { q: "fresh" })).items.map((i) => i.title)).toEqual(["Fresh"]);
  });

  it("Download selected zips only the client's own outputs", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const res = await download(new Request(`http://x/api/library/download?ids=a_${ids["Story A"]},s_${ids.output},s_${ids.otherOutput}`));
    expect(res.status).toBe(200);
    const zip = Buffer.from(await res.arrayBuffer()).toString("latin1");
    expect(zip.startsWith("PK")).toBe(true);
    expect(zip).toContain("Hello");
    expect(zip).not.toContain("secret");
  });
});
