import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";

// The brief agent is mocked: these test the studio's own rules, not the model.
const agent = vi.hoisted(() => ({
  smartStart: null as null | { extracted: Record<string, unknown>; suggestedKeyMessage: string | null; suggestedObjective: string | null },
  update: null as null | { updates: { key: string; value: string; items: string[] }[]; reply: string },
}));
vi.mock("@/lib/ai/agents/brief-studio-agent", () => ({
  runSmartStartAgent: vi.fn(async () => (agent.smartStart ? { ok: true, data: agent.smartStart, runId: "r" } : { ok: false, error: "offline" })),
  runBriefUpdateAgent: vi.fn(async () => (agent.update ? { ok: true, data: agent.update, runId: "r" } : { ok: false, error: "offline" })),
}));

import { briefQuality, qualityLabel } from "@/lib/brief-studio/quality";
import { mergeAgentSections, setClientSection, HARD_QUESTION_CEILING, type BriefSection, type StudioQuestion } from "@/lib/brief-studio/model";
import { buildQuestion, nextQuestionKey, plannedKeys, questionsLeft, applyAnswer, type PlannerContext } from "@/lib/brief-studio/planner";
import { parseRequest } from "@/lib/brief-studio/parse";
import { prefill, similarPastProjects, type StudioContext } from "@/lib/brief-studio/studio";
import { answerQuestionAction, editSectionAction, sendBriefAction, sendStudioMessageAction, startBriefAction } from "@/lib/actions/brief-studio-actions";

const NOW = new Date(2026, 9, 2, 10); // Fri 2 Oct 2026
const s = (key: BriefSection["key"], v: Partial<BriefSection> = {}): BriefSection => ({ key, value: "x", source: "answer", editedByClient: false, ...v });
const NO_BRAND = { voice: false, visual: false, linkedSources: 0 };

const ESSENTIALS: BriefSection[] = [
  s("objective", { value: "Drive app installs" }),
  s("deliverables", { value: "", items: ["Stories 9:16"] }),
  s("audience", { value: "Everyday shoppers" }),
  s("keyMessage", { value: "Pay later, shop now." }),
  s("deadline", { value: "2026-10-16" }),
  s("markets", { value: "", items: ["Sweden"] }),
];

const PRICES = [
  { deliverableType: "Social post (static)", complexityTier: "MEDIUM" as const, creditCost: 4, leadTimeDays: 3 },
  { deliverableType: "Social post (static)", complexityTier: "HIGH" as const, creditCost: 7, leadTimeDays: 3 },
];

function ctx(over: Partial<StudioContext> = {}): StudioContext {
  return { brandContext: "", brand: NO_BRAND, personas: [], usps: [], tone: null, prices: PRICES, formatStats: [], pastProjects: [], pastProjectCount: 0, teammates: [], ...over };
}
function planner(over: Partial<PlannerContext> = {}): PlannerContext {
  return { kind: "ads", formatStats: [], usps: [], topAssets: [], pastMarkets: null, estimate: null, earliest: { firstDraft: NOW, final: NOW }, ...over };
}

// ─── briefQuality ──────────────────────────────────────────────────────────

