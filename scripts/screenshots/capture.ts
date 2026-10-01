/**
 * Full-page screenshots of the client portal for one project per stage.
 * Runs against the local screenshot server (see seed-stages.ts):
 *
 *   npx tsx scripts/screenshots/capture.ts f1
 *   npx tsx scripts/screenshots/capture.ts f2 --widths=1440,390
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
  await page.screenshot({ path: `${outDir}/${name}-${width}.png`, fullPage: true });
  console.log(`  ${name}-${width}.png`);
}

async function main() {
  const prisma = new PrismaClient({ datasourceUrl: "file:./prisma/screens.db" });
  const projects = await prisma.project.findMany({ where: { name: { in: Object.values(STAGE_PROJECTS) } }, select: { id: true, name: true } });
  await prisma.$disconnect();
  const idFor = (stage: string) => projects.find((p) => p.name === STAGE_PROJECTS[stage])?.id;

  const outDir = `screenshots/${phase}`;
  mkdirSync(outDir, { recursive: true });
  const tabs = phase === "f2" ? F2_TABS : F1_TABS;
  const stages = Object.keys(STAGE_PROJECTS).filter((s) => (stageFilter ? stageFilter.includes(s) : phase === "f2" || s !== "review"));

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

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
