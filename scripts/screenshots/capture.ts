/**
 * Full-page screenshots of the client portal for one project per stage.
 * Runs against the local screenshot server (see seed-stages.ts):
 *
 *   npx tsx scripts/screenshots/capture.ts f1
 *   npx tsx scripts/screenshots/capture.ts f2 --widths=1440,390
 *   npx tsx scripts/screenshots/capture.ts h --widths=1440,1280,390
 *   npx tsx scripts/screenshots/capture.ts i
 *   npx tsx scripts/screenshots/capture.ts home
 *   npx tsx scripts/screenshots/capture.ts insights   (every Insights tab, 1440 + 390)
 *   npx tsx scripts/screenshots/capture.ts j1         (theme sweep: client + ops pages, 1440 + 390)
 *   npx tsx scripts/screenshots/capture.ts nav        (side nav open / folded / tooltip / focus ring at 1440, menu sheet at 390)
 *
 * Output: screenshots/<phase>/...png
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma";
import { DEMO_PASSWORD } from "../../src/lib/demo-personas";

const BASE = process.env.SCREENS_URL ?? "http://localhost:3100";
const args = process.argv.slice(2);
const phase = args.find((a) => !a.startsWith("--")) ?? "f1";
const widths = (args.find((a) => a.startsWith("--widths="))?.split("=")[1] ?? "1440").split(",").map(Number);
const stageFilter = args.find((a) => a.startsWith("--stages="))?.split("=")[1]?.split(",");

const STAGE_PROJECTS: Record<string, string> = {
  briefing: "Klarna 10-Slide Sales Deck",
  awaiting_approval: "Klarna Q4 Investor Update Deck",
  production: "Q3 App install campaign",
  review: "Summer social pack",
  final: "Klarna Holiday Social Pack",
};

const F1_TABS: Record<string, string> = {
  overview: "",
  brief: "/brief",
  estimate: "/estimate",
  timeline: "/timeline",
  assets: "/assets",
  delivery: "/review",
  discussion: "/discussion",
  final: "/final",
};
const F2_TABS: Record<string, string> = { overview: "", work: "/work", scope: "/scope" };

async function shot(page: Page, path: string, name: string, outDir: string, width: number) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  // The portal scrolls inside <main>, not the document, so fullPage alone stops at the fold:
  // grow the viewport to the content height instead (full-height panels then stretch with it).
  const height = await page.evaluate(() => Math.max(document.querySelector("main")?.scrollHeight ?? 0, window.innerHeight));
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${name}-${width}.png`, fullPage: true });
  await page.setViewportSize({ width, height: 900 });
  console.log(`  ${name}-${width}.png`);
}

/** Phase I: PM home, the cockpit in each stage, each edit flow open, at 1440 (signed in as the PM). */
const I_PROJECTS: Record<string, string> = {
  briefing: "Autumn brand refresh",
  estimating: "Good Boy “5:47” Awareness Campaign",
  awaiting_approval: "Klarna Q4 Investor Update Deck",
  staffing: "Checkout-Moment Story Ads",
  production: "Q3 App install campaign",
  review: "Summer social pack",
  final: "Klarna Holiday Social Pack",
};

