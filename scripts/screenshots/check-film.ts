/** Plays the ouhers brand film in the review and reports whether the playhead moves (local dev server only). */
import { chromium } from "@playwright/test";
import { DEMO_PASSWORD } from "../../src/lib/demo-personas";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "maja@ouhers.demo");
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
  await page.goto(`${BASE}/projects/ouhers-p12-brand-film/review`, { waitUntil: "networkidle" });
  const v = page.locator("video").first();
  await v.waitFor();
  await page.getByRole("button", { name: "Play", exact: true }).first().click();
  await page.waitForTimeout(2000);
  const a = await v.evaluate((el: HTMLVideoElement) => ({ t: el.currentTime, paused: el.paused, ready: el.readyState, err: el.error?.code ?? null }));
  await page.screenshot({ path: process.argv[2] ?? "film.png" });
  // Switch 9:16 ↔ 1:1, then play again.
  const other = page.getByRole("link", { name: /1:1/ }).first();
  let b = null;
  if (await other.count()) {
    await other.click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Play", exact: true }).first().click();
    await page.waitForTimeout(1500);
    b = await page.locator("video").first().evaluate((el: HTMLVideoElement) => ({ t: el.currentTime, paused: el.paused, src: el.currentSrc.slice(-40) }));
  }
  console.log(JSON.stringify({ first: a, afterSwitch: b, errors }));
  await browser.close();
}
main();
