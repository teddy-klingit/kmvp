/** Platform typography pass: the main client and staff pages. npx tsx scripts/screenshots/type-pass.ts <outDir> */
import { chromium } from "@playwright/test";
import { DEMO_PASSWORD } from "../../src/lib/demo-personas";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const CLIENT = [["Home", "/dashboard"], ["BrandOS", "/assets"], ["Skills", "/skills"], ["Projects", "/projects"], ["Library", "/library"], ["Planner", "/planner"], ["Opportunities", "/opportunities"], ["Usage", "/settings/usage"]];
const STAFF = [["Today", "/ops"], ["Clients", "/ops/clients"], ["ClientOverview", "/ops/clients/client-ouhers/dashboard"], ["ClientCredits", "/ops/clients/client-ouhers/credits"], ["OpsPlanner", "/ops/planner"], ["Admin", "/ops/admin"]];
async function shots(email: string, pages: string[][], out: string, browser: import("@playwright/test").Browser) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
  for (const [name, path] of pages) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
}
async function main() {
  const out = process.argv[2];
  const browser = await chromium.launch();
  await shots("maja@ouhers.demo", CLIENT, out, browser);
  await shots("teddy@klingit.com", STAFF, out, browser);
  await browser.close();
}
main();
