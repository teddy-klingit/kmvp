import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Fragment, cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setMockSession } from "./setup";
import { prisma } from "@/lib/prisma";
import { createStageFixtures, type StageKey } from "./stage-fixtures";
import { ConversationProvider } from "@/components/ds/conversation-context";
import { yourTurn } from "@/lib/client-home";
import { loadProjectStates } from "@/lib/project-state-loader";
import { legacyTabRedirect, type LegacyTab, type ProjectStage } from "@/lib/project-state";

import ProjectsPage from "@/app/(portal)/projects/page";
import DashboardPage from "@/app/(portal)/dashboard/page";
import CalendarPage from "@/app/(portal)/calendar/page";
import NotificationsPage from "@/app/(portal)/notifications/page";
import ProjectLayout from "@/app/(portal)/projects/[id]/layout";
import OverviewPage from "@/app/(portal)/projects/[id]/page";
import WorkPage from "@/app/(portal)/projects/[id]/work/page";
import ScopePage from "@/app/(portal)/projects/[id]/scope/page";
import BriefTab from "@/app/(portal)/projects/[id]/brief/page";
import EstimateTab from "@/app/(portal)/projects/[id]/estimate/page";
import TimelineTab from "@/app/(portal)/projects/[id]/timeline/page";
import AssetsTab from "@/app/(portal)/projects/[id]/assets/page";
import ReviewTab from "@/app/(portal)/projects/[id]/review/page";
import FinalTab from "@/app/(portal)/projects/[id]/final/page";
import DiscussionTab from "@/app/(portal)/projects/[id]/discussion/page";
import TeamTab from "@/app/(portal)/projects/[id]/team/page";

type Fixtures = Awaited<ReturnType<typeof createStageFixtures>>;
let fx: Fixtures;