async function phaseI() {
  const prisma = new PrismaClient({ datasourceUrl: "file:./prisma/screens.db" });
  const rows = await prisma.project.findMany({ where: { name: { in: Object.values(I_PROJECTS) } }, select: { id: true, name: true } });
  await prisma.$disconnect();
  const id = (stage: string) => {
    const r = rows.find((p) => p.name === I_PROJECTS[stage]);
    if (!r) throw new Error(`Missing demo project for ${stage}`);
    return r.id;
  };
  const outDir = "screenshots/i";
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const width = 1440;
  const signIn = async (email: string) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 60_000 });
    return { context, page };
  };

  const pm = await signIn("teddy@klingit.com");
  await shot(pm.page, "/ops", "01-pm-home", outDir, width);
  for (const [i, stage] of Object.keys(I_PROJECTS).entries()) {
    await shot(pm.page, `/ops/projects/${id(stage)}`, `${String(i + 2).padStart(2, "0")}-cockpit-${stage}`, outDir, width);
  }
  const flows: [string, string, string][] = [
    ["10-edit-brief", "briefing", "?edit=brief#brief"],
    ["11-edit-estimate-v2", "awaiting_approval", "?edit=estimate#estimate"],
    ["12-edit-estimate-out-of-scope", "estimating", "?edit=estimate#estimate"],
    ["13-edit-staffing", "staffing", "?edit=staffing#staffing"],
    ["14-edit-dates", "production", "?edit=dates#production"],
    ["15-feed-client", "awaiting_approval", "?feed=client"],
    ["16-feed-staff-notes", "awaiting_approval", "?feed=notes"],
  ];
  for (const [name, stage, suffix] of flows) await shot(pm.page, `/ops/projects/${id(stage)}${suffix}`, name, outDir, width);
  // The legacy URL lands on the cockpit.
  await pm.page.goto(`${BASE}/ops/projects/${id("awaiting_approval")}`, { waitUntil: "networkidle" });
  await pm.context.close();

  // What the client sees of a revised estimate (v2 after approving v1).
  const client = await signIn("jack.ross@klarna.com");
  await shot(client.page, `/projects/${id("production")}`, "20-client-revised-estimate", outDir, width);
  await client.context.close();
  await browser.close();
}

/** Client home (ClientHomeV2.dc.html, the calm dashboard) at 1440 and 390, signed in as Jack. */
async function phaseHome() {
  const outDir = "screenshots/home-v2";
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "jack.ross@klarna.com");
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 60_000 });
    await shot(page, "/dashboard", "dashboard", outDir, width);
    if (width < 768) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) console.warn(`  ! horizontal overflow ${overflow}px`);
    }
    await context.close();
  }
  await browser.close();
}

/** Brand OS linked sources at 1440: page, connect flow (real clicks), a section with chips, the popover, the overview card. */
async function phaseSources() {
  const outDir = "screenshots/sources";
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const width = 1440;
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "jack.ross@klarna.com");
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 60_000 });

  await shot(page, "/assets/sources", "01-sources-page", outDir, width);

  // Connect flow on Dropbox, step by step (viewport shots so the modal is in frame).
  await page.goto(`${BASE}/assets/sources`, { waitUntil: "networkidle" });
  await page.getByRole("article", { name: "Dropbox" }).getByRole("button", { name: "Connect" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/02-connect-step1-sign-in-${width}.png` });
  await page.getByRole("button", { name: "Sign in with Dropbox" }).click();
  await page.getByText("Pick the folders and files").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/03-connect-step2-pick-files-${width}.png` });
  await page.getByRole("button", { name: /^Connect \d+ item/ }).click();
  await page.getByText("Dropbox is connected").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/04-connect-step3-connected-${width}.png` });
  console.log("  02–04 connect steps");

  await shot(page, "/assets/brand-platform/our-brand", "05-our-brand-with-sources", outDir, width);
  await page.goto(`${BASE}/assets/brand-platform/our-brand`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add source" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/06-add-source-paste-link-${width}.png` });
  await page.getByRole("tab", { name: "From connected apps" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/07-add-source-from-apps-${width}.png` });
  console.log("  06–07 popover");

  // The edit field: 1px border + soft focus ring.
  await page.goto(`${BASE}/assets/brand-platform/our-brand`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Edit" }).first().click({ force: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/08-our-brand-editing-${width}.png` });

  await shot(page, "/assets/visual-identity", "09-visual-identity-figma-slot", outDir, width);
  await shot(page, "/assets", "10-overview-sources-card", outDir, width);
  await context.close();
  await browser.close();
}

