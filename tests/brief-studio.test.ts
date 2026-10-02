import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";

// The brief agent is mocked: these test the studio's own rules, not the model.
const agent = vi.hoisted(() => ({
  smartStart: null as null | Record<string, unknown>,
  update: null as null | { updates: { key: string; value: string; items: string[] }[]; reply: string },
}));
vi.mock("@/lib/ai/agents/brief-studio-agent", () => ({
  runSmartStartAgent: vi.fn(async () => (agent.smartStart ? { ok: true, data: agent.smartStart, runId: "r" } : { ok: false, error: "offline" })),
  runBriefUpdateAgent: vi.fn(async () => (agent.update ? { ok: true, data: agent.update, runId: "r" } : { ok: false, error: "offline" })),
  runTaskAgent: vi.fn(async () => ({ ok: false, error: "offline" })),
}));

import { briefQuality, qualityLabel, ESSENTIAL_POINTS } from "@/lib/brief-studio/quality";
import { mergeAgentSections, setClientSection, HARD_QUESTION_CEILING, type BriefSection, type StudioQuestion } from "@/lib/brief-studio/model";
import { applyAnswer, buildQuestion, closingQuestion, nextStep, plannedParts, questionsLeft, type PlannerContext } from "@/lib/brief-studio/planner";
import { estimatePreview } from "@/lib/brief-studio/formats";
import { parseRequest } from "@/lib/brief-studio/parse";
import { prefill, similarPastProjects, taskSentence, type StudioContext } from "@/lib/brief-studio/studio";
import { answerQuestionAction, editSectionAction, sendBriefAction, sendStudioMessageAction, setBasicsAction, startBriefAction } from "@/lib/actions/brief-studio-actions";

const NOW = new Date(2026, 9, 2, 10); // Fri 2 Oct 2026
const NO_BRAND = { voice: false, visual: false, linkedSources: 0 };
const s = (key: BriefSection["key"], value: string, data: Record<string, unknown> = {}, extra: Partial<BriefSection> = {}): BriefSection => ({ key, value, data: data as never, source: "answer", editedByClient: false, ...extra });

/** Every essential, fully there. */
const ESSENTIALS: BriefSection[] = [
  s("deliverables", "3 ideas × Stories 9:16 for Meta", { channels: ["Meta"], formats: ["Stories 9:16"], ideasCount: 3 }),
  s("whyNow", "A seasonal moment", { reason: "A seasonal moment" }),
  s("objective", "App installs. Success = lower cost per install.", { goal: "App installs", metric: "lower cost per install" }),
  s("audience", "Maja, shops on mobile. Thinks it is only for big purchases.", { personaName: "Maja", description: "shops on mobile", barrier: "Think it is only for big purchases" }),
  s("keyMessage", "Everyday buys, your way.", { text: "Everyday buys, your way." }),
  s("proofOffer", "Pay in 3 with no fees.", { text: "Pay in 3 with no fees.", needsLegalLine: true }),
  s("cta", "Install the app · App Store and Google Play", { action: "Install the app", destination: "App Store and Google Play" }),
  s("material", "We have product shots", { clientProvides: "We have product shots" }),
  s("deadline", "2026-10-16", { iso: "2026-10-16" }),
  { key: "markets", value: "", items: ["Sweden"], data: { names: ["Sweden"] }, source: "answer", editedByClient: false },
];

const PRICES = [
  { deliverableType: "Social post (static)", complexityTier: "MEDIUM" as const, creditCost: 4, leadTimeDays: 3 },
  { deliverableType: "Social post (static)", complexityTier: "HIGH" as const, creditCost: 7, leadTimeDays: 3 },
  { deliverableType: "Video cutdown (<30s)", complexityTier: "MEDIUM" as const, creditCost: 9, leadTimeDays: 5 },
  { deliverableType: "Video cutdown (<30s)", complexityTier: "HIGH" as const, creditCost: 15, leadTimeDays: 5 },
];

function ctx(over: Partial<StudioContext> = {}): StudioContext {
  return { brandName: "Klarna", website: "klarna.com", brandContext: "", brand: NO_BRAND, personas: [], usps: [], tone: null, prices: PRICES, formatStats: [], pastProjects: [], pastProjectCount: 0, comments: [], teammates: [], ...over };
}
function planner(over: Partial<PlannerContext> = {}): PlannerContext {
  return { kind: "ads", brandName: "Klarna", formatStats: [], pastChannels: null, personas: [], keyMessageOptions: [], barrierOptions: [], proofOptions: [], compareTo: null, website: "klarna.com", ...over };
}
const answered = (q: StudioQuestion): StudioQuestion => ({ ...q, answeredAt: NOW.toISOString() });

