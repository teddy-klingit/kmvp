import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Fragment, cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setMockSession } from "./setup";
import { createStageFixtures, type StageKey } from "./stage-fixtures";
import { legacyTabRedirect, type LegacyTab, type ProjectStage } from "@/lib/project-state";

import ProjectsPage from "@/app/(portal)/projects/page";
import DashboardPage from "@/app/(portal)/dashboard/page";
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
  return renderToStaticMarkup(createElement(Fragment, null, await resolve(await el)));
}

const text = async (el: ReactNode | Promise<ReactNode>) => asText(await render(el));

function region(html: string, marker: string, ends: string[]) {
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const rest = html.slice(start + marker.length);
  const cut = Math.min(...ends.map((e) => rest.indexOf(e)).filter((i) => i >= 0), rest.length);
  return rest.slice(0, cut);
}

const tab = (id: string) => ({ params: Promise.resolve({ id }) });
const scope = (id: string) => ({ ...tab(id), searchParams: Promise.resolve({}) });

type Expect = { column: string; badge: string; next: string; dashboard: boolean; overview: string[] };
const EXPECT: Record<StageKey, Expect> = {
  briefing: {
    column: "Briefing",
    badge: "Briefing",
    next: "Your turn: answer 1 question about the audience",
    dashboard: true,
    overview: ["Who will this deck be presented to?", "Investors"],
  },
  estimating: { column: "Estimate", badge: "Estimating", next: "Klingit: preparing your estimate", dashboard: false, overview: ["What Klingit is scoping"] },
  awaiting_approval: {
    column: "Estimate",
    badge: "Awaiting approval",
    next: "Your turn: approve estimate (28 credits)",
    dashboard: true,
    overview: ["Approve estimate (28 credits)", "Ask a question", "PPT slide"],
  },
  staffing: { column: "In production", badge: "Staffing", next: "Klingit: staffing your team", dashboard: false, overview: ["Progress", "Being staffed"] },
  production: { column: "In production", badge: "In production", next: "Klingit: producing your first draft", dashboard: false, overview: ["Progress", "Sara Staff"] },
  review: { column: "In review", badge: "In review", next: "Your turn: review 2 assets", dashboard: true, overview: ["Awaiting your review", "Approve all", "Request changes"] },
  final: {
    column: "Sign-off",
    badge: "Ready for sign-off",
    next: "Your turn: sign off on the final delivery",
    dashboard: true,
    overview: ["Delivery package", "Rate this project", "Sign off and close project"],
  },
  closed: { column: "Delivered", badge: "Delivered", next: "Delivered", dashboard: false, overview: ["Delivered and signed off", "Request changes"] },
};
const STAGES = Object.keys(EXPECT) as StageKey[];

const NEVER_ANYWHERE = ["TBD", "Creative score 88", "94%", "Not yet scoped", "Klingit is working on your project", "Go to review"];

/** Stage-specific actions that must only ever render in their own stage. */
const ONLY_IN: Record<string, StageKey[]> = {
  "Approve all": ["review"],
  "Approve estimate": ["awaiting_approval"],
  "Sign off and close project": ["final"],
  "Rate this project": ["final"],
};