async function signInAs(browser: Awaited<ReturnType<typeof chromium.launch>>, email: string, width: number) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 60_000 });
  return { context, page };
}

async function warnOverflow(page: Page, name: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) console.warn(`  ! ${name}: horizontal overflow ${overflow}px`);
}

/** Insights (Insights.dc.html): every tab and Market view, at 1440 and 390. */
const INSIGHTS_PAGES: [string, string][] = [
  ["01-overview", "/insights"],
  ["02-performance", "/insights/performance"],
  ["03-market-feed", "/insights/market"],
  ["04-market-competitors", "/insights/market/competitors"],
  ["05-market-trends", "/insights/market/trends"],
  ["06-market-ideas", "/insights/market/ideas"],
  ["07-audience", "/insights/audience"],
  ["08-seo", "/insights/seo"],
];

/** Phase J1: the theme switch on a sweep of client and ops pages, to catch anything the tokens broke. */
const J1_CLIENT: [string, string][] = [
  ["c01-home", "/dashboard"],
  ["c02-projects", "/projects"],
  ["c03-brand-iq", "/assets"],
  ["c04-calendar", "/calendar"],
  ["c05-reports", "/reports"],
  ["c06-account", "/account"],
  ["c07-notifications", "/notifications"],
];
const J1_OPS: [string, string][] = [
  ["o01-needs-you", "/ops"],
  ["o02-projects", "/ops/projects"],
  ["o03-clients", "/ops/clients"],
  ["o04-team", "/ops/team"],
  ["o05-account", "/ops/account"],
];

/** Phase J2: client pages rebuilt from their designs. Pass --pages=projects,calendar to shoot a subset. */
const J2_PAGES: [string, string][] = [
  ["projects-board", "/projects"],
  ["projects-list", "/projects?view=list"],
  ["projects-waiting", "/projects?show=you"],
  ["calendar-month", "/calendar"],
  ["calendar-list", "/calendar?view=list"],
  ["reports-weekly", "/reports"],
  ["reports-full-weekly", "/reports/weekly"],
  ["reports-monthly", "/reports/monthly"],
  ["reports-custom", "/reports/custom"],
  ["brand-overview", "/assets"],
  ["brand-platform", "/assets/brand-platform"],
  ["brand-section-our-brand", "/assets/brand-platform/our-brand"],
  ["brand-section-services", "/assets/brand-platform/services-products"],
  ["brand-section-vision", "/assets/brand-platform/vision"],
  ["brand-visual-identity", "/assets/visual-identity"],
  ["brand-sources", "/assets/sources"],
  ["brand-library", "/assets/library"],
  ["brand-agents", "/assets/agents-templates"],
  ["account-overview", "/account"],
  ["account-usage", "/account/usage"],
  ["account-billing", "/account/billing"],
  ["account-team", "/account/team"],
  ["account-security", "/account/security"],
  ["misc-notifications", "/notifications"],
  ["misc-help", "/help"],
  ["misc-custom-apps", "/apps"],
];
/** Phase J4: ops pages in the OpsClients list pattern (signed in as the PM / Admin). */
const J4_OPS: [string, string][] = [
  ["01-clients", "/ops/clients"],
  ["02-clients-at-risk", "/ops/clients?show=risk"],
  ["03-price-list", "/ops/price-list"],
  ["04-archive", "/ops/archive"],
  ["05-team-capacity", "/ops/team"],
  ["06-team-forecast", "/ops/team/forecast"],
  ["07-agents-library", "/ops/agents"],
  ["08-agents-decision-log", "/ops/agents/audit"],
  ["09-needs-you", "/ops"],
  ["10-inbox", "/ops/inbox"],
  ["11-notifications", "/ops/notifications"],
  ["12-account", "/ops/account"],
];
/** Item 1 sweep: pages that got the theme in J1 but no rebuild. */
const J5_CLIENT: [string, string][] = [
  ["c01-visual-identity", "/assets/visual-identity"],
  ["c02-visual-identity-logotype", "/assets/visual-identity/logotype"],
  ["c03-sources", "/assets/sources"],
  ["c04-agents", "/assets/agents-templates"],
  ["c05-agents-templates", "/assets/agents-templates/templates"],
  ["c06-agents-brand-os", "/assets/agents-templates/brand-os"],
  ["c07-templates", "/assets/templates"],
  ["c08-custom-apps", "/apps"],
  ["c09-help", "/help"],
  ["c10-search", "/search?q=summer"],
  ["c11-new-project", "/projects/new"],
  ["c12-inspiration", "/projects/inspiration"],
  ["c13-reports-custom", "/reports/custom"],
];
const J5_OPS: [string, string][] = [
  ["o01-projects", "/ops/projects"],
  ["o02-billing", "/ops/billing"],
  ["o03-analytics", "/ops/analytics"],
  ["o04-settings", "/ops/settings"],
  ["o05-clients-new", "/ops/clients/new"],
  ["o06-projects-new", "/ops/projects/new"],
];
const pageFilter = args.find((a) => a.startsWith("--pages="))?.split("=")[1]?.split(",");

