import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createElement, Fragment, isValidElement, cloneElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { takeawayHref, unlockSentence } from "@/lib/insights-data";
import nextConfig from "../next.config";
import OverviewPage from "@/app/(portal)/insights/page";
import AudiencePage from "@/app/(portal)/insights/audience/page";
import PerformancePage from "@/app/(portal)/insights/performance/page";
import FeedPage from "@/app/(portal)/insights/market/page";
import CompetitorsPage from "@/app/(portal)/insights/market/competitors/page";
import TrendsPage from "@/app/(portal)/insights/market/trends/page";
import IdeasPage from "@/app/(portal)/insights/market/ideas/page";
import SeoPage from "@/app/(portal)/insights/seo/page";

// No network in tests: every ad account reads as "not connected", and the agent never runs on page load.
vi.mock("@/lib/integrations/meta-ads", () => ({ getMetaAdAccountInsights: async () => ({ ok: false, reason: "not_configured" }) }));
vi.mock("@/lib/integrations/linkedin-ads", () => ({ getLinkedInAdInsights: async () => ({ ok: false, reason: "not_connected" }) }));
vi.mock("@/lib/integrations/google-ads", () => ({ getGoogleAdsAccountInsights: async () => ({ ok: false, reason: "not_configured" }) }));
vi.mock("@/lib/integrations/industry-news", () => ({ getIndustryNews: async () => [] }));
vi.mock("@/lib/integrations/meta-ad-library", () => ({ getCompetitorAdLibraryActivity: async () => [] }));
vi.mock("@/lib/integrations/linkedin-ad-library", () => ({ getLinkedInCompetitorAds: async () => [] }));
vi.mock("@/lib/integrations/google-ad-transparency", () => ({ getGoogleCompetitorAds: async () => [] }));
process.env.INSIGHTS_AGENT_ON_PAGE_LOAD = "0";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

async function resolve(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (!isValidElement(node)) return node;
  const { type, props } = node as ReactElement<{ children?: ReactNode }>;
  if (typeof type === "function" && type.constructor.name === "AsyncFunction") return resolve(await (type as (p: unknown) => Promise<ReactNode>)(props));
  if (props?.children === undefined) return node;
  return cloneElement(node, undefined, await resolve(props.children));
}
const html = async (el: Promise<ReactNode>) => renderToStaticMarkup(createElement(Fragment, null, await resolve(await el)));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { paidMediaInScope: false } });
  await prisma.asset.createMany({
    data: [
      { clientId: fx.clientA.id, projectId: fx.projectA.id, name: "Story 9:16 — Beach hero", format: "Story 9:16", performanceCtr: 7.4, sentVersion: 1 },
      { clientId: fx.clientA.id, projectId: fx.projectA.id, name: "Static 1:1 — Product shot", format: "Static 1:1", performanceCtr: 2.1, sentVersion: 1 },
      { clientId: fx.clientA.id, projectId: fx.projectA.id, name: "Static 1:1 — Lifestyle", format: "Static 1:1", performanceCtr: null, sentVersion: 1 },
    ],
  });
  await prisma.performanceBrief.create({
    data: {
      clientId: fx.clientA.id,
      summary: "A's summary",
      recommendations: [],
      takeaways: [
        { title: "Stories beat statics A-secret", detail: "Story 9:16 averages 7.4% against 2.1%.", action: { kind: "brief", label: "Brief more stories", view: null } },
        { title: "Competitors push checkout", detail: "Zip launched ads.", action: { kind: "view", label: "See their ads", view: "competitors" } },
        { title: "Third", detail: "x", action: { kind: "view", label: "See it", view: "audience" } },
        { title: "A fourth one is never shown", detail: "x", action: { kind: "view", label: "See it", view: "seo" } },
      ],
    },
  });
});
afterAll(async () => {
  await prisma.performanceBrief.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
});