describe("briefQuality: deterministic, every bucket", () => {
  it("is a pure function: the same brief always scores the same", () => {
    const input = { sections: ESSENTIALS, brand: NO_BRAND };
    expect(briefQuality(input)).toEqual(briefQuality(structuredClone(input)));
  });

  it("essentials are worth 50, split over the six of them", () => {
    expect(briefQuality({ sections: [], brand: NO_BRAND }).buckets.essentials).toBe(0);
    const q = briefQuality({ sections: ESSENTIALS, brand: NO_BRAND });
    expect(q.buckets.essentials).toBe(50);
    expect(q.essentialsCovered).toBe(true);
    const missingOne = briefQuality({ sections: ESSENTIALS.filter((x) => x.key !== "markets"), brand: NO_BRAND });
    expect(missingOne.buckets.essentials).toBe(42);
    expect(missingOne.missingEssentials).toEqual(["markets"]);
    expect(missingOne.status).toBe("Needs more · 1 essential missing");
    expect(missingOne.score).toBe(49); // 42 + 12 specificity, held under the Essentials marker
  });

  it("specificity 20: measurable goal 8, named persona 6, key message under 25 words 6", () => {
    const base = briefQuality({ sections: ESSENTIALS, brand: NO_BRAND }).buckets.specificity;
    expect(base).toBe(6 + 6); // "Everyday shoppers" names a segment; the message is short
    const measured = briefQuality({ sections: [...ESSENTIALS, s("successMetric", { value: "Beat 7.4% CTR" })], brand: NO_BRAND });
    expect(measured.buckets.specificity).toBe(20);
    const noKpi = briefQuality({ sections: [...ESSENTIALS, s("successMetric", { value: "No hard KPI" })], brand: NO_BRAND });
    expect(noKpi.buckets.specificity).toBe(12);
    const long = ESSENTIALS.map((x) => (x.key === "keyMessage" ? { ...x, value: Array(30).fill("word").join(" ") } : x));
    expect(briefQuality({ sections: long, brand: NO_BRAND }).buckets.specificity).toBe(6);
    const vague = ESSENTIALS.map((x) => (x.key === "audience" ? { ...x, value: "Everyone" } : x));
    expect(briefQuality({ sections: vague, brand: NO_BRAND }).buckets.specificity).toBe(6);
    const persona = ESSENTIALS.map((x) => (x.key === "audience" ? { ...x, value: "Everyone", sourceRef: { id: "persona", name: "Maja" } } : x));
    expect(briefQuality({ sections: persona, brand: NO_BRAND }).buckets.specificity).toBe(12);
  });

  it("references 10 for a file, link or past asset", () => {
    expect(briefQuality({ sections: ESSENTIALS, brand: NO_BRAND }).buckets.references).toBe(0);
    const withRef = [...ESSENTIALS, s("references", { value: "", refs: [{ kind: "asset", label: "Beach hero" }] })];
    expect(briefQuality({ sections: withRef, brand: NO_BRAND }).buckets.references).toBe(10);
  });

  it("brand fit 10: voice and visual identity, or linked sources; 5 for one of the two", () => {
    expect(briefQuality({ sections: [], brand: { voice: true, visual: true, linkedSources: 0 } }).buckets.brandFit).toBe(10);
    expect(briefQuality({ sections: [], brand: { voice: false, visual: false, linkedSources: 2 } }).buckets.brandFit).toBe(10);
    expect(briefQuality({ sections: [], brand: { voice: true, visual: false, linkedSources: 0 } }).buckets.brandFit).toBe(5);
    expect(briefQuality({ sections: [], brand: NO_BRAND }).buckets.brandFit).toBe(0);
  });

  it("constraints 10: a budget the client set 4, must-haves (or an explicit none) 6", () => {
    expect(briefQuality({ sections: [s("budget", { value: "30", source: "suggested" })], brand: NO_BRAND }).buckets.constraints).toBe(0);
    expect(briefQuality({ sections: [s("budget", { value: "30" })], brand: NO_BRAND }).buckets.constraints).toBe(4);
    expect(briefQuality({ sections: [s("mustHaves", { value: "", items: ["None"] })], brand: NO_BRAND }).buckets.constraints).toBe(6);
  });

  it("labels: under 50 Needs more, 50–79 Good, 80+ Great", () => {
    expect([qualityLabel(49), qualityLabel(50), qualityLabel(79), qualityLabel(80)]).toEqual(["Needs more", "Good", "Good", "Great"]);
  });

  it("'Make it great' offers up to 2 askable suggestions from the lowest buckets, with their points", () => {
    const q = briefQuality({ sections: ESSENTIALS, brand: { voice: true, visual: true, linkedSources: 0 } });
    expect(q.suggestions).toHaveLength(2);
    expect(q.suggestions.map((x) => x.bucket)).toEqual(["references", "constraints"]);
    expect(q.suggestions[0]).toMatchObject({ key: "references", points: 10 });
  });
});

// ─── The question plan ─────────────────────────────────────────────────────

