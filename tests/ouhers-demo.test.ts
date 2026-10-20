import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Demo files go to a throwaway folder; a demo account must never touch the real ad accounts.
vi.hoisted(() => {
  process.env.UPLOADS_DIR = `${process.env.TMPDIR ?? "/tmp"}/klingit-ouhers-test-uploads`;
});
const live = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/integrations/meta-ads", async (orig) => ({
  ...(await orig<typeof import("@/lib/integrations/meta-ads")>()),
  getMetaAdAccountInsights: async () => (live.calls++, { ok: false, reason: "not_configured" }),
  getMetaDailyInsights: async () => (live.calls++, { ok: false, reason: "not_configured" }),
}));

import { prisma } from "@/lib/prisma";
import { adDays } from "@/lib/metrics";
import { loadRevenue } from "@/lib/revenue";
import { teamBalances } from "@/lib/team-ledger";
import { aiCreditStatus } from "@/lib/ai-credits";
import { loadToday } from "@/lib/today";
import { setMockSession } from "./setup";
import { OUHERS_CLIENT_ID, seedOuhers } from "@/lib/demo/ouhers";
import { loadPaidMedia } from "@/lib/insights-data";
import { loadDaily } from "@/lib/insights/daily";
import { syncDailyAdMetrics } from "@/lib/integrations/ad-daily";
import { loadReviewAssets } from "@/lib/review-assets";
import { runMarketIntelligence } from "@/lib/market-intelligence-run";
import { GET as downloadAsset } from "@/app/api/assets/[assetId]/download/route";
import { loadReview } from "@/lib/review";
import { blockingFlags, fixedBeforeSend } from "@/lib/qc/quality-check";
import { loadAssetDetail } from "@/lib/asset-detail";
import { performanceTierFor } from "@/lib/asset-performance";
import { loadOutputLibrary } from "@/lib/output-library";
import { loadPmThread } from "@/lib/pm-thread";
import { CATEGORIES } from "@/lib/output-categories";

const counts = async () => {
  const where = { clientId: OUHERS_CLIENT_ID };
  return {
    projects: await prisma.project.count({ where }),
    assets: await prisma.asset.count({ where }),
    versions: await prisma.assetVersion.count({ where: { asset: where } }),
    daily: (await adDays(OUHERS_CLIENT_ID)).length,
    signals: await prisma.marketSignal.count({ where }),
    runs: await prisma.agentRun.count({ where }),
    users: await prisma.user.count({ where: { email: { endsWith: "@ouhers.demo" } } }),
    demoAgents: await prisma.agent.count({ where: { key: { startsWith: "demo_ouhers_" } } }),
  };
};

let other: { clients: number; projects: number };

beforeAll(async () => {
  other = { clients: await prisma.client.count({ where: { id: { not: OUHERS_CLIENT_ID } } }), projects: await prisma.project.count({ where: { clientId: { not: OUHERS_CLIENT_ID } } }) };
  await seedOuhers({ shift: true });
}, 120_000);
afterAll(async () => {
  await prisma.agentRun.deleteMany({ where: { clientId: OUHERS_CLIENT_ID } });
  await prisma.notification.deleteMany({ where: { clientId: OUHERS_CLIENT_ID } });
  await prisma.template.deleteMany({ where: { clientId: OUHERS_CLIENT_ID } });
  await prisma.creditLedgerEntry.deleteMany({ where: { clientId: OUHERS_CLIENT_ID } });
  await prisma.invoice.deleteMany({ where: { clientId: OUHERS_CLIENT_ID } });
  await prisma.client.deleteMany({ where: { id: OUHERS_CLIENT_ID } });
});

