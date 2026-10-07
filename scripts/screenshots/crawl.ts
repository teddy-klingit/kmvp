/**
 * Visits every page a user can reach by following links (one sample per route shape) and lists the ones that
 * fail to load. Catches pages that crash on real or demo data.
 *
 *   npx tsx scripts/screenshots/crawl.ts maja@ouhers.demo          (client portal)
 *   npx tsx scripts/screenshots/crawl.ts teddy@klingit.com --ops   (staff pages)
 */
import { chromium } from "playwright";
import { DEMO_PASSWORD } from "@/lib/demo-personas";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3100";
const email = process.argv[2] ?? "maja@ouhers.demo";
const ops = process.argv.includes("--ops");
const shape = (s: string) => s.replace(/[a-z0-9]{20,}/g, ":id").replace(/ouhers-p\d+[\w-]*/g, ":pid").replace(/\?.*/, "?q");

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  await p.goto(`${BASE}/sign-in`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', DEMO_PASSWORD);
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
  const seen = new Set<string>();
  const queue = ops ? ["/ops"] : ["/dashboard", "/projects", "/assets", "/insights", "/calendar", "/reports", "/account"];
  const bad: string[] = [];
  while (queue.length && seen.size < 250) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await p.goto(BASE + path, { waitUntil: "domcontentloaded" }).catch(() => null);
    await p.waitForTimeout(300);
    const top = (await p.locator("body").innerText().catch(() => "")).slice(0, 400);
    if (!res || res.status() >= 400 || /couldn.t load|could not be found/i.test(top)) bad.push(`${res?.status() ?? "—"} ${path}`);
    for (const l of await p.$$eval("a[href^='/']", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))) {
      const clean = l.split("#")[0];
      if (!clean || /^\/(api|sign-out)/.test(clean) || /download/.test(clean) || clean.startsWith("/ops") !== ops) continue;
      if (![...seen, ...queue].some((s) => shape(s) === shape(clean))) queue.push(clean);
    }
  }
  console.log(`visited ${seen.size} pages as ${email}`);
  console.log(bad.length ? bad.join("\n") : "no broken pages");
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
