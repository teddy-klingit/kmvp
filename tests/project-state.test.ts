import { describe, it, expect } from "vitest";
import {
  getProjectState,
  attentionBucket,
  boardColumnFor,
  addBusinessDays,
  type ProjectStateInput,
} from "@/lib/project-state";

const NOW = new Date("2026-10-01T10:00:00Z"); // a Thursday
const day = (n: number) => new Date(NOW.getTime() + n * 86400000);

function input(overrides: Partial<ProjectStateInput> = {}): ProjectStateInput {
  return {
    id: "p1",
    status: "BRIEFING",
    pausedFromStatus: null,
    dueDate: null,
    deliveredAt: null,
    creditsQuoted: null,
    brief: null,
    fixedQuestions: [],
    estimate: null,
    team: null,
    assets: [],
    pipelineStages: [],
    ...overrides,
  };
}

const dynamicBrief = (answeredKeys: string[] = []): NonNullable<ProjectStateInput["brief"]> => ({
  status: "DRAFT",
  rawIntake: "sales presentation with 10 slides",
  pendingQuestions: [
    { key: "audience", question: "Who will see this deck?", quickAnswers: ["Investors", "Customers"] },
    { key: "deadline", question: "When do you need it?", quickAnswers: ["This week", "Next week"] },
  ],
  transcript: answeredKeys.map((key) => ({ key, question: "q", answer: "a" })),
  gapsFlagged: [],
  goals: "sales presentation with 10 slides",
  targetAudience: null,
  successMetrics: null,
  references: null,
  acceptedAt: null,
});

const confirmedTeam = (confirmedAt: Date) => ({
  confirmed: true,
  confirmedAt,
  members: [{ name: "Sara N.", role: "Art director" }],
});

const state = (o: Partial<ProjectStateInput>) => getProjectState(input(o), NOW);