describe("insights overview", () => {
  it("a brief action opens the brief studio with the takeaway; a view action opens the evidence", () => {
    const brief = takeawayHref({ headline: "Stories win", why: "6.0% vs 2.1%", action: { kind: "brief", label: "Brief more stories", view: null } });
    expect(brief).toBe(`/brief/new?${new URLSearchParams({ q: "Stories win. 6.0% vs 2.1%" })}`);
    expect(takeawayHref({ headline: "t", why: "d", action: { kind: "view", label: "See their ads", view: "competitors" } })).toBe("/insights/market/competitors");
    expect(takeawayHref({ headline: "t", why: "d", action: { kind: "view", label: "See", view: "creative" } })).toBe("/insights/performance#creative");
  });

  it("explains missing sources in one sentence, in the design's order", () => {
    expect(unlockSentence([{ name: "LinkedIn", unlocks: ["follower growth", "community"] }, { name: "Google Analytics", unlocks: ["website"] }])).toBe("follower growth, website and community numbers");
  });

  it("shows max 3 takeaways (older ones read as headline + Why?), real asset names, and never a '—' tile", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const raw = await html(OverviewPage({ searchParams: Promise.resolve({}) }));
    expect(raw).not.toMatch(/>\s*—\s*</);
    const page = text(raw);
    expect(page).toContain("Stories beat statics A-secret");
    expect(page).toContain("Third");
    expect(page).not.toContain("A fourth one is never shown");
    // The reasoning is only behind "Why?", never a paragraph on the page.
    expect(page).not.toContain("Story 9:16 averages 7.4% against 2.1%.");
    expect(page).toContain("Why?");
    // The leaderboard uses assetTitle(): "Beach hero", not "Story 9:16 — Beach hero", against the real average.
    expect(page).toContain("Creative leaderboard");
    expect(page).toContain("Beach hero");
    expect(page).toContain("Product shot");
    expect(page).not.toContain("Story 9:16 — Beach hero");
    expect(page).toContain("Your average 4.8%");
    // Organic-only client: no paid numbers; missing sources are a skeleton with Connect.
    expect(page).not.toContain("Ad spend");
    expect(page).toContain("Connect LinkedIn and Google Analytics");
    expect(page).toContain("Data sources");
  });

  it("client B never sees client A's takeaways or creative", async () => {
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    const page = text(await html(OverviewPage({ searchParams: Promise.resolve({}) })));
    expect(page).not.toContain("A-secret");
    expect(page).not.toContain("Beach hero");
    // B has no data at all: no number cards, just the honest empty states.
    expect(page).not.toContain("Last 30 days");
    expect(page).toContain("writes three takeaways");
  });

  it("Audience hides metrics without data instead of showing '—'", async () => {
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    const raw = await html(AudiencePage({ searchParams: Promise.resolve({}) }));
    expect(raw).not.toMatch(/>\s*—\s*</);
    const page = text(raw);
    expect(page).not.toContain("Comments, latest period");
    expect(page).not.toContain("Unique visitors");
    expect(page).toContain("Google Analytics");
  });
});

describe("every insights tab renders", () => {
  it.each([
    ["Performance", () => PerformancePage({ searchParams: Promise.resolve({}) })],
    ["Market feed", () => FeedPage({ searchParams: Promise.resolve({}) })],
    ["Competitors", () => CompetitorsPage({ searchParams: Promise.resolve({ range: "7" }) })],
    ["Trends", () => TrendsPage({ searchParams: Promise.resolve({ range: "90" }) })],
    ["Ideas", () => IdeasPage()],
    ["SEO", () => SeoPage()],
  ] as [string, () => Promise<ReactNode>][])("%s, without a '—' tile", async (_name, page) => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const raw = await html(page());
    expect(text(raw).length).toBeGreaterThan(20);
    // A "—" as a whole value (a dash tile) never renders.
    expect(raw).not.toMatch(/>\s*—\s*</);
  });
});

describe("insights redirects", () => {
  it("every old URL lands on its new home", async () => {
    const rules = (await nextConfig.redirects!()) as { source: string; destination: string }[];
    const to = (source: string) => rules.find((r) => r.source === source)?.destination;
    expect(to("/insights/market-intelligence")).toBe("/insights/market");
    expect(to("/insights/market-intelligence/:view(competitors|trends|ideas)")).toBe("/insights/market/:view");
    expect(to("/insights/market-intelligence/seo")).toBe("/insights/seo");
    expect(to("/insights/community")).toBe("/insights/audience#community");
    expect(to("/insights/website")).toBe("/insights/audience#website");
  });
});