// ─── Slot scoring ──────────────────────────────────────────────────────────

describe("brief quality: points per filled slot", () => {
  it("the 9 essentials make 50, and are deterministic", () => {
    expect(Object.values(ESSENTIAL_POINTS).reduce((a, b) => a + b, 0)).toBe(50);
    const q = briefQuality({ sections: ESSENTIALS, brand: NO_BRAND });
    expect(q).toMatchObject({ essentialsCovered: true, essentialsDone: 9, score: 55, label: "Good" });
    expect(q).toEqual(briefQuality({ sections: structuredClone(ESSENTIALS), brand: NO_BRAND }));
    expect(q.detail).toBe("All 9 essentials covered · 1 of 10 nice-to-haves");
  });

  it("each essential is worth its points; partial slots get part of them; under 50 until all are in", () => {
    for (const key of Object.keys(ESSENTIAL_POINTS)) {
      const without = ESSENTIALS.filter((x) => x.key !== key && !(key === "deadline" && x.key === "markets"));
      const q = briefQuality({ sections: without, brand: NO_BRAND });
      expect(q.essentials[key as keyof typeof ESSENTIAL_POINTS]).toBe(0);
      expect(q.missingEssentials).toContain(key);
      expect(q.score).toBeLessThanOrEqual(49);
    }
    // Channels without formats: half of "what's being made".
    const half = ESSENTIALS.map((x) => (x.key === "deliverables" ? s("deliverables", "for Meta", { channels: ["Meta"], formats: [] }) : x));
    expect(briefQuality({ sections: half, brand: NO_BRAND }).essentials.deliverables).toBe(4);
    // A goal without a metric, a persona without what holds them back: partial.
    const partial = ESSENTIALS.map((x) => (x.key === "objective" ? s("objective", "App installs.", { goal: "App installs", metric: null }) : x.key === "audience" ? s("audience", "Maja.", { personaName: "Maja", barrier: null }) : x));
    const pq = briefQuality({ sections: partial, brand: NO_BRAND });
    expect([pq.essentials.objective, pq.essentials.audience]).toEqual([4, 4]);
  });

  it("each nice-to-have adds 5, and Great starts at 80", () => {
    const nice = [
      ...ESSENTIALS,
      s("tone", "Anti-bank.", { text: "Anti-bank." }),
      { key: "references", value: "", refs: [{ kind: "link", label: "x" }], source: "answer", editedByClient: false } as BriefSection,
      { key: "competitorExamples", value: "", items: ["An ad"], source: "answer", editedByClient: false } as BriefSection,
      { key: "mustInclude", value: "", items: ["Logo"], source: "answer", editedByClient: false } as BriefSection,
      { key: "mustAvoid", value: "", items: ["Stock photos"], source: "answer", editedByClient: false } as BriefSection,
      s("approver", "Elin", { name: "Elin" }),
    ];
    const q = briefQuality({ sections: nice, brand: NO_BRAND });
    expect(q.niceDone).toBe(7); // the 6 above + the legal check on the proof
    expect(q.score).toBe(85);
    expect(q.label).toBe("Great");
    expect(q.status).toBe("Great · a designer can start from this");
    expect([qualityLabel(49), qualityLabel(50), qualityLabel(79), qualityLabel(80)]).toEqual(["Needs more", "Good", "Good", "Great"]);
  });
});

// ─── Inference and skipping ────────────────────────────────────────────────