describe("the ouhers demo seed", () => {
  it("is idempotent and never touches other clients", async () => {
    const first = await counts();
    // 15 projects: one more in Phase S, the estimate waiting for the PM's number.
    // daily: Meta's and TikTok's stored days plus Google Ads (Phase V).
    expect(first).toMatchObject({ projects: 15, daily: 769, users: 6, demoAgents: 3 });
    await seedOuhers({ shift: true });
    expect(await counts()).toEqual(first);
    expect(await prisma.client.count({ where: { id: { not: OUHERS_CLIENT_ID } } })).toBe(other.clients);
    expect(await prisma.project.count({ where: { clientId: { not: OUHERS_CLIENT_ID } } })).toBe(other.projects);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: OUHERS_CLIENT_ID } })).isDemo).toBe(true);
  }, 120_000);

  it("keeps Holiday's work in progress away from the client", async () => {
    const maja = await prisma.clientUser.findFirstOrThrow({ where: { clientId: OUHERS_CLIENT_ID, user: { email: "maja@ouhers.demo" } }, include: { user: true } });
    const wip = await prisma.asset.findMany({ where: { projectId: "ouhers-p05-holiday-giftset" } });
    expect(wip.length).toBe(2);
    expect(wip.every((a) => a.sentVersion === null)).toBe(true);
    expect(await loadReviewAssets("ouhers-p05-holiday-giftset", OUHERS_CLIENT_ID)).toEqual([]);
    setMockSession({ user: { id: maja.user.id, role: "CLIENT" } });
    const res = await downloadAsset(new Request(`http://x/api/assets/${wip[0].id}/download`), { params: Promise.resolve({ assetId: wip[0].id }) });
    expect(res.status).toBe(404);
    // Q4 is with the client: 12 ads plus the copy table, one concept approved.
    const q4 = await loadReviewAssets("ouhers-p04-q4-cloudcream", OUHERS_CLIENT_ID);
    expect(q4.length).toBe(16);
    expect(q4.filter((a) => a.status === "APPROVED").length).toBeGreaterThanOrEqual(4);
  });

  it("seeds the brand film as two videos with timecoded comments, ranges, a pin and a Klingit note", async () => {
    const id = "ouhers-p12-brand-film";
    const project = await prisma.project.findUniqueOrThrow({ where: { id } });
    expect([project.type, project.status]).toEqual(["MOTION_VIDEO", "AWAITING_REVIEW"]);
    const review = (await loadReview(id, OUHERS_CLIENT_ID))!;
    const videos = review.items.filter((i) => i.kind === "video");
    expect(videos.map((v) => [v.size, v.version, v.durationSeconds, v.video?.fps, v.video?.hasAudio])).toEqual([
      ["9:16", 1, 15, 30, true],
      ["1:1", 1, 15, 30, true],
    ]);
    expect(videos[0].video?.poster).toContain("part=poster");
    expect(videos[0].video?.strip).toContain("part=strip");
    // Numbered in timecode order, like the pack's pins 1–4.
    const t = review.threads.map((th) => [th.number, th.timestamp, th.timestampEnd, th.pin ? [Math.round(th.pin.x), Math.round(th.pin.y)] : null, th.messages[0].fromClient, th.messages.length]);
    expect(t).toEqual([
      [1, 2, 5.4, null, true, 1],
      [2, 9.4, null, [33, 63], true, 1],
      [3, 10.6, 12.4, null, true, 2],
      [4, 12.4, null, null, false, 1],
    ]);
    // QC on v1: the safe-zone flag was fixed before sending; staff see it, nothing blocks, the client sees no flag.
    const v1 = await prisma.assetVersion.findFirstOrThrow({ where: { assetId: videos[0].id, number: 1 }, include: { flags: true } });
    expect(v1.state).toBe("SENT_TO_CLIENT");
    expect(fixedBeforeSend(v1).map((f) => f.checkKey)).toEqual(["safe_zone"]);
    expect(blockingFlags(v1)).toEqual([]);
    expect(JSON.stringify(review)).not.toContain("Reels UI zone");

    // The client can fetch the poster and the strip, and the film in ranges.
    const maja = await prisma.clientUser.findFirstOrThrow({ where: { clientId: OUHERS_CLIENT_ID, user: { email: "maja@ouhers.demo" } }, include: { user: true } });
    setMockSession({ user: { id: maja.user.id, role: "CLIENT" } });
    const get = (q: string, headers: Record<string, string> = {}) => downloadAsset(new Request(`http://x/api/assets/${videos[0].id}/download?${q}`, { headers }), { params: Promise.resolve({ assetId: videos[0].id }) });
    expect((await get("part=poster")).headers.get("content-type")).toBe("image/jpeg");
    expect((await get("part=strip")).status).toBe(200);
    const ranged = await get("inline=1", { Range: "bytes=0-99" });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toMatch(/^bytes 0-99\/\d+$/);
    expect((await ranged.arrayBuffer()).byteLength).toBe(100);
  });

  it("an asset's page: CTR against the client's own average, its rank and its other sizes; only sent work", async () => {
    const top = await prisma.asset.findFirstOrThrow({ where: { clientId: OUHERS_CLIENT_ID, performanceCtr: { not: null } }, orderBy: { performanceCtr: "desc" } });
    const d = (await loadAssetDetail(top.id, OUHERS_CLIENT_ID))!;
    // 11 measured in the pack, the 3 the Phase Q layer measures for the Output library badges, and 4 more ads that
    // ran (Phase U).
    expect(d.performance).toMatchObject({ ctr: 1.77, rank: 1, of: 18 });
    expect(d.performance!.clientAvg).toBeCloseTo(1.08, 1);
    expect(d.performance!.siblings.map((s) => s.format)).toEqual(["Feed · 4:5", "Square · 1:1", "Link ad 1.91:1"]);
    // The tier is relative to the client: their best ad is a top performer even at 1.77%.
    expect(performanceTierFor(1.77, d.performance!.clientAvg).label).toBe("Top performer");
    expect(performanceTierFor(1.77).label).toBe("Below avg");
    // Work in progress (Holiday, not sent) has no page; nor does another client's asset.
    const wip = await prisma.asset.findFirstOrThrow({ where: { projectId: "ouhers-p05-holiday-giftset" } });
    expect(await loadAssetDetail(wip.id, OUHERS_CLIENT_ID)).toBeNull();
    expect(await loadAssetDetail(top.id, "some-other-client")).toBeNull();
  });

  it("reads Insights from its own seeded days, never the live ad accounts", async () => {
    live.calls = 0;
    const paid = await loadPaidMedia(OUHERS_CLIENT_ID);
    // Phase V: Meta and Google Ads (TikTok's token expired, so it has no numbers in the last 30 days).
    expect(paid.connected.sort()).toEqual(["Google", "Meta"]);
    const daily = await loadDaily(OUHERS_CLIENT_ID, 30);
    expect(daily.has).toBe(true);
    expect(await syncDailyAdMetrics(OUHERS_CLIENT_ID, { force: true })).toMatchObject({ skipped: "demo account" });
    expect(live.calls).toBe(0);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: OUHERS_CLIENT_ID } });
    expect((await runMarketIntelligence(client)).error).toContain("demo account");
  });

  it("Phase S: on a contract, with the pricing page's balances, invoices, a pending pack and an estimate for the PM", async () => {
    const c = await prisma.contract.findFirstOrThrow({ where: { clientId: OUHERS_CLIENT_ID }, include: { contact: { include: { user: true } } } });
    expect([c.platformPlanKey, c.teamPackKey, c.termMonths, c.invoicing, c.currency, c.contact?.user.name, c.startDate.getDate()]).toEqual(["enterprise", "pmc20_40", 12, "quarterly", "EUR", "Teddy W.", 1]);
    const b = (await teamBalances(OUHERS_CLIENT_ID))!;
    expect([b.pm.left, b.pm.monthly, b.creative.left, b.creative.monthly]).toEqual([14, 20, 31, 40]);
    expect([b.creative.carried, b.creative.services, b.creative.used]).toEqual([20, 15, 14]);
    const ai = await aiCreditStatus(OUHERS_CLIENT_ID);
    expect([ai.left, ai.allowance]).toEqual([240, 3000]);
    const inv = await prisma.invoice.findMany({ where: { clientId: OUHERS_CLIENT_ID, contractId: c.id }, orderBy: { periodStart: "asc" } });
    expect(inv.map((i) => i.status)).toEqual(["PAID", "SENT"]);
    expect(await prisma.purchaseRequest.count({ where: { clientId: OUHERS_CLIENT_ID, kind: "creative_pack", status: "pending" } })).toBe(1);
    const today = await loadToday({ mine: false, clientIds: [OUHERS_CLIENT_ID] });
    expect(today.tasks.filter((i) => i.kind === "ESTIMATE" && i.clientId === OUHERS_CLIENT_ID && /number/.test(i.sentence))).toHaveLength(1);
    expect(today.tasks.some((i) => i.kind === "PLAN")).toBe(true);
    expect(await prisma.assetVersion.count({ where: { state: "QC_READY", asset: { clientId: OUHERS_CLIENT_ID } } })).toBeGreaterThan(0);
  });

  it("Phase U: 92% of Enterprise's AI with a real cost per run, 8 messages with Teddy, and ~60 outputs in every category", async () => {
    const ai = await aiCreditStatus(OUHERS_CLIENT_ID);
    expect([ai.used, ai.allowance]).toEqual([2760, 3000]);
    expect((await prisma.billingProfile.findUniqueOrThrow({ where: { clientId: OUHERS_CLIENT_ID } })).autoTopUp).toBe(false);
    const runs = await prisma.aiCreditLedger.findMany({ where: { clientId: OUHERS_CLIENT_ID, kind: "USAGE", sourceType: "skill" }, select: { amount: true, costUsd: true, model: true } });
    expect(runs.every((r) => r.costUsd != null && Math.max(1, Math.ceil(r.costUsd / 0.01 - 1e-9)) === -r.amount)).toBe(true);
    expect(new Set(runs.map((r) => r.model))).toEqual(new Set(["claude-sonnet-5-5", "claude-haiku-5-5"]));

    const maja = await prisma.user.findUniqueOrThrow({ where: { email: "maja@ouhers.demo" } });
    const thread = await loadPmThread(OUHERS_CLIENT_ID, maja.id);
    expect(thread.filter((m) => m.source === "general")).toHaveLength(5);
    expect(thread.find((m) => m.body === "Saw them! Will review tomorrow morning.")?.project?.name).toBe("Brand film: dewy by default");
    expect(thread.at(-1)?.fromKlingit).toBe(true);

    const lib = await loadOutputLibrary(OUHERS_CLIENT_ID);
    expect(lib.total).toBeGreaterThanOrEqual(55);
    for (const c of CATEGORIES) expect(lib.categoryCounts[c] ?? 0).toBeGreaterThan(0);
    const decksAndPrint = lib.items.filter((i) => i.category === "Presentations" || i.category === "Print");
    expect(decksAndPrint.some((i) => i.info.kind === "used")).toBe(true);
    // Decks and print never get ad numbers (CTR, views); revenue linked through their UTM tags is fine (Phase V).
    expect(decksAndPrint.every((i) => !/CTR|views/.test(i.info.text))).toBe(true);
    expect(lib.items.filter((i) => i.info.kind === "add").length).toBeGreaterThan(0);
  });

  it("Phase V: the Revenue tab adds up: €226k online + €186k retail = €412k, €89k spend, the same totals under every credit model", async () => {
    const r = await loadRevenue(OUHERS_CLIENT_ID, { days: 90 });
    expect(Math.round(r.funnels.online.revenue)).toBe(226000);
    expect(Math.round(r.funnels.retail.revenue)).toBe(186000);
    expect(Math.round(r.tiles.revenue.value)).toBe(412000);
    expect(Math.round(r.tiles.roas.spend)).toBe(89000);
    expect(r.tiles.roas.value!.toFixed(1)).toBe("4.6");
    expect(Math.round(r.tiles.revenue.change! * 100)).toBe(18);
    expect(Math.round(r.tiles.perCustomer.online!)).toBe(31);
    expect(r.funnels.online.steps.map((x) => Math.round(x.value))).toEqual([6199999, 147969, 121000, 4310].map((v, i) => (i < 2 ? expect.any(Number) : v)));
    expect(r.funnels.retail.steps.map((x) => x.value)).toEqual([1240, 578, 74, 31]);
    expect(r.biggestDrop).toMatchObject({ path: "retail", from: "Qualified", to: "Deals" });
    // The channel table is the same money: its revenue and spend add up to the tiles.
    expect(Math.round(r.tables.channel.reduce((a, c) => a + c.revenue, 0))).toBe(412000);
    expect(Math.round(r.tables.channel.reduce((a, c) => a + (c.spend ?? 0), 0))).toBe(89000);
    expect(r.tables.channel.find((c) => c.name === "Retail fairs")!.return!).toBeLessThan(1);
    expect(r.tables.channel.find((c) => c.name === "Unattributed")).toMatchObject({ orders: 190 });
    expect(r.work.map((w) => Math.round(w.revenue))).toEqual([71000, 58000, 39000, 9000]);
    expect(r.blind.map((b) => b.text).join(" ")).toMatch(/TikTok: token expired/);
    for (const model of ["first", "last"] as const) {
      const m = await loadRevenue(OUHERS_CLIENT_ID, { days: 90, model });
      expect(Math.round(m.tiles.revenue.value)).toBe(412000);
      expect(m.tables.channel.find((c) => c.name === "Meta")!.revenue).not.toBeCloseTo(r.tables.channel.find((c) => c.name === "Meta")!.revenue, 0);
    }
  });
});