beforeAll(async () => {
  fx = await createStageFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

function asText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

/** Static rendering can't run async server components, so resolve them first (as the RSC runtime would). */
async function resolve(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (!isValidElement(node)) return node;
  const { type, props } = node as ReactElement<{ children?: ReactNode }>;
  if (typeof type === "function" && type.constructor.name === "AsyncFunction") {
    return resolve(await (type as (p: unknown) => Promise<ReactNode>)(props));
  }
  if (props?.children === undefined) return node;
  return cloneElement(node, undefined, await resolve(props.children));
}

async function render(el: ReactNode | Promise<ReactNode>) {
  setMockSession({ user: { id: fx.user.id, role: "CLIENT" } });
  // Project pages render inside the layout's ConversationProvider; give standalone page renders the same context.
  return renderToStaticMarkup(createElement(ConversationProvider as (p: { defaultChannel: string; children?: ReactNode }) => ReactNode, { defaultChannel: "klingit" }, createElement(Fragment, null, await resolve(await el))));
}

const text = async (el: ReactNode | Promise<ReactNode>) => asText(await render(el));

function region(html: string, marker: string, ends: string[]) {
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const rest = html.slice(start + marker.length);
  const cut = Math.min(...ends.map((e) => rest.indexOf(e)).filter((i) => i >= 0), rest.length);
  return rest.slice(0, cut);
}

/** The text of the dashboard's "Do this next" card. */
function yourTurnList(html: string) {
  return asText(region(html, 'data-list="your-turn"', ['aria-label="Your projects"']));
}

const tab = (id: string) => ({ params: Promise.resolve({ id }) });
const scope = (id: string) => ({ ...tab(id), searchParams: Promise.resolve({}) });
const work = scope;

/** next = the board/dashboard label; title = the Next step card heading (the label without its "Your turn:" prefix). */
type Expect = { column: string; badge: string; card: string; next: string; title: string; eyebrow: string; dashboard: boolean; overview: string[] };
const EXPECT: Record<StageKey, Expect> = {
  briefing: {
    column: "Drafts",
    badge: "Draft",
    card: "Continue brief",
    next: "Your turn: finish your brief",
    title: "Finish your brief",
    eyebrow: "YOUR TURN",
    dashboard: true,
    overview: ["Continue brief", "Your brief so far", "Brief quality 40", "Win a pitch or a deal", "Open brief studio"],
  },
  estimating: {
    column: "Queued",
    badge: "Queued",
    card: "Klingit is preparing the estimate",
    next: "Klingit: preparing your estimate",
    title: "Preparing your estimate",
    eyebrow: "KLINGIT IS ON IT",
    dashboard: false,
    overview: ["What's happening"],
  },
  awaiting_approval: {
    column: "Queued",
    badge: "Queued",
    card: "Approve estimate · 28 credits",
    next: "Your turn: approve estimate (28 credits)",
    title: "Approve the estimate",
    eyebrow: "YOUR TURN",
    dashboard: true,
    overview: ["Approve · 28 credits", "Ask a question", "PPT slide", "Total 28 credits", "valid until", "After you approve"],
  },
  staffing: {
    column: "Active",
    badge: "Active",
    card: "Picking your team",
    next: "Klingit: picking your team",
    title: "Picking your team",
    eyebrow: "KLINGIT IS ON IT",
    dashboard: false,
    overview: ["What's happening"],
  },
  production: {
    column: "Active",
    badge: "Active",
    card: "First draft",
    next: "Klingit: producing your first draft",
    title: "Producing your first draft",
    eyebrow: "KLINGIT IS ON IT",
    dashboard: false,
    overview: ["What's happening"],
  },
  review: {
    column: "In review",
    badge: "In review",
    card: "Review 2 assets",
    next: "Your turn: review 2 assets",
    title: "Review 2 assets",
    eyebrow: "YOUR TURN",
    dashboard: true,
    overview: ["Review in Work", "Ask a question"],
  },
  final: {
    column: "In review",
    badge: "In review",
    card: "Sign off",
    next: "Your turn: sign off on the final delivery",
    title: "Sign off on the final delivery",
    eyebrow: "YOUR TURN",
    dashboard: true,
    overview: ["Delivery package", "Rate this project", "Sign off", "full project report"],
  },
  closed: {
    column: "Delivered",
    badge: "Delivered",
    card: "Signed off",
    next: "Delivered",
    title: "Delivered and signed off",
    eyebrow: "DELIVERED",
    dashboard: false,
    overview: ["Request changes", "Delivery package"],
  },
};
const STAGES = Object.keys(EXPECT) as StageKey[];

const NEVER_ANYWHERE = ["TBD", "Creative score 88", "94%", "Not yet scoped", "Klingit is working on your project", "Go to review", " — "];

/** Stage-specific actions that must only ever render in their own stage. */
const ONLY_IN: Record<string, StageKey[]> = {
  "Review in Work": ["review"],
  "Approve ·": ["awaiting_approval"],
  "Sign off": ["final"],
  "Rate this project": ["final"],
};

describe.each(STAGES)("stage %s — every surface agrees", (stage) => {
  const e = EXPECT[stage];
  const p = () => fx.projects[stage];

  it("projects board: the client-stage lane, and the status in plain words", async () => {
    const html = await render(ProjectsPage({ searchParams: Promise.resolve({}) }));
    const column = asText(region(html, `data-column="${e.column}"`, ["data-column="]));
    expect(column).toContain(p().name);
    // The card right after the project's name carries its status (or its one action).
    const card = column.slice(column.indexOf(p().name), column.indexOf(p().name) + 160);
    expect(card).toContain(e.card);
  });

  it("dashboard: in Your turn only when it's the client's turn", async () => {
    // The page shows the first 2 cards; the full list (and the YOUR TURN tile count) is this.
    const turns = yourTurn(await loadProjectStates({ status: { not: "ARCHIVED" } }, fx.client.id));
    expect(turns.some((t) => t.projectName === p().name)).toBe(e.dashboard);
  });

  it("header: status pill, milestone timeline, 3 tabs, Share, conversation panel", async () => {
    const t = await text(ProjectLayout({ children: null, ...tab(p().id) }));
    expect(t).toContain(e.badge);
    for (const label of ["Overview", "Work", "Brief & scope", "Share", "With Klingit", "Internal", "Conversation"]) {
      expect(t).toContain(label);
    }
    for (const milestone of ["Draft", "Queued", "Active", "In review", "Delivered"]) expect(t).toContain(milestone);
    expect(t).toContain(stage === "closed" ? "Delivered" : "Now ·");
    // Before an estimate exists, or past staffing with no team on record, the summary item is omitted rather than making something up.
    expect(/Klingit team (Sara|Assigned|Being)/.test(t)).toBe(stage !== "closed" && stage !== "briefing");
    for (const bad of NEVER_ANYWHERE) expect(t).not.toContain(bad);
    for (const removed of [">Timeline<", ">Discussion<", ">Team<", ">Delivery<", ">Final<"]) {
      expect(await render(ProjectLayout({ children: null, ...tab(p().id) }))).not.toContain(removed);
    }
  });

  it("overview: next step plus only this stage's content", async () => {
    const t = await text(OverviewPage(tab(p().id)));
    expect(t).toContain(e.eyebrow);
    expect(t).toContain(e.title);
    for (const expected of e.overview) expect(t).toContain(expected);
    for (const bad of NEVER_ANYWHERE) expect(t).not.toContain(bad);
    for (const [label, stages] of Object.entries(ONLY_IN)) {
      if (!stages.includes(stage)) expect(t).not.toContain(label);
    }
  });

  it("work tab: review actions only when assets await review; delivery package at the end", async () => {
    const t = await text(WorkPage(work(p().id)));
    if (stage === "review") {
      expect(t).toContain("Approve 2 in review");
      expect(t).toContain("Needs your review · 2");
    } else {
      expect(t).not.toContain("in review");
      expect(t).not.toContain("Needs your review");
    }
    // Work still in Klingit's quality check is invisible to the client: not even its name.
    if (stage === "production") {
      expect(t).toContain("Nothing to review yet");
      expect(t).not.toContain("Internal draft slide");
    }
    if (stage === "final" || stage === "closed") expect(t).toContain("Delivery package");
    if (stage !== "review") expect(t).not.toContain("Request changes");
    for (const bad of NEVER_ANYWHERE) expect(t).not.toContain(bad);
  });

  it("brief & scope tab: the brief record, then what was agreed — never an unsent draft estimate", async () => {
    const t = await text(ScopePage(scope(p().id)));
    expect(t).toMatch(/brief|Nothing written yet/i);
    expect(t.indexOf("What was agreed")).toBeGreaterThan(0);
    if (stage === "awaiting_approval") {
      expect(t).toContain("Total 28 credits");
      expect(t).toContain("Awaiting your approval");
    }
    if (stage === "estimating") {
      expect(t).toContain("No estimate yet");
      expect(t).not.toContain("99c");
    }
    expect(t).not.toContain("Approve ·");
  });
});

describe("old tab URLs redirect to their new home", () => {
  const OLD: [LegacyTab, (props: { params: Promise<{ id: string }> }) => Promise<unknown>][] = [
    ["brief", BriefTab],
    ["estimate", EstimateTab],
    ["timeline", TimelineTab],
    ["assets", AssetsTab],
    ["review", ReviewTab],
    ["final", FinalTab],
    ["discussion", DiscussionTab],
    ["team", TeamTab],
  ];

  it.each(OLD)("/%s redirects server-side", async (name, page) => {
    setMockSession({ user: { id: fx.user.id, role: "CLIENT" } });
    const project = fx.projects.review;
    await expect(page(tab(project.id))).rejects.toThrow(`REDIRECT:${legacyTabRedirect(name, project.id, { stage: "review" })}`);
  });

  it("redirects are stage-aware: links land where the client can act", () => {
    const at = (t: LegacyTab, stage: ProjectStage) => legacyTabRedirect(t, "p", { stage });
    expect(at("brief", "briefing")).toBe("/projects/p");
    expect(at("brief", "production")).toBe("/projects/p/scope");
    expect(at("estimate", "awaiting_approval")).toBe("/projects/p");
    expect(at("estimate", "production")).toBe("/projects/p/scope#estimate");
    expect(at("review", "review")).toBe("/projects/p");
    expect(at("review", "briefing")).toBe("/projects/p/work");
    expect(at("final", "final")).toBe("/projects/p");
    expect(at("final", "briefing")).toBe("/projects/p/work");
    expect(at("assets", "review")).toBe("/projects/p/work");
    expect(at("timeline", "review")).toBe("/projects/p");
    expect(at("discussion", "review")).toBe("/projects/p?channel=klingit");
    expect(at("team", "review")).toBe("/projects/p?share=1");
  });
});

describe("regressions — the contradictions seen on a Draft project ('Klarna 10-Slide Sales Deck')", () => {
  const draft = () => fx.projects.briefing;

  it("no 'ready for sign-off / all assets passed QA / 94%' — and the old Final URL doesn't lead to sign-off", async () => {
    const t = await text(OverviewPage(tab(draft().id)));
    for (const bad of ["ready for sign-off", "All assets have passed QA", "94%", "No scope on record", "Sign off"]) {
      expect(t).not.toContain(bad);
    }
    expect(legacyTabRedirect("final", draft().id, { stage: "briefing" })).toBe(`/projects/${draft().id}/work`);
    expect(await text(WorkPage(work(draft().id)))).not.toContain("Sign off");
  });

  it("Work (the old Delivery tab) no longer says 'In production'", async () => {
    const t = await text(WorkPage(work(draft().id)));
    expect(t).not.toContain("In production");
    expect(t).toContain("Nothing to review yet");
  });

  it("nothing says Klingit is working while the brief waits on the client", async () => {
    const t = (await text(ProjectLayout({ children: null, ...tab(draft().id) }))) + (await text(OverviewPage(tab(draft().id))));
    expect(t).not.toContain("Klingit is working on your project");
    expect(t).toContain("Finish your brief");
  });

  it("no review button when there's nothing to review", async () => {
    const t = (await text(OverviewPage(tab(draft().id)))) + (await text(WorkPage(work(draft().id))));
    expect(t).not.toContain("Go to review");
    expect(t).not.toContain("in review");
    expect(t).not.toContain("Request changes");
  });

  it("Overview shows the brief so far instead of TBD / TBD / 0 / Creative score 88", async () => {
    const t = await text(OverviewPage(tab(draft().id)));
    expect(t).toContain("Deck, about 10 slides");
    expect(t).not.toContain("TBD");
    expect(t).not.toContain("Creative score");
  });

  it("Projects board no longer puts unscoped cards in 'In production'", async () => {
    const html = await render(ProjectsPage({ searchParams: Promise.resolve({}) }));
    expect(asText(region(html, 'data-column="Production"', ["data-column="]))).not.toContain(draft().name);
    expect(asText(html)).not.toContain("Not yet scoped");
  });

  it("Dashboard's estimate approval matches the board's Queued lane", async () => {
    const [dashboard, board] = await Promise.all([render(DashboardPage()), render(ProjectsPage({ searchParams: Promise.resolve({}) }))]);
    expect(yourTurnList(dashboard)).toContain("Approve estimate · 28 credits");
    expect(asText(region(board, 'data-column="Queued"', ["data-column="]))).toContain(fx.projects.awaiting_approval.name);
  });

  it("an overdue approval leads Your turn with a red Overdue pill; nothing else is marked overdue", async () => {
    const list = yourTurnList(await render(DashboardPage()));
    const name = fx.overdueApproval.name;
    expect(list).toContain(`${name} ·`);
    // Sorted by deadline, so the overdue item comes first.
    expect(list.indexOf("Overdue")).toBeLessThan(list.indexOf(fx.projects.awaiting_approval.name));
    // The pill, not the fixture's own name ("Stage Deck Overdue Approval").
    expect(list.match(/Overdue(?! Approval)/g)).toHaveLength(1);
    expect(list).not.toContain("Urgent matters");
  });

  it("Dashboard lists the estimate once", async () => {
    const list = yourTurnList(await render(DashboardPage()));
    expect(list.split(fx.projects.awaiting_approval.name).length - 1).toBe(1);
  });

  it("header counts only client actions — market alerts never count — and no allowance is invented", async () => {
    const before = asText(await render(DashboardPage()));
    const count = before.match(/(\d+) things? needs? you/)?.[1];
    expect(Number(count)).toBe(5);
    const insights = (t: string) => Number(t.match(/(\d+) market insights? this week/)?.[1] ?? 0);
    await prisma.marketSignal.create({ data: { clientId: fx.client.id, type: "COMPETITOR", title: "Zip launched 3 new ads on LinkedIn", summary: "x", source: "LinkedIn", publishedAt: new Date() } });
    const after = asText(await render(DashboardPage()));
    expect(after.match(/(\d+) things? needs? you/)?.[1]).toBe(count);
    // The alert shows up as a market insight, not as something to do.
    expect(insights(after)).toBe(insights(before) + 1);
    expect(after).not.toMatch(/\d+ of \d+ left/);
    expect(after).toMatch(/\d+ used · /);
    expect(after).toContain("No monthly allowance");
  });
});

// The 8 internal stages are for ops; clients only ever see Draft, Queued, Active, In review, Delivered.
const INTERNAL_STAGE_NAMES = ["Briefing", "Estimating", "Staffing", "In production", "Awaiting approval", "Awaiting client approval", "Awaiting your approval", "Ready for sign-off", "QA"];

describe("clients never see internal stage names", () => {
  // The fixture projects are named after their stages ("Stage Deck Briefing"): only the UI's own words count.
  const withoutNames = async (t: string) => {
    const names = (await prisma.project.findMany({ where: { clientId: fx.client.id }, select: { name: true } })).map((p) => p.name);
    return names.sort((a, b) => b.length - a.length).reduce((acc, n) => acc.split(n).join(" "), t);
  };
  it("not on the dashboard, the board, the list, the calendar or notifications", async () => {
    const pages = await Promise.all([
      render(DashboardPage()),
      render(ProjectsPage({ searchParams: Promise.resolve({}) })),
      render(ProjectsPage({ searchParams: Promise.resolve({ view: "list" }) })),
      render(CalendarPage({ searchParams: Promise.resolve({}) })),
      render(CalendarPage({ searchParams: Promise.resolve({ view: "list" }) })),
      render(NotificationsPage({ searchParams: Promise.resolve({}) } as never)),
    ]);
    for (const html of pages) {
      const t = await withoutNames(asText(html));
      for (const name of INTERNAL_STAGE_NAMES) expect(t).not.toContain(name);
    }
  });

  it.each(STAGES)("not in the %s project's header or Overview", async (stage) => {
    const id = fx.projects[stage].id;
    const t = await withoutNames((await text(ProjectLayout({ children: null, ...tab(id) }))) + (await text(OverviewPage(tab(id)))));
    for (const name of INTERNAL_STAGE_NAMES) expect(t).not.toContain(name);
  });
});
