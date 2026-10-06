/**
 * Checks the ouhers brand film review end to end, as maja@ouhers.demo, in real Chrome (Playwright's own Chromium
 * can't play H.264): play with sound, each comment marker seeks to its moment, a comment at the playhead (a range
 * with a pin), 9:16 ↔ 1:1 keeping the playhead. Screenshots at 1440 go to screenshots/review/.
 *
 *   npx tsx scripts/screenshots/verify-brand-film.ts   (dev server on :3100 with the ouhers seed)
 */
import { chromium } from "playwright";
import { DEMO_PASSWORD } from "@/lib/demo-personas";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3100";
const OUT = "screenshots/review";
const fails: string[] = [];
const ok = (what: string, pass: boolean, detail = "") => {
  console.log(`  ${pass ? "✓" : "✗"} ${what}${detail ? ` · ${detail}` : ""}`);
  if (!pass) fails.push(what);
};

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "maja@ouhers.demo");
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60_000 });

  await page.goto(`${BASE}/review/ouhers-p12-brand-film?kind=video`, { waitUntil: "networkidle" });
  const video = page.locator("video");
  await video.evaluate((v: HTMLVideoElement) => (v.readyState >= 1 ? null : new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }))));
  const src = await video.getAttribute("src");
  const ranged = await page.request.get(`${BASE}${src}`, { headers: { Range: "bytes=0-99" } });
  ok("file is served in ranges (seekable)", ranged.status() === 206 && ranged.headers()["content-range"]?.startsWith("bytes 0-99/") === true, `${ranged.status()} ${ranged.headers()["content-range"]}`);
  ok("poster frame shown before play", Boolean(await video.getAttribute("poster")));
  ok("thumbnail strip on the timeline", (await page.locator('img[src*="part=strip"]').count()) === 1);

  // Play with sound.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(1800);
  const playing = await video.evaluate((v: HTMLVideoElement & { webkitAudioDecodedByteCount?: number }) => ({ t: v.currentTime, paused: v.paused, muted: v.muted, volume: v.volume, audio: v.webkitAudioDecodedByteCount ?? 0 }));
  ok("plays", !playing.paused && playing.t > 1, `t=${playing.t.toFixed(2)}`);
  ok("with sound (not muted, audio decoded)", !playing.muted && playing.volume > 0 && playing.audio > 0, `${playing.audio} audio bytes decoded`);
  await page.getByRole("button", { name: "Pause", exact: true }).click();

  // Each marker seeks to its comment's moment.
  const expected: [number, number][] = [
    [1, 2.0],
    [2, 9.4],
    [3, 10.6],
    [4, 12.4],
  ];
  for (const [n, t] of expected) {
    await page.locator(`button[aria-label^="Comment ${n} at"]`).click();
    await page.waitForTimeout(400);
    const at = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    ok(`marker ${n} seeks to ${t}s`, Math.abs(at - t) < 0.05, `video at ${at.toFixed(2)}s`);
    if (n === 2) {
      ok("pin 2 shows on the paused frame", (await page.locator('button[aria-label="Comment 2"]').count()) === 1);
      await page.screenshot({ path: `${OUT}/09-brand-film-1440.png` });
    }
  }
  const ranges = await page.locator('[aria-label$="to 0:05.4"], [aria-label$="to 0:12.4"]').count();
  ok("ranges 1 and 3 on the timeline", ranges === 2);

  // A comment at the playhead: a range with a pin.
  await page.locator('button[aria-label^="Comment 1 at"]').click();
  await page.waitForTimeout(300);
  const box = (await page.getByRole("button", { name: "Pause and comment on this spot and moment" }).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await page.getByLabel("Range, until").check();
  await page.getByLabel("Range ends at (seconds)").fill("3.5");
  await page.getByPlaceholder("What should change here?").fill("Verification: a softer fade on this line.");
  await page.screenshot({ path: `${OUT}/10-brand-film-comment-1440.png` });
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  // Comments are numbered in timecode order, so the new one (at 0:02.0, after #1) becomes #2.
  await page.waitForSelector('button[aria-label="Comment 2 at 0:02.0 to 0:03.5"]', { timeout: 15_000 }).then(
    () => ok("new comment at the playhead, as a range (#2 by timecode)", true),
    () => ok("new comment at the playhead, as a range (#2 by timecode)", false),
  );
  ok("…in the comments panel", await page.getByText("Verification: a softer fade on this line.").isVisible());

  // 9:16 ↔ 1:1, keeping the playhead (the 9.4 s pin is #3 now).
  await page.locator('button[aria-label^="Comment 3 at 0:09.4"]').click();
  await page.waitForTimeout(300);
  await page.getByRole("link", { name: "1:1" }).click();
  await page.waitForURL(/asset=/);
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.readyState >= 1 && v.videoWidth === v.videoHeight;
  });
  await page.waitForTimeout(400);
  const square = await video.evaluate((v: HTMLVideoElement) => ({ t: v.currentTime, w: v.videoWidth, h: v.videoHeight }));
  ok("switched to 1:1", square.w === 1080 && square.h === 1080, `${square.w}×${square.h}`);
  ok("…at the same moment", Math.abs(square.t - 9.4) < 0.1, `video at ${square.t.toFixed(2)}s`);
  await page.screenshot({ path: `${OUT}/11-brand-film-1x1-1440.png` });
  await page.getByRole("link", { name: "9:16" }).click();
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.readyState >= 1 && v.videoHeight > v.videoWidth;
  });
  ok("and back to 9:16", true);

  await browser.close();
  console.log(fails.length ? `\n${fails.length} failed: ${fails.join("; ")}` : "\nAll checks passed.");
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