describe("question engine: inference and skipping", () => {
  const brandCtx = ctx({ personas: [{ name: "Mobile-first Maja", description: "Everyday smart spenders, 22–34" }], tone: "Anti-bank, human.", brand: { voice: true, visual: true, linkedSources: 0 } });

  it("never asks for Basics: deadline, markets and languages", () => {
    // Even with nothing in Basics at all.
    const sections = prefill(parseRequest("I need new ads", NOW), null, ctx(), NOW).filter((x) => x.key !== "markets" && x.key !== "deadline");
    const p = planner();
    let state = sections;
    const log: StudioQuestion[] = [];
    for (let i = 0; i < 12; i++) {
      const step = nextStep(state, log, p);
      if (!step || step === "closing") break;
      const q = buildQuestion(step, state, p, { now: NOW });
      expect(["deadline", "markets", "languages"]).not.toContain(q.key);
      state = applyAnswer(state, q, { freeText: "something specific" }, p);
      log.push(answered(q));
    }
    expect(log.length).toBeGreaterThan(5);
  });

  it("asks the channel first when the request doesn't name one, recommending the last similar project's", () => {
    const sections = prefill(parseRequest("I need new ads", NOW), null, ctx(), NOW);
    const p = planner({ pastChannels: { channels: ["Meta", "TikTok"], projectName: "Summer social pack" } });
    expect(nextStep(sections, [], p)).toBe("channels");
    const q = buildQuestion("channels", sections, p, { now: NOW });
    expect(q.options.map((o) => o.group)).toContain("Offline");
    expect(q.recommendedOptionIds).toEqual(["Meta", "TikTok"]);
    expect(q.reasonPerOption.Meta).toBe("Used in Summer social pack");
    // Formats only after the channel, filtered to it.
    const after = applyAnswer(sections, q, { chosen: ["TikTok"] }, p);
    const formats = buildQuestion("formats", after, p, { now: NOW });
    expect(formats.options.map((o) => o.label)).toEqual(["TikTok in-feed", "Spark ads"]);
  });

  it("skips the channel when the request names it", () => {
    const sections = prefill(parseRequest("I need new ads for Meta", NOW), null, ctx(), NOW);
    expect(plannedParts(sections, planner())).not.toContain("channels");
    expect(plannedParts(sections, planner())[0]).toBe("formats");
  });

  it("shows one Brand OS persona without asking, and confirms when there are several", () => {
    const one = prefill(parseRequest("I need new ads for Meta", NOW), null, brandCtx, NOW);
    expect(one.find((x) => x.key === "audience")).toMatchObject({ source: "brandOS" });
    expect(plannedParts(one, planner({ personas: brandCtx.personas }))).not.toContain("persona");
    expect(plannedParts(one, planner({ personas: brandCtx.personas }))).toContain("barrier");
    const twoCtx = ctx({ personas: [...brandCtx.personas, { name: "Busy Ben", description: "Parents, 35–44" }] });
    const two = prefill(parseRequest("I need new ads for Meta", NOW), null, twoCtx, NOW);
    const p = planner({ personas: twoCtx.personas });
    expect(plannedParts(two, p)).toContain("persona");
    const q = buildQuestion("persona", two, p, { now: NOW });
    expect(q.type).toBe("confirm");
    expect(q.question).toBe("I'm assuming Mobile-first Maja, right?");
  });

  it("shows a certain inference with its tag, and turns a guess into a confirm question", () => {
    // App installs: the call to action is the app stores, shown and not asked.
    const installs = prefill(parseRequest("New Meta ads to drive app installs", NOW), null, ctx(), NOW);
    expect(installs.find((x) => x.key === "cta")).toMatchObject({ source: "suggested", confident: true, value: "Install the app · App Store and Google Play" });
    expect(plannedParts(installs, planner())).not.toContain("cta");
    // Sales: "Shop now" on the website is a guess, so it's confirmed.
    const sales = prefill(parseRequest("New Meta ads to drive sales", NOW), null, ctx(), NOW);
    expect(sales.find((x) => x.key === "cta")).toMatchObject({ source: "suggested", value: "Shop now · klarna.com" });
    const q = buildQuestion("cta", sales, planner(), { now: NOW });
    expect(q.type).toBe("confirm");
    expect(q.question).toBe("I'm assuming “Shop now · klarna.com”, right?");
    const confirmed = applyAnswer(sales, q, { chosen: ["yes"] }, planner());
    expect(confirmed.find((x) => x.key === "cta")).toMatchObject({ source: "answer", value: "Shop now · klarna.com" });
    expect(plannedParts(confirmed, planner())).not.toContain("cta");
  });

  it("the key message offers the agent's single-minded options; barriers are recommended only with real data", () => {
    const sections = prefill(parseRequest("I need new ads for Meta", NOW), null, brandCtx, NOW);
    const km = buildQuestion("keyMessage", sections, planner({ keyMessageOptions: ["Everyday buys, your way.", "Pay later, no fees.", "One app for every store."] }), { now: NOW });
    expect(km.options).toHaveLength(3);
    const noData = buildQuestion("barrier", sections, planner({ barrierOptions: [{ label: "Think it is only for big purchases", reason: null }, { label: "Worry about debt", reason: null }] }), { now: NOW });
    expect(noData.recommendedOptionIds).toEqual([]);
    const withData = buildQuestion("barrier", sections, planner({ barrierOptions: [{ label: "Think it is only for big purchases", reason: "seen in your Instagram comments" }, { label: "Worry about debt", reason: null }] }), { now: NOW });
    expect(withData.recommendedOptionIds).toEqual(["think_it_is_only_for_big_purchases"]);
    expect(withData.question).toBe("What do people get wrong about Klarna today?");
  });

  it("the count adapts to what's known, never goes over 8, then the closing question", () => {
    const short = prefill(parseRequest("I need new ads", NOW), null, ctx(), NOW);
    const detailed = prefill(parseRequest('Meta stories for our Black Friday sale to drive sales, "Pay later, shop the whole drop." Install the app.', NOW), null, ctx(), NOW);
    expect(questionsLeft(short, [], planner())).toBe(HARD_QUESTION_CEILING);
    expect(questionsLeft(detailed, [], planner())).toBeLessThan(questionsLeft(short, [], planner()));
    const eight = Array.from({ length: HARD_QUESTION_CEILING }, () => answered(buildQuestion("whyNow", short, planner(), { now: NOW })));
    expect(nextStep(short, eight, planner())).toBe("closing");
    const done = [...eight, { ...answered(closingQuestion(NOW)), chosen: ["done"] }];
    expect(nextStep(short, done, planner())).toBeNull();
  });

  it("material moves the estimate", () => {
    const d = { formats: ["Stories 9:16", "TikTok in-feed"], ideasCount: 3 };
    const own = estimatePreview(d, PRICES, { clientProvides: "We have product shots" })!;
    const made = estimatePreview(d, PRICES, { klingitMakes: "Klingit creates the visuals" })!;
    const shoot = estimatePreview(d, PRICES, { klingitMakes: "We need a shoot", needsShoot: true })!;
    expect(made.low).toBeGreaterThan(own.low);
    expect(shoot.unpriced).toContain("Shoot");
  });
});

