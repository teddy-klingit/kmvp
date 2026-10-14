import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// The Estimate agent's model call: whatever the test sets, and what it was shown.
const agent = vi.hoisted(() => ({ lineItems: [] as { itemKey: string; quantity: number; detail: string }[], unresolved: [] as { description: string; reason: string }[], seen: [] as string[] }));
vi.mock("@/lib/ai/agents/estimate-agent", () => ({
  generateEstimate: vi.fn(async (args: { priceList: { key: string }[] }) => {
    agent.seen = args.priceList.map((p) => p.key);
    return { ok: true, data: { lineItems: agent.lineItems, unresolvedNeeds: agent.unresolved, notes: "Scoped from your brief." }, runId: "run-test" };
  }),
}));

import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { generateDraftEstimate } from "@/lib/estimate-generation";
import { pmLineCredits, priceLines, sendBlockers, totals } from "@/lib/estimate-lines";
import { parseCsv } from "@/lib/price-list-sync";
import { saveEstimateAction, sendEstimateAction } from "@/lib/actions/cockpit-actions";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let pmUserId: string;
const item = (sourceKey: string) => prisma.priceListItem.findUniqueOrThrow({ where: { sourceKey } });
const form = (f: Record<string, string>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(f)) d.set(k, v);
  return d;
};

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const pm = await prisma.user.create({ data: { name: "Paula PM", email: `pm-pl-${Date.now()}@test.local`, role: "INTERNAL", status: "ACTIVE" } });
  pmUserId = pm.id;
  await prisma.staffMember.create({ data: { userId: pm.id, title: "PROJECT_MANAGER" } });
  await prisma.agent.upsert({ where: { key: "estimate_agent" }, update: {}, create: { key: "estimate_agent", name: "Estimate agent", category: "ESTIMATE", description: "test" } });
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.staffMember.deleteMany({ where: { userId: pmUserId } });
  await prisma.user.deleteMany({ where: { id: pmUserId } });
});

describe("the 2026 Price List (klingit-price-list-credits-2026.csv)", () => {
  it("is seeded with its statuses: legacy hidden, the web retainer added, Performance as monthly services", async () => {
    const live = await prisma.priceListItem.findMany({ where: { archivedAt: null, sourceKey: { not: null }, NOT: { sourceKey: { startsWith: "test_" } } } });
    expect(live).toHaveLength(64);
    const count = (s: string) => live.filter((i) => i.status === s).length;
    expect([count("fixed"), count("estimate"), count("quote"), count("legacy")]).toEqual([44, 5, 1, 14]);
    expect(live.filter((i) => i.status === "legacy").every((i) => !i.visibleToClients)).toBe(true);
    expect(await item("web_retainer")).toMatchObject({ status: "estimate", creditCost: 10, unit: "per month", visibleToClients: true, monthly: true });
    const perf = live.filter((i) => i.category === "Performance");
    expect(perf.map((i) => [i.displayName, i.creditCost, i.monthly])).toEqual([
      ["SEO", 30, true],
      ["Google Ads", 20, true],
      ["Meta Ads", 15, true],
      ["LinkedIn Ads", 15, true],
      ["TikTok Ads", 15, true],
    ]);
    expect((await item("unique_social_media_design_1_post")).creditCost).toBe(3);
    expect((await item("iteration_small_content_layout_tweak")).creditCost).toBe(0.5);
  });

  it("reads the CSV with quoted commas", () => {
    expect(parseCsv('category,item,credits\r\nPresentations & Documents,"Base deck, brand-aligned layout (10-15 slides)",18\r\n')).toEqual([{ category: "Presentations & Documents", item: "Base deck, brand-aligned layout (10-15 slides)", credits: "18" }]);
  });
});