describe("getProjectState — one test per stage", () => {
  it("briefing: the brief agent is waiting on the client", () => {
    const s = state({ status: "DRAFT", brief: dynamicBrief(["deadline"]) });
    expect(s.stage).toBe("briefing");
    expect(s.ballInCourt).toBe("client");
    expect(s.nextAction.label).toBe("Your turn: answer 1 question about the audience");
    expect(s.nextAction.description).toBe("Who will see this deck?");
    expect(s.brief).toMatchObject({ mode: "dynamic", next: { key: "audience" } });
  });

  it("briefing: no brief written yet", () => {
    expect(state({ status: "DRAFT" }).nextAction.label).toBe("Your turn: tell us what you need");
  });

  it("briefing: complete draft waits for the client to start it", () => {
    const s = state({ status: "DRAFT", brief: dynamicBrief(["audience", "deadline"]) });
    expect(s.ballInCourt).toBe("client");
    expect(s.nextAction.cta).toBe("Start project");
  });

  it("briefing: submitted brief is Klingit's turn", () => {
    const s = state({ status: "BRIEFING", brief: { ...dynamicBrief(["audience", "deadline"]), status: "SUBMITTED" } });
    expect(s.ballInCourt).toBe("klingit");
    expect(s.nextAction.label).toBe("Klingit: reviewing your brief");
  });

  it("briefing: gaps flagged by the account lead are the client's turn", () => {
    const s = state({
      status: "BRIEFING",
      brief: {
        ...dynamicBrief(["audience", "deadline"]),
        status: "GAPS_FLAGGED",
        gapsFlagged: ["Missing success metrics on Autumn campaign brief"],
      },
    });
    expect(s.ballInCourt).toBe("client");
    expect(s.nextAction.label).toBe("Your turn: add 1 missing detail");
    expect(s.nextAction.description).toBe("Missing success metrics on Autumn campaign brief");
  });

  it("briefing: fixed-question briefs ask the next unanswered question", () => {
    const s = state({
      status: "BRIEFING",
      brief: { ...dynamicBrief(), rawIntake: null, pendingQuestions: [], goals: "Refresh the brand" },
      fixedQuestions: [
        { key: "goals", question: "What do you need?", presets: [], placeholder: "" },
        { key: "targetAudience", question: "Who's this for?", presets: ["Gen Z"], placeholder: "" },
      ],
    });
    expect(s.nextAction.label).toBe("Your turn: answer 1 question about the audience");
    expect(s.brief).toMatchObject({ mode: "fixed", next: { key: "targetAudience", quickAnswers: ["Gen Z"] } });
  });

  it("estimating: no estimate yet is Klingit's turn — even with leftover agent questions on an accepted brief", () => {
    const s = state({ status: "ESTIMATING", brief: { ...dynamicBrief(), status: "ACCEPTED" } });
    expect(s.stage).toBe("estimating");
    expect(s.ballInCourt).toBe("klingit");
    expect(s.nextAction.label).toBe("Klingit: preparing your estimate");
  });

  it("estimating: an unsent DRAFT estimate is not shown to the client as awaiting approval", () => {
    const s = state({
      status: "ESTIMATING",
      estimate: { status: "DRAFT", totalCredits: 12, sentAt: null, expiresAt: null, respondedAt: null },
    });
    expect(s.stage).toBe("estimating");
    expect(s.keyFacts.credits).toBeUndefined();
  });

  it("awaiting_approval: a sent estimate is the client's turn, with credits and its expiry", () => {
    const s = state({
      status: "ESTIMATING",
      estimate: { status: "SENT", totalCredits: 28, sentAt: day(-1), expiresAt: day(3), respondedAt: null },
    });
    expect(s.stage).toBe("awaiting_approval");
    expect(s.ballInCourt).toBe("client");
    expect(s.nextAction.label).toBe("Your turn: approve estimate (28 credits)");
    expect(s.nextAction.dueAt).toEqual(day(3));
    expect(s.keyFacts.credits).toBe(28);
  });

  it("staffing: Klingit's turn, no ETA until the team is confirmed", () => {
    const s = state({ status: "STAFFING", estimate: { status: "APPROVED", totalCredits: 28, sentAt: day(-3), expiresAt: day(1), respondedAt: day(-1) } });
    expect(s.stage).toBe("staffing");
    expect(s.ballInCourt).toBe("klingit");
    expect(s.keyFacts.firstDraftEta).toBeUndefined();
    expect(s.keyFacts.staffedTeam).toEqual([]);
    expect(s.nextAction.description).toContain("within 2 business days");
  });

  it("production: first draft due 2 business days after staffing was confirmed", () => {
    const s = state({ status: "IN_PRODUCTION", team: confirmedTeam(NOW) });
    expect(s.stage).toBe("production");
    expect(s.keyFacts.firstDraftEta?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(s.nextAction.description).toBe("First draft by Mon 5 Oct.");
    expect(s.keyFacts.staffedTeam).toEqual([{ name: "Sara N.", role: "Art director" }]);
  });

  it("production: QA is still production to the client", () => {
    expect(state({ status: "QA" }).stage).toBe("production");
  });

  it("review: assets awaiting review are the client's turn", () => {
    const s = state({ status: "AWAITING_REVIEW", assets: [{ status: "IN_REVIEW" }, { status: "IN_REVIEW" }, { status: "APPROVED" }] });
    expect(s.stage).toBe("review");
    expect(s.ballInCourt).toBe("client");
    expect(s.assetsAwaitingReview).toBe(2);
    expect(s.nextAction.label).toBe("Your turn: review 2 assets");
  });

  it("review: once every asset has a decision and changes were asked, it's Klingit's turn", () => {
    const s = state({ status: "AWAITING_REVIEW", assets: [{ status: "CHANGES_REQUESTED" }, { status: "APPROVED" }] });
    expect(s.ballInCourt).toBe("klingit");
    expect(s.assetsAwaitingReview).toBe(0);
    expect(s.nextAction.label).toBe("Klingit: revising 1 asset");
  });

  it("final: everything approved → the client signs off", () => {
    const s = state({ status: "IN_FEEDBACK", assets: [{ status: "APPROVED" }] });
    expect(s.stage).toBe("final");
    expect(s.ballInCourt).toBe("client");
    expect(s.nextAction.cta).toBe("Sign off");
  });

  it("final: open change requests mean Klingit is still applying feedback", () => {
    expect(state({ status: "IN_FEEDBACK", assets: [{ status: "CHANGES_REQUESTED" }] }).ballInCourt).toBe("klingit");
  });

  it("closed: nobody owes anything and every step is done", () => {
    const s = state({ status: "DELIVERED", deliveredAt: day(-2) });
    expect(s.stage).toBe("closed");
    expect(s.ballInCourt).toBe("none");
    expect(s.timeline.every((t) => t.status === "done")).toBe(true);
  });
});

describe("getProjectState — cross-cutting rules", () => {
  it("timeline has exactly one current step, done before it, upcoming after", () => {
    const s = state({ status: "IN_PRODUCTION", team: confirmedTeam(NOW) });
    expect(s.timeline.map((t) => t.status)).toEqual([
      "done", "done", "done", "done", "current", "upcoming", "upcoming", "upcoming",
    ]);
    expect(s.timeline.find((t) => t.stage === "production")?.date).toEqual(s.keyFacts.firstDraftEta);
  });

  it("first-draft ETA skips weekends", () => {
    const friday = new Date("2026-10-02T10:00:00Z");
    expect(addBusinessDays(friday, 2).toISOString().slice(0, 10)).toBe("2026-10-06");
  });

  it("paused keeps the stage it was paused in and hands the client a resume action", () => {
    const s = state({ status: "PAUSED", pausedFromStatus: "IN_PRODUCTION" });
    expect(s.stage).toBe("production");
    expect(s.paused).toBe(true);
    expect(s.nextAction.label).toBe("Paused — resume to continue");
    expect(boardColumnFor(s)).toBe("Paused");
    expect(attentionBucket(s)).toBeNull();
  });

  it("key facts never carry placeholders — unknown values are simply absent", () => {
    const s = state({ status: "DRAFT", brief: dynamicBrief() });
    expect(s.keyFacts).toEqual({ staffedTeam: [] });
  });

  it("something due earlier today is due today (at risk), not overdue", () => {
    const s = state({ status: "AWAITING_REVIEW", assets: [{ status: "IN_REVIEW" }], dueDate: new Date(NOW.getTime() - 3600000) });
    expect(s.urgency).toBe("at_risk");
  });

  it("dashboard: a client-turn item is urgent when overdue, at risk within 24h, otherwise needs input — never both", () => {
    const sent = (expiresAt: Date) =>
      state({ status: "ESTIMATING", estimate: { status: "SENT", totalCredits: 28, sentAt: day(-5), expiresAt, respondedAt: null } });
    expect(sent(day(-1)).urgency).toBe("overdue");
    expect(attentionBucket(sent(day(-1)))).toBe("urgent");
    expect(sent(new Date(NOW.getTime() + 3600000)).urgency).toBe("at_risk");
    expect(attentionBucket(sent(day(3)))).toBe("needs_input");
    expect(attentionBucket(state({ status: "IN_PRODUCTION" }))).toBeNull();
  });
});

describe("regressions — the contradictions seen on 'Klarna 10-Slide Sales Deck' and friends", () => {
  const draftDeck = () => state({ status: "DRAFT", brief: dynamicBrief() });

  it("a draft whose brief waits on the client is never final, never in production, never 'Klingit is working'", () => {
    const s = draftDeck();
    expect(s.stage).toBe("briefing");
    expect(s.ballInCourt).toBe("client");
    expect(s.nextAction.label.startsWith("Your turn")).toBe(true);
    expect(boardColumnFor(s)).toBe("Briefing");
  });

  it("with 0 assets there is nothing to review", () => {
    expect(draftDeck().assetsAwaitingReview).toBe(0);
    expect(state({ status: "AWAITING_REVIEW" }).assetsAwaitingReview).toBe(0);
  });

  it("no TBD / 0 / creative-score placeholders — only real facts", () => {
    const facts = draftDeck().keyFacts;
    expect(facts.credits).toBeUndefined();
    expect(facts.dueDate).toBeUndefined();
  });

  it("an approved estimate leaves the dashboard and the project moves to the In production column", () => {
    const s = state({
      status: "STAFFING",
      estimate: { status: "APPROVED", totalCredits: 28, sentAt: day(-9), expiresAt: day(-5), respondedAt: day(-8) },
    });
    expect(attentionBucket(s)).toBeNull();
    expect(boardColumnFor(s)).toBe("In production");
    expect(s.keyFacts.credits).toBe(28);
  });

  it("an estimate awaiting approval shows on the board in the Estimate column, not In production", () => {
    const s = state({
      status: "ESTIMATING",
      estimate: { status: "SENT", totalCredits: 28, sentAt: day(-1), expiresAt: day(3), respondedAt: null },
    });
    expect(boardColumnFor(s)).toBe("Estimate");
    expect(attentionBucket(s)).toBe("needs_input");
  });
});
