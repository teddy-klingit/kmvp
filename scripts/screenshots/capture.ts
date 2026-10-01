/**
 * Full-page screenshots of the client portal for one project per stage.
 * Runs against the local screenshot server (see seed-stages.ts):
 *
 *   npx tsx scripts/screenshots/capture.ts f1
 *   npx tsx scripts/screenshots/capture.ts f2 --widths=1440,390
 *   npx tsx scripts/screenshots/capture.ts h --widths=1440,1280,390
 *   npx tsx scripts/screenshots/capture.ts i
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

async function main() {
  if (phase === "i") return phaseI();
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
