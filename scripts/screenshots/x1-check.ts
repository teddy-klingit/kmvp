/** Phase X1 check: the folded nav's overlay and the phone chips. npx tsx scripts/screenshots/x1-check.ts <outDir> */
import { chromium } from "@playwright/test";
import { DEMO_PASSWORD } from "../../src/lib/demo-personas";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
async function main() {
  const out = process.argv[2];
  const browser = await chromium.launch();
  for (const [name, width, height] of [["desktop", 1440, 900], ["phone", 390, 844]] as const) {
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "maja@ouhers.demo");
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
    await page.goto(`${BASE}/insights/sales`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/${name}-sales.png` });
    if (name === "desktop") {
      await page.getByRole("button", { name: "Expand navigation" }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/desktop-overlay.png` });
      await page.reload({ waitUntil: "networkidle" });
      await page.screenshot({ path: `${out}/desktop-overlay-remembered.png` });
      await page.keyboard.press("Escape");
      await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
      await page.screenshot({ path: `${out}/desktop-library.png` });
    }
  }
  await browser.close();
}
main();