async function phaseList(outDir: string, client: [string, string][], ops: [string, string][] = []) {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const width of widths.length > 1 || args.some((a) => a.startsWith("--widths=")) ? widths : [1440, 390]) {
    if (client.length) {
      const { context, page } = await signInAs(browser, "jack.ross@klarna.com", width);
      for (const [name, path] of client) {
        await shot(page, path, name, outDir, width);
        if (width < 768) await warnOverflow(page, name);
      }
      await context.close();
    }
    if (ops.length) {
      const { context, page } = await signInAs(browser, "teddy@klingit.com", width);
      for (const [name, path] of ops) {
        await shot(page, path, name, outDir, width);
        if (width < 768) await warnOverflow(page, name);
      }
      await context.close();
    }
  }
  await browser.close();
}

/** The side nav: Reports with it open and folded, a rail tooltip, keyboard focus, ops folded, and the phone menu sheet. */
async function phaseNav() {
  const outDir = "screenshots/nav";
  mkdirSync(outDir, { recursive: true });
  const prisma = new PrismaClient({ datasourceUrl: "file:./prisma/screens.db" });
  const users = await prisma.user.findMany({ where: { email: { in: ["jack.ross@klarna.com", "teddy@klingit.com"] } }, select: { id: true, email: true } });
  await prisma.$disconnect();
  const keyFor = (email: string) => `klingit.nav.${users.find((u) => u.email === email)!.id}`;
  const setNav = (page: Page, key: string, v: "open" | "folded") => page.evaluate(([k, x]) => localStorage.setItem(k, x), [key, v]);
  const browser = await chromium.launch();

  const client = await signInAs(browser, "jack.ross@klarna.com", 1440);
  const jack = keyFor("jack.ross@klarna.com");
  await setNav(client.page, jack, "open");
  await shot(client.page, "/reports", "01-reports-nav-open", outDir, 1440);
  await setNav(client.page, jack, "folded");
  await shot(client.page, "/reports", "02-reports-nav-folded", outDir, 1440);
  // Viewport shots: a rail tooltip on hover, then keyboard focus (Tab) on the fold button.
  await client.page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  await client.page.hover('aside a[href="/insights"]');
  await client.page.waitForTimeout(150);
  await client.page.screenshot({ path: `${outDir}/03-rail-tooltip-1440.png` });
  console.log("  03-rail-tooltip-1440.png");
  await client.page.mouse.move(900, 500);
  await client.page.keyboard.press("Tab");
  await client.page.keyboard.press("Tab");
  await client.page.waitForTimeout(150);
  await client.page.screenshot({ path: `${outDir}/04-focus-ring-1440.png` });
  console.log("  04-focus-ring-1440.png");
  // Mouse click on a nav row: it keeps focus but shows no outline (mouse moved off so the tooltip hides).
  await client.page.click('aside a[href="/calendar"]');
  await client.page.waitForURL("**/calendar", { timeout: 60_000 });
  await client.page.waitForLoadState("networkidle");
  await client.page.mouse.move(900, 500);
  await client.page.waitForTimeout(200);
  console.log(`  focused after click: ${await client.page.evaluate(() => document.activeElement?.getAttribute("href"))}`);
  await client.page.screenshot({ path: `${outDir}/05-after-click-no-outline-1440.png` });
  console.log("  05-after-click-no-outline-1440.png");
  await client.context.close();

  const ops = await signInAs(browser, "teddy@klingit.com", 1440);
  const teddy = keyFor("teddy@klingit.com");
  await setNav(ops.page, teddy, "open");
  await shot(ops.page, "/ops", "06-ops-nav-open", outDir, 1440);
  await setNav(ops.page, teddy, "folded");
  await shot(ops.page, "/ops", "07-ops-nav-folded", outDir, 1440);
  await ops.context.close();

  const phone = await signInAs(browser, "jack.ross@klarna.com", 390);
  await phone.page.setViewportSize({ width: 390, height: 844 });
  await phone.page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  await phone.page.screenshot({ path: `${outDir}/08-reports-top-bar-390.png` });
  await phone.page.click('button[aria-label="Open menu"]');
  await phone.page.waitForTimeout(400);
  await phone.page.screenshot({ path: `${outDir}/09-mobile-menu-390.png` });
  console.log("  08-reports-top-bar-390.png, 09-mobile-menu-390.png");
  await phone.context.close();
  await browser.close();
}