describe("adaptive questions", () => {
  const brandCtx = ctx({ personas: [{ name: "Mobile-first Maja", description: "Everyday smart spenders, 22–34" }], tone: "Anti-bank, human.", brand: { voice: true, visual: true, linkedSources: 0 } });

  it("never asks what Brand OS already knows", () => {
    const sections = prefill(parseRequest("I need new ads for Meta", NOW), null, brandCtx, NOW);
    expect(sections.find((x) => x.key === "audience")).toMatchObject({ source: "brandOS", sourceRef: { name: "Mobile-first Maja" } });
    expect(sections.find((x) => x.key === "tone")?.source).toBe("brandOS");
    const keys = plannedKeys(sections, briefQuality({ sections, brand: brandCtx.brand }).score);
    expect(keys).not.toContain("audience");
    expect(keys).not.toContain("tone");
    // Walk the whole plan: audience never comes up.
    let state = sections;
    const log: StudioQuestion[] = [];
    for (let i = 0; i < 10; i++) {
      const key = nextQuestionKey(state, log, briefQuality({ sections: state, brand: brandCtx.brand }).score);
      if (!key) break;
      expect(key).not.toBe("audience");
      const q = buildQuestion(key, planner(), { now: NOW });
      state = applyAnswer(state, q, { freeText: "something specific" }, planner());
      log.push({ ...q, answeredAt: NOW.toISOString() });
    }
  });

  it("the number of questions depends on what's known", () => {
    const short = prefill(parseRequest("I need new ads for Meta", NOW), null, ctx(), NOW);
    const detailed = prefill(
      parseRequest('Instagram stories and a carousel for Sweden and Denmark, live by 20 Nov. Goal: drive sales. Message: "Pay later, shop the whole drop."', NOW),
      null,
      ctx(),
      NOW
    );
    const score = (x: BriefSection[]) => briefQuality({ sections: x, brand: NO_BRAND }).score;
    const shortLeft = questionsLeft(short, [], score(short));
    const detailedLeft = questionsLeft(detailed, [], score(detailed));
    expect(shortLeft).toBeGreaterThanOrEqual(4);
    expect(detailedLeft).toBeLessThanOrEqual(2);
    expect(detailedLeft).toBeLessThan(shortLeft);
  });

  it("never goes over 8, whatever is still missing", () => {
    const asked: StudioQuestion[] = Array.from({ length: HARD_QUESTION_CEILING }, () => ({ ...buildQuestion("objective", planner(), { now: NOW }), answeredAt: NOW.toISOString() }));
    expect(nextQuestionKey([], asked, 0)).toBeNull();
    expect(questionsLeft([], asked, 0)).toBe(0);
    expect(questionsLeft([], [], 0)).toBeLessThanOrEqual(HARD_QUESTION_CEILING);
  });

  it("stops at a score of 80 even with essentials missing", () => {
    expect(plannedKeys([], 80)).toEqual([]);
  });

  it("'Recommended' only appears with real data", () => {
    const none = buildQuestion("deliverables", planner(), { now: NOW });
    expect(none.recommendedOptionIds).toEqual([]);
    expect(none.reasonPerOption).toEqual({});
    const withData = buildQuestion("deliverables", planner({ formatStats: [{ formatId: "stories", ctr: 7.4, projectName: "Summer social pack" }, { formatId: "carousel", ctr: 5.1, projectName: "Summer social pack" }] }), { now: NOW });
    expect(withData.recommendedOptionIds).toEqual(["stories"]);
    expect(withData.reasonPerOption).toEqual({ stories: "7.4% CTR last time", carousel: "5.1% CTR" });
    // Questions with no data behind them never recommend anything.
    for (const key of ["objective", "audience", "mustHaves"] as const) expect(buildQuestion(key, planner(), { now: NOW }).recommendedOptionIds).toEqual([]);
    expect(buildQuestion("successMetric", planner(), { now: NOW }).options.some((o) => o.id === "beat_ctr")).toBe(false);
  });

  it("every question can be left to Klingit, and isn't asked again", () => {
    const q = buildQuestion("objective", planner(), { now: NOW });
    const sections = applyAnswer([], q, { delegate: true }, planner());
    expect(sections[0]).toMatchObject({ key: "objective", value: "Klingit decides", delegated: true, editedByClient: false });
    expect(plannedKeys(sections, 0)).not.toContain("objective");
  });
});

