/** One page as one user on the local dev server: npx tsx scripts/screenshots/shot.ts <email> <path> <out.png> [--full] [--scroll=<heading text>] */
import { chromium } from "@playwright/test";
import { DEMO_PASSWORD } from "../../src/lib/demo-personas";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
async function main() {
  const [email, path, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const scroll = process.argv.find((a) => a.startsWith("--scroll="))?.slice(9);
  if (scroll) {
    await page.getByText(scroll, { exact: true }).first().scrollIntoViewIfNeeded();
    await page.getByText(scroll, { exact: true }).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: out, fullPage: process.argv.includes("--full") });
  await browser.close();
}
main();
