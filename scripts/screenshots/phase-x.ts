/** Phase X v2 after-shots: the 8 Insights tabs, Brand OS → Audience, the staff Goals & budget page, and a phone view. npx tsx scripts/screenshots/phase-x.ts <outDir> */
import { chromium } from "@playwright/test";
import { DEMO_PASSWORD } from "../../src/lib/demo-personas";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
async function signIn(browser: import("@playwright/test").Browser, email: string, viewport: { width: number; height: number }) {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
  return page;
}
async function main() {
  const out = process.argv[2];
  const browser = await chromium.launch();
  const page = await signIn(browser, "maja@ouhers.demo", { width: 1440, height: 2600 });
  for (const [name, path] of [["Overview", "/insights"], ["Paid", "/insights/paid"], ["Organic", "/insights/organic"], ["Website", "/insights/website"], ["Email", "/insights/email"], ["Sales", "/insights/sales"], ["Competitors", "/insights/competitors"], ["Trends", "/insights/trends"], ["BrandAudience", "/assets/audience"]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/X-${name}.png` });
  }
  const phone = await signIn(browser, "maja@ouhers.demo", { width: 390, height: 1400 });
  await phone.goto(`${BASE}/insights/sales`, { waitUntil: "networkidle" });
  await phone.screenshot({ path: `${out}/X-Phone-Sales.png` });
  const staff = await signIn(browser, "teddy@klingit.com", { width: 1440, height: 2000 });
  await staff.goto(`${BASE}/ops/clients/client-ouhers/goals`, { waitUntil: "networkidle" });
  await staff.screenshot({ path: `${out}/X-Staff-GoalsBudget.png` });
  await browser.close();
}
main();