describe("client edits", () => {
  it("survive agent updates", () => {
    const edited = setClientSection([s("keyMessage", "agent's line", {}, { source: "suggested" })], "keyMessage", { value: "My own line" });
    const merged = mergeAgentSections(edited, [s("keyMessage", "A newer agent line", {}, { source: "suggested" }), s("whyNow", "A launch", {}, { source: "suggested" })]);
    expect(merged.find((x) => x.key === "keyMessage")).toMatchObject({ value: "My own line", source: "answer", editedByClient: true });
    expect(merged.find((x) => x.key === "whyNow")?.value).toBe("A launch");
  });
});

describe("the task", () => {
  it("is one sentence with what, for whom, the goal and the idea", () => {
    const sections = ESSENTIALS.map((x) => (x.key === "deliverables" ? s("deliverables", "", { channels: ["Meta", "TikTok"], formats: ["Stories 9:16", "TikTok in-feed"], ideasCount: 3 }) : x));
    expect(taskSentence(sections, "ads")).toBe("6 ads for Meta and TikTok in Sweden that move Maja to app installs, around “Everyday buys, your way”.");
  });
});

// ─── Against the database ──────────────────────────────────────────────────

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.brandOS.update({ where: { clientId: fx.clientA.id }, data: { audiencePersonas: [{ name: "Mobile-first Maja", description: "Everyday smart spenders, 22–34" }], usps: ["Pay in 3, no fees", "One app for every store"] } });
  // B has a measured Meta campaign that A must never see.
  const bProject = await prisma.project.create({ data: { clientId: fx.clientB.id, name: "B's Meta ads", type: "CAMPAIGN", status: "DELIVERED" } });
  await prisma.asset.create({ data: { projectId: bProject.id, clientId: fx.clientB.id, name: "B hero", format: "Story 9:16", platform: "Instagram", performanceCtr: 9.9 } });
  const aProject = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "A's Meta ads", type: "CAMPAIGN", status: "DELIVERED" } });
  await prisma.asset.create({ data: { projectId: aProject.id, clientId: fx.clientA.id, name: "A hero", format: "Story 9:16", platform: "Instagram", performanceCtr: 4.2 } });
});
afterAll(async () => fx.cleanup());

describe("past projects", () => {
  it("come only from the caller's client", async () => {
    const parsed = parseRequest("new Meta ads", NOW);
    const forA = await similarPastProjects(fx.clientA.id, fx.clientUserA.id, { text: "new Meta ads", parsed });
    expect(forA.map((p) => p.name)).toContain("A's Meta ads");
    expect(forA.map((p) => p.name)).not.toContain("B's Meta ads");
    expect(forA.flatMap((p) => p.measured.map((a) => a.name))).not.toContain("B hero");
    expect(forA.find((p) => p.name === "A's Meta ads")?.channels).toEqual(["Meta"]);
  });
});