describe("estimate lines are quantity × credits, split into PM and creative", () => {
  it("fixed items as listed; estimate and quote items wait for the PM; the PM line is a share of creative", async () => {
    const [post, retouch, html] = await Promise.all([item("unique_social_media_design_1_post"), item("image_retouching"), item("html_banner_or_email_build")]);
    const lines = priceLines(
      [
        { kind: "price", priceListItemId: post.id, quantity: 4, detail: "" },
        { kind: "price", priceListItemId: retouch.id, quantity: 5, detail: "" },
        { kind: "price", priceListItemId: html.id, quantity: 1, detail: "" },
        { kind: "pm", credits: pmLineCredits(22, 0.1, 0.5) },
      ],
      [post, retouch, html]
    );
    expect(lines.map((l) => [l.credits, l.balance, l.needsConfirm, l.confirmed])).toEqual([
      [12, "creative", false, true], // 4 × 3, never hours × a multiplier
      [10, "creative", true, false], // 5 × 2, a starting point
      [0, "creative", true, false], // a quote has no number until the PM gives one
      [2, "pm", false, true], // 10% of 22, in half credits
    ]);
    expect(totals(lines)).toEqual({ pm: 2, creative: 22, total: 24 });
    expect(pmLineCredits(2, 0.1, 0.5)).toBe(0.5);
    // A quote line the PM "confirms" without a number still isn't confirmed.
    expect(priceLines([{ kind: "price", priceListItemId: html.id, quantity: 1, detail: "", credits: 0, confirmed: true }], [html])[0].confirmed).toBe(false);
    const legacy = await item("wireframes");
    expect(() => priceLines([{ kind: "price", priceListItemId: legacy.id, quantity: 1, detail: "" }], [legacy])).toThrow(/isn't on the price list/);
  });
});

describe("the Estimate agent uses the Price List", () => {
  it("prices the items it picked, adds the PM line, sends unknown items to Needs PM quote, and never shows legacy items", async () => {
    const project = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Price list estimate", type: "CAMPAIGN", status: "ESTIMATING", brief: { create: { goals: "Launch the refill pouch" } } } });
    agent.lineItems = [
      { itemKey: "unique_social_media_design_1_post", quantity: 6, detail: "6 launch posts" },
      { itemKey: "website_copy", quantity: 2, detail: "Two product pages" },
      { itemKey: "full_video_production", quantity: 1, detail: "A film" },
    ];
    agent.unresolved = [{ description: "Product shoot", reason: "No photography on the list" }];
    const r = await generateDraftEstimate(project.id);
    expect(r.ok).toBe(true);
    expect(agent.seen).toContain("website_copy");
    expect(agent.seen).not.toContain("wireframes"); // legacy
    expect(agent.seen).not.toContain("seo"); // monthly services (Performance, the web retainer) aren't project lines
    expect(agent.seen).not.toContain("web_retainer");
    const est = await prisma.estimate.findUniqueOrThrow({ where: { projectId: project.id }, include: { lineItems: { orderBy: { order: "asc" } } } });
    expect(est.lineItems.map((l) => [l.deliverable, l.credits, l.balance, l.needsConfirm])).toEqual([
      ["Unique social media design (1 post)", 18, "creative", false],
      ["Website copy", 16, "creative", true],
      ["Marketing PM: briefing, coordination and feedback", 3.5, "pm", false],
    ]);
    expect([est.creativeCredits, est.pmCredits, est.totalCredits]).toEqual([34, 3.5, 37.5]);
    expect((est.unresolvedNeeds as { description: string }[]).map((n) => n.description)).toEqual(["Product shoot", "1× full_video_production"]);
    expect(sendBlockers(est)).toEqual(["1 line needs your number", "2 items need a PM quote"]);
  });

  it("the estimate can't be sent until estimate/quote lines are confirmed and unmatched items are quoted", async () => {
    setMockSession({ user: { id: pmUserId, role: "INTERNAL" } });
    const project = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Send guard", type: "CAMPAIGN", status: "ESTIMATING" } });
    const [post, copy] = await Promise.all([item("unique_social_media_design_1_post"), item("website_copy")]);
    const est = await prisma.estimate.create({ data: { projectId: project.id, status: "DRAFT", totalCredits: 14, creativeCredits: 14, unresolvedNeeds: [{ description: "Product shoot" }] } });
    await prisma.estimateLineItem.createMany({
      data: [
        { estimateId: est.id, deliverable: "Post", detail: "", quantity: 2, credits: 6, hours: 6, priceListItemId: post.id, order: 0 },
        { estimateId: est.id, deliverable: "Website copy", detail: "", quantity: 1, credits: 8, hours: 8, priceListItemId: copy.id, needsConfirm: true, order: 1 },
      ],
    });
    await sendEstimateAction(form({ projectId: project.id }));
    expect((await prisma.estimate.findUniqueOrThrow({ where: { id: est.id } })).status).toBe("DRAFT");

    // The PM confirms a number for the copy, quotes the shoot, and adds the PM line.
    const saved = await saveEstimateAction(
      {},
      form({
        projectId: project.id,
        lines: JSON.stringify([
          { kind: "price", priceListItemId: post.id, quantity: 2, detail: "" },
          { kind: "price", priceListItemId: copy.id, quantity: 1, detail: "", credits: 6, confirmed: true },
          { kind: "pm", credits: 1.5 },
        ]),
        resolutions: JSON.stringify([{ index: 0, kind: "priced", credits: 12 }]),
      })
    );
    expect(saved.error).toBeUndefined();
    const after = await prisma.estimate.findUniqueOrThrow({ where: { id: est.id }, include: { lineItems: { orderBy: { order: "asc" } } } });
    expect(after.lineItems.map((l) => [l.credits, l.balance, Boolean(l.confirmedAt)])).toEqual([
      [6, "creative", false],
      [6, "creative", true],
      [1.5, "pm", false],
      [12, "creative", false],
    ]);
    expect([after.creativeCredits, after.pmCredits, after.totalCredits]).toEqual([24, 1.5, 25.5]);
    await sendEstimateAction(form({ projectId: project.id }));
    expect((await prisma.estimate.findUniqueOrThrow({ where: { id: est.id } })).status).toBe("SENT");
  });
});