describe("client edits", () => {
  it("survive agent updates", () => {
    const edited = setClientSection([s("keyMessage", { value: "agent's line", source: "suggested" })], "keyMessage", { value: "My own line" });
    const merged = mergeAgentSections(edited, [s("keyMessage", { value: "A newer agent line", source: "suggested" }), s("objective", { value: "Drive sales", source: "suggested" })]);
    expect(merged.find((x) => x.key === "keyMessage")).toMatchObject({ value: "My own line", source: "answer", editedByClient: true });
    expect(merged.find((x) => x.key === "objective")?.value).toBe("Drive sales");
  });
});

// ─── Against the database ──────────────────────────────────────────────────

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

beforeAll(async () => {
  fx = await createSecurityFixtures();
  // B has a measured Meta campaign that A must never see.
  const bProject = await prisma.project.create({ data: { clientId: fx.clientB.id, name: "B's Meta ads", type: "CAMPAIGN", status: "DELIVERED" } });
  await prisma.asset.create({ data: { projectId: bProject.id, clientId: fx.clientB.id, name: "B hero", format: "Story 9:16", performanceCtr: 9.9 } });
  const aProject = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "A's Meta ads", type: "CAMPAIGN", status: "DELIVERED" } });
  await prisma.asset.create({ data: { projectId: aProject.id, clientId: fx.clientA.id, name: "A hero", format: "Story 9:16", performanceCtr: 4.2 } });
});
afterAll(async () => fx.cleanup());

describe("past projects", () => {
  it("come only from the caller's client", async () => {
    const parsed = parseRequest("new Meta ads", NOW);
    const forA = await similarPastProjects(fx.clientA.id, fx.clientUserA.id, { text: "new Meta ads", parsed });
    expect(forA.map((p) => p.name)).toContain("A's Meta ads");
    expect(forA.map((p) => p.name)).not.toContain("B's Meta ads");
    expect(forA.flatMap((p) => p.measured.map((a) => a.name))).not.toContain("B hero");
  });
});

describe("the studio end to end", () => {
  it("starts a draft, keeps client edits through agent updates, and sends early", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    agent.smartStart = null;
    const { projectId } = await startBriefAction("I need new ads for Meta");
    expect(projectId).toBeTruthy();
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId! }, include: { brief: true } });
    expect(project.status).toBe("DRAFT");
    expect(project.brief?.status).toBe("DRAFT");
    // A's own measured story ad is the recommended format, with its real CTR.
    const log = project.brief!.questionsLog as StudioQuestion[];
    expect(log[0].key).toBe("objective");

    // The client edits the key message; an agent update from a later message doesn't overwrite it.
    await editSectionAction(projectId!, "keyMessage", { value: "Pay later, shop now." });
    await answerQuestionAction(projectId!, log[0].id, { chosen: ["installs"] });
    agent.update = { updates: [{ key: "keyMessage", value: "Something else entirely", items: [] }], reply: "Updated." };
    const after = await sendStudioMessageAction(projectId!, "Actually make it about the holidays");
    const view = after.view!;
    expect(view.sections.find((x) => x.key === "keyMessage")?.value).toBe("Pay later, shop now.");
    expect(view.sections.find((x) => x.key === "objective")).toMatchObject({ value: "Drive app installs", source: "answer" });

    // Send now, well before every question is answered: never blocked.
    await expect(sendBriefAction(projectId!)).rejects.toThrow(`REDIRECT:/projects/${projectId}`);
    const sent = await prisma.project.findUniqueOrThrow({ where: { id: projectId! }, include: { brief: true } });
    expect(sent.status).toBe("ESTIMATING");
    expect(sent.brief?.status).toBe("ACCEPTED");
    expect(sent.brief?.qualityScore).toBeGreaterThan(0);
    expect(sent.brief?.goals).toBe("Drive app installs");
    expect(await prisma.comment.count({ where: { projectId: projectId!, kind: "SYSTEM", body: "Brief sent" } })).toBe(1);
    // A sent brief can't be changed from the studio any more.
    expect((await editSectionAction(projectId!, "objective", { value: "x" })).error).toBeTruthy();
  });

  it("one client can't touch another client's draft", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const { projectId } = await startBriefAction("A deck for investors");
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    expect((await editSectionAction(projectId!, "objective", { value: "hijacked" })).error).toBeTruthy();
    const brief = await prisma.brief.findUniqueOrThrow({ where: { projectId: projectId! } });
    expect(JSON.stringify(brief.sections)).not.toContain("hijacked");
  });
});
