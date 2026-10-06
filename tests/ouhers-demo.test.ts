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

const counts = async () => {
  const where = { clientId: OUHERS_CLIENT_ID };
  return {
    projects: await prisma.project.count({ where }),
    assets: await prisma.asset.count({ where }),
    versions: await prisma.assetVersion.count({ where: { asset: where } }),
    daily: await prisma.adDailyMetric.count({ where }),
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
  await prisma.client.deleteMany({ where: { id: OUHERS_CLIENT_ID } });
});

describe("the ouhers demo seed", () => {
  it("is idempotent and never touches other clients", async () => {
    const first = await counts();
    expect(first).toMatchObject({ projects: 13, daily: 318, users: 4 });
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

  it("reads Insights from its own seeded days, never the live ad accounts", async () => {
    live.calls = 0;
    const paid = await loadPaidMedia(OUHERS_CLIENT_ID);
    expect(paid.connected.sort()).toEqual(["Meta", "TikTok"]);
    const daily = await loadDaily(OUHERS_CLIENT_ID, 30);
    expect(daily.has).toBe(true);
    expect(await syncDailyAdMetrics(OUHERS_CLIENT_ID, { force: true })).toMatchObject({ skipped: "demo account" });
    expect(live.calls).toBe(0);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: OUHERS_CLIENT_ID } });
    expect((await runMarketIntelligence(client)).error).toContain("demo account");
  });
});