async function main() {
  if (phase === "nav") return phaseNav();
  if (phase === "insights") return phaseList("screenshots/insights", INSIGHTS_PAGES);
  if (phase === "j1") return phaseList("screenshots/j1", J1_CLIENT, J1_OPS);
  if (phase === "j4") {
    // The client workspace needs Klarna's id; add it at run time.
    const prisma = new PrismaClient({ datasourceUrl: "file:./prisma/screens.db" });
    const klarna = await prisma.client.findFirstOrThrow({ where: { name: "Klarna" }, select: { id: true } });
    await prisma.$disconnect();
    const ws: [string, string][] = ["dashboard", "delivery", "brand-os", "admin"].map((v, i) => [`2${i}-workspace-${v}`, `/ops/clients/${klarna.id}/${v}`]);
    return phaseList("screenshots/j4", [], [...J4_OPS, ...ws]);
  }
  if (phase === "j5") {
    const prisma = new PrismaClient({ datasourceUrl: "file:./prisma/screens.db" });
    const klarna = await prisma.client.findFirstOrThrow({ where: { name: "Klarna" }, select: { id: true } });
    const agent = await prisma.agent.findFirstOrThrow({ where: { key: "brief_agent" }, select: { id: true } });
    await prisma.$disconnect();
    const ws: [string, string][] = ["brand-assets", "delivery", "project-files", "brand-os", "content-plan", "custom-apps"].map((v, i) => [`w${i}-workspace-${v}`, `/ops/clients/${klarna.id}/${v}`]);
    const pick = <T extends [string, string]>(l: T[]) => l.filter(([n]) => !pageFilter || pageFilter.some((f) => n.startsWith(f)));
    return phaseList("screenshots/j5", pick(J5_CLIENT), pick([...J5_OPS, ["o07-agent-detail", `/ops/agents/${agent.id}`] as [string, string], ...ws]));
  }
  if (phase === "j2") return phaseList("screenshots/j2", J2_PAGES.filter(([n]) => !pageFilter || pageFilter.some((f) => n.startsWith(f))));
  if (phase === "i") return phaseI();
  if (phase === "sources") return phaseSources();
  if (phase === "home") return phaseHome();
  const prisma = new PrismaClient({ datasourceUrl: "file:./prisma/screens.db" });
  const projects = await prisma.project.findMany({ where: { name: { in: Object.values(STAGE_PROJECTS) } }, select: { id: true, name: true } });
  const jack = await prisma.user.findUniqueOrThrow({ where: { email: "jack.ross@klarna.com" }, select: { id: true } });
  await prisma.$disconnect();
  const panelKey = `klingit.conversation.${jack.id}`;
  const setPanel = (page: Page, pref: "open" | "folded") => page.evaluate(([k, v]) => localStorage.setItem(k, v), [panelKey, pref]);
  const idFor = (stage: string) => projects.find((p) => p.name === STAGE_PROJECTS[stage])?.id;

  const outDir = `screenshots/${phase}`;
  mkdirSync(outDir, { recursive: true });
  const tabs = phase === "f1" ? F1_TABS : F2_TABS;
  const stages = Object.keys(STAGE_PROJECTS).filter((s) => (stageFilter ? stageFilter.includes(s) : phase !== "f1" || s !== "review"));

  const browser = await chromium.launch();
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "jack.ross@klarna.com");
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 60_000 });

    console.log(`width ${width}`);
    if (phase === "h") {
      await phaseH(page, outDir, width, stages, idFor, setPanel);
      await context.close();
      continue;
    }
    await shot(page, "/projects", "board", outDir, width);
    // The board scrolls sideways — capture the right-hand columns too.
    await page.locator("[data-column]").first().locator("..").evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${outDir}/board-right-${width}.png`, fullPage: true });
    console.log(`  board-right-${width}.png`);
    await shot(page, "/dashboard", "dashboard", outDir, width);
    for (const stage of stages) {
      const id = idFor(stage);
      if (!id) throw new Error(`Missing demo project for ${stage} — run seed-stages.ts`);
      for (const [tab, suffix] of Object.entries(tabs)) {
        await shot(page, `/projects/${id}${suffix}`, `${stage}-${tab}`, outDir, width);
      }
      if (phase === "f2" && width < 768 && stage === "review") {
        await page.goto(`${BASE}/projects/${id}`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /chat/i }).click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${outDir}/${stage}-chat-sheet-${width}.png`, fullPage: false });
        console.log(`  ${stage}-chat-sheet-${width}.png`);
      }
    }
    await context.close();
  }
  await browser.close();
}