describe("the studio end to end", () => {
  it("a full run-through for “I need new ads”: The task, the closing question, Ready to send", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    agent.smartStart = null;
    const { projectId } = await startBriefAction("I need new ads");
    let view = (await setBasicsAction(projectId!, { markets: ["Sweden", "Norway"] })).view!;
    const pick: Record<string, (q: StudioQuestion) => string[] | null> = {
      channels: (q) => q.options.filter((o) => o.id === "Meta" || o.id === "TikTok").map((o) => o.id),
      formats: (q) => q.options.filter((o) => o.label === "Stories 9:16" || o.label === "TikTok in-feed").map((o) => o.id),
      material: () => ["client"],
    };
    for (let i = 0; i < 12 && view.active && view.active.type !== "closing"; i++) {
      const q = view.active;
      const chosen = pick[q.part]?.(q) ?? (q.options[0] ? [q.options[0].id] : null);
      view = (await answerQuestionAction(projectId!, q.id, chosen ? { chosen } : { freeText: "Q4 push before Black Friday" })).view!;
      // Basics are never asked.
      expect(["deadline", "markets", "languages"]).not.toContain(view.active?.key);
    }
    expect(view.active?.type).toBe("closing");
    expect(view.quality.missingEssentials).toEqual([]);
    expect(view.quality.essentialsCovered).toBe(true);
    expect(view.readyToSend).toBe(true);
    const task = view.sections.find((x) => x.key === "task")!;
    expect(task.source).toBe("suggested");
    expect(task.value).toMatch(/^6 ads for Meta and TikTok in Sweden and Norway/);
    expect((task.data as { meta: string }).meta).toMatch(/3 ideas × Stories 9:16 and TikTok in-feed · Swedish and Norwegian · first draft/);
    expect(view.sections.find((x) => x.key === "languages")?.items).toEqual(["Swedish", "Norwegian"]);
    // The closing message points to The task, and never calls it great under 80.
    expect(view.messages[view.messages.length - 2].text).toContain("**The task**");
    if (view.quality.score < 80) expect(view.messages.map((m) => m.text).join(" ")).not.toContain("great brief");

    // A closing chip opens its follow-up; then "No, that is everything".
    view = (await answerQuestionAction(projectId!, view.active!.id, { chosen: ["approver"] })).view!;
    expect(view.active?.key).toBe("approver");
    view = (await answerQuestionAction(projectId!, view.active!.id, { freeText: "Elin Berg, 2 rounds" })).view!;
    expect(view.sections.find((x) => x.key === "feedbackRounds")?.value).toBe("2 rounds of feedback");
    expect(view.active?.type).toBe("closing");
    view = (await answerQuestionAction(projectId!, view.active!.id, { chosen: ["done"] })).view!;
    expect(view.active).toBeNull();

    // Sending: The task becomes the project's summary.
    await expect(sendBriefAction(projectId!)).rejects.toThrow(`REDIRECT:/projects/${projectId}`);
    const sent = await prisma.brief.findUniqueOrThrow({ where: { projectId: projectId! } });
    expect(sent.aiSummary).toBe(task.value);
  });

  it("keeps client edits through agent updates, and sends early", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const { projectId } = await startBriefAction("I need new ads for Meta");
    await editSectionAction(projectId!, "keyMessage", { value: "Pay later, shop now." });
    agent.update = { updates: [{ key: "keyMessage", value: "Something else entirely", items: [] }], reply: "Updated." };
    let view = (await editSectionAction(projectId!, "notes", { value: "" })).view!;
    // Get past the open questions, so the next message goes to the agent.
    for (let i = 0; i < 12 && view.active; i++) view = (await answerQuestionAction(projectId!, view.active.id, view.active.type === "closing" ? { chosen: ["done"] } : { delegate: true })).view!;
    view = (await sendStudioMessageAction(projectId!, "Actually make it about the holidays")).view!;
    expect(view.sections.find((x) => x.key === "keyMessage")?.value).toBe("Pay later, shop now.");
    await expect(sendBriefAction(projectId!)).rejects.toThrow(`REDIRECT:/projects/${projectId}`);
    const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId! }, include: { brief: true } });
    expect(p.status).toBe("ESTIMATING");
    expect(p.brief?.status).toBe("ACCEPTED");
    expect((await editSectionAction(projectId!, "whyNow", { value: "x" })).error).toBeTruthy();
  });

  it("one client can't touch another client's draft", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const { projectId } = await startBriefAction("A deck for investors");
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    expect((await editSectionAction(projectId!, "whyNow", { value: "hijacked" })).error).toBeTruthy();
    const brief = await prisma.brief.findUniqueOrThrow({ where: { projectId: projectId! } });
    expect(JSON.stringify(brief.sections)).not.toContain("hijacked");
  });
});
