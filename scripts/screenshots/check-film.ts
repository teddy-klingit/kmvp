/**
 * Plays the ouhers brand film in the review and checks it end to end (local dev server only):
 * plays for more than 10 s, switches 9:16 ↔ 1:1 and plays again, and pins a comment when the paused frame is clicked.
 *   npx tsx scripts/screenshots/check-film.ts <out dir> [--browser=webkit|chromium]
 */
import { chromium, webkit } from "@playwright/test";
import { DEMO_PASSWORD } from "../../src/lib/demo-personas";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const engine = process.argv.find((a) => a.startsWith("--browser="))?.slice(10) === "webkit" ? webkit : chromium;
const out = process.argv[2] ?? ".";
const name = engine === webkit ? "webkit" : "chromium";

async function main() {
  const browser = await engine.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "maja@ouhers.demo");
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => u.pathname.startsWith("/dashboard"));
  await page.waitForLoadState("networkidle");
  await page.goto(`${BASE}/projects/ouhers-p12-brand-film/review`, { waitUntil: "networkidle" });
  const video = () => page.locator("video").first();
  const state = () => video().evaluate((el: HTMLVideoElement) => ({ t: Math.round(el.currentTime * 10) / 10, paused: el.paused, ready: el.readyState, error: el.error?.code ?? null, src: el.currentSrc.split("/").slice(-3, -1).join("/") }));
  const play = () => page.getByRole("button", { name: "Play", exact: true }).first().click();

  await video().waitFor();
  await play();
  await page.waitForTimeout(11_500);
  const long = await state();
  await page.screenshot({ path: `${out}/2-film-${name}-playing-11s.png` });

  // 9:16 → 1:1, then play again.
  await page.getByRole("link", { name: /1:1/ }).first().click();
  await page.waitForTimeout(1500);
  const kept = await state(); // the playhead carries over from the other format
  await play();
  await page.waitForTimeout(2000);
  const switched = await state();
  await page.screenshot({ path: `${out}/2-film-${name}-after-switch.png` });

  // Pause, then click the frame away from the Play button: a comment pin opens.
  await page.getByRole("button", { name: "Pause", exact: true }).first().click();
  const frame = page.getByRole("button", { name: "Pause and comment on this spot and moment" });
  const box = (await frame.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.25);
  await page.waitForTimeout(500);
  const pinned = await page.locator("textarea").first().isVisible().catch(() => false);
  await page.screenshot({ path: `${out}/2-film-${name}-comment-pin.png` });

  console.log(JSON.stringify({ browser: name, long, kept: kept.t, switched, pinned, errors }));
  await browser.close();
}
main();