/** Phase H: every stage × tab, plus the conversation panel open and folded at 1280 and the mobile sheet. */
async function phaseH(
  page: Page,
  outDir: string,
  width: number,
  stages: string[],
  idFor: (s: string) => string | undefined,
  setPanel: (page: Page, pref: "open" | "folded") => Promise<void>
) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  // Default per width: docked open from 1440, folded below.
  await setPanel(page, width >= 1440 ? "open" : "folded");
  for (const stage of stages) {
    const id = idFor(stage);
    if (!id) throw new Error(`Missing demo project for ${stage} — run seed-stages.ts`);
    for (const [tab, suffix] of Object.entries(F2_TABS)) {
      await shot(page, `/projects/${id}${suffix}`, `${stage}-${tab}`, outDir, width);
    }
  }
  const review = idFor("review")!;
  if (width === 1280) {
    await setPanel(page, "open");
    await shot(page, `/projects/${review}`, "review-panel-open", outDir, width);
    await setPanel(page, "folded");
    await shot(page, `/projects/${review}`, "review-panel-folded", outDir, width);
  }
  if (width < 768) {
    await page.goto(`${BASE}/projects/${review}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /chat/i }).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/review-chat-sheet-${width}.png`, fullPage: false });
    console.log(`  review-chat-sheet-${width}.png`);
    // No horizontal scroll on any phone-width page.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) console.warn(`  ! horizontal overflow ${overflow}px on review overview`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
