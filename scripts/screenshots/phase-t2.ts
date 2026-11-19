/** Phase T2 shots: the staff client page for ouhers and Nordlys. npx tsx scripts/screenshots/phase-t2.ts <outDir> [tabs…] */
import { chromium } from "@playwright/test";
import { DEMO_PASSWORD } from "../../src/lib/demo-personas";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const CLIENTS: [string, string][] = [
  ["ouhers", "client-ouhers"],
  ["Nordlys", process.env.NORDLYS_ID ?? "cmuq1sljj001ws96kfgxcrz9n"],
];
async function main() {
  const [out, ...only] = process.argv.slice(2);
  const tabs = only.length ? only : ["dashboard", "credits", "notes"];
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 2000 } })).newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "teddy@klingit.com");
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
  for (const [name, id] of CLIENTS)
    for (const tab of tabs) {
      await page.goto(`${BASE}/ops/clients/${id}/${tab}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/T2-${name}-${tab}.png`, fullPage: true });
    }
  await page.goto(`${BASE}/ops/clients`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/T2-Clients.png`, fullPage: true });
  await page.goto(`${BASE}/ops`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/T2-Today.png`, fullPage: true });
  await browser.close();
}
main();
