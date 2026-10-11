/**
 * Nav v3 (01-HomeMenu): Home with the profile menu open, as maja@ouhers.demo, at 1440. Also a settings page.
 *   npx tsx scripts/screenshots/capture-menu.ts   (dev server on :3100)
 */
import { chromium } from "playwright";
import { DEMO_PASSWORD } from "@/lib/demo-personas";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3100";
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 1440, height: 1080 } })).newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', "maja@ouhers.demo");
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("aside").getByRole("button", { name: /Account menu/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "screenshots/phase-q/01-home-menu-1440.png" });
  await page.keyboard.press("Escape");
  for (const [n, path] of [["02-settings-account", "/settings/account"], ["03-settings-usage", "/settings/usage"], ["04-brand-os", "/assets"]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `screenshots/phase-q/${n}-1440.png` });
  }
  await b.close();
})();