describe.each(STAGES)("stage %s — every surface agrees", (stage) => {
  const e = EXPECT[stage];
  const p = () => fx.projects[stage];

  it("projects board: right column, next action on the card", async () => {
    const html = await render(ProjectsPage({ searchParams: Promise.resolve({}) }));
    const column = asText(region(html, `data-column="${e.column}"`, ["data-column="]));
    expect(column).toContain(p().name);
    expect(column).toContain(stage === "closed" ? "Delivered" : e.next);
  });

  it("dashboard: in Needs your input only when it's the client's turn, never in both lists", async () => {
    const html = await render(DashboardPage());
    const urgent = asText(region(html, 'data-list="urgent"', ['data-list="needs-input"', "Active projects"]));
    const needsInput = asText(region(html, 'data-list="needs-input"', ["Active projects"]));
    expect(urgent).not.toContain(p().name);
    expect(needsInput.includes(p().name)).toBe(e.dashboard);
  });

  it("header: stage badge, compact timeline, 3 tabs, Share, sidebar", async () => {
    const t = await text(ProjectLayout({ children: null, ...tab(p().id) }));
    expect(t).toContain(e.badge);
    for (const label of ["Overview", "Work", "Brief & scope", "Share", "With Klingit", "Internal", "Key facts"]) {
      expect(t).toContain(label);
    }
    // Past staffing with no team on record, the section is omitted rather than making something up.
    expect(t.includes("Klingit team")).toBe(stage !== "closed");
    for (const removed of [">Timeline<", ">Discussion<", ">Team<", ">Delivery<", ">Final<"]) {
      expect(await render(ProjectLayout({ children: null, ...tab(p().id) }))).not.toContain(removed);
    }
  });

  it("overview: next step plus only this stage's content", async () => {
    const t = await text(OverviewPage(tab(p().id)));
    expect(t).toContain("Next step");
    expect(t).toContain(e.next);
    for (const expected of e.overview) expect(t).toContain(expected);
    for (const bad of NEVER_ANYWHERE) expect(t).not.toContain(bad);
    for (const [label, stages] of Object.entries(ONLY_IN)) {
      if (!stages.includes(stage)) expect(t).not.toContain(label);
    }
  });

  it("work tab: review actions only when assets await review; delivery package at the end", async () => {
    const t = await text(WorkPage(tab(p().id)));
    if (stage === "review") expect(t).toContain("Approve all");
    else expect(t).not.toContain("Approve all");
    if (stage === "final" || stage === "closed") expect(t).toContain("Delivery package");
    if (stage !== "review") expect(t).not.toContain("Request changes");
    for (const bad of NEVER_ANYWHERE) expect(t).not.toContain(bad);
  });

  it("brief & scope tab: the brief record, then what was agreed — never an unsent draft estimate", async () => {
    const t = await text(ScopePage(scope(p().id)));
    expect(t).toContain("What you asked for");
    expect(t).toContain("What was agreed");
    if (stage === "awaiting_approval") {
      expect(t).toContain("28c");
      expect(t).toContain("Awaiting your approval");
    }
    if (stage === "estimating") {
      expect(t).toContain("No estimate yet");
      expect(t).not.toContain("99c");
    }
    expect(t).not.toContain("Approve estimate");
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
    expect(await text(WorkPage(tab(draft().id)))).not.toContain("Sign off");
  });

  it("Work (the old Delivery tab) no longer says 'In production'", async () => {
    const t = await text(WorkPage(tab(draft().id)));
    expect(t).not.toContain("In production");
    expect(t).toContain("Nothing produced yet");
  });

  it("nothing says Klingit is working while the brief waits on the client", async () => {
    const t = (await text(ProjectLayout({ children: null, ...tab(draft().id) }))) + (await text(OverviewPage(tab(draft().id))));
    expect(t).not.toContain("Klingit is working on your project");
    expect(t).toContain("Your turn: answer 1 question about the audience");
  });

  it("no review button when there's nothing to review", async () => {
    const t = (await text(OverviewPage(tab(draft().id)))) + (await text(WorkPage(tab(draft().id))));
    expect(t).not.toContain("Go to review");
    expect(t).not.toContain("Approve all");
    expect(t).not.toContain("Request changes");
  });

  it("Overview shows the waiting question inline instead of TBD / TBD / 0 / Creative score 88", async () => {
    const t = await text(OverviewPage(tab(draft().id)));
    expect(t).toContain("Who will this deck be presented to?");
    expect(t).not.toContain("TBD");
    expect(t).not.toContain("Creative score");
  });

  it("Projects board no longer puts unscoped cards in 'In production'", async () => {
    const html = await render(ProjectsPage({ searchParams: Promise.resolve({}) }));
    expect(asText(region(html, 'data-column="In production"', ["data-column="]))).not.toContain(draft().name);
    expect(asText(html)).not.toContain("Not yet scoped");
  });

  it("Dashboard's estimate approval matches the board's Estimate column", async () => {
    const [dashboard, board] = await Promise.all([render(DashboardPage()), render(ProjectsPage({ searchParams: Promise.resolve({}) }))]);
    expect(asText(region(dashboard, 'data-list="needs-input"', ["Active projects"]))).toContain("approve estimate (28 credits)");
    expect(asText(region(board, 'data-column="Estimate"', ["data-column="]))).toContain(fx.projects.awaiting_approval.name);
  });

  it("an overdue approval is urgent — and only urgent", async () => {
    const html = await render(DashboardPage());
    const name = fx.overdueApproval.name;
    expect(asText(region(html, 'data-list="urgent"', ['data-list="needs-input"', "Active projects"]))).toContain(name);
    expect(asText(region(html, 'data-list="needs-input"', ["Active projects"]))).not.toContain(name);
  });

  it("Dashboard lists the estimate in one list only", async () => {
    const html = await render(DashboardPage());
    const name = fx.projects.awaiting_approval.name;
    const urgent = asText(region(html, 'data-list="urgent"', ['data-list="needs-input"', "Active projects"]));
    const needsInput = asText(region(html, 'data-list="needs-input"', ["Active projects"]));
    expect([urgent.includes(name), needsInput.includes(name)].filter(Boolean)).toHaveLength(1);
  });
});
