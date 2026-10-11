import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";

// What the assistant would be told, captured instead of calling the model.
const asked = vi.hoisted(() => ({ calls: [] as { clientId: string; liveCampaigns?: { campaignName: string }[] }[] }));
vi.mock("@/lib/ai/agents/market-intelligence-agent", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/agents/market-intelligence-agent")>()),
  answerMarketIntelligenceQuestion: async (args: { clientId: string; liveCampaigns?: { campaignName: string }[] }) => {
    asked.calls.push(args);
    return { ok: true, data: { answer: "ok" } };
  },
}));

import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { getMetaAdAccountInsights, getMetaDailyInsights } from "@/lib/integrations/meta-ads";
import { getLinkedInAdInsights } from "@/lib/integrations/linkedin-ads";
import { syncDailyAdMetrics } from "@/lib/integrations/ad-daily";
import { askMarketIntelligenceQuestionAction } from "@/lib/actions/market-intelligence-actions";
import { getGoogleAdsAccountInsights } from "@/lib/integrations/google-ads";
import { adDataStatus, setLiveAdsOwner, unassignedLiveAdAccounts } from "@/lib/integrations/live-ads-owner";
import PerformancePage from "@/app/(portal)/insights/performance/page";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const SECRET = "Client A's secret campaign";
const env = { ...process.env };
// The test database's own connection rows, put back afterwards.
let saved: Awaited<ReturnType<typeof prisma.integrationConnection.findMany>> = [];
const own = (provider: string, clientId: string | null) =>
  prisma.integrationConnection.upsert({ where: { provider }, update: { clientId }, create: { provider, clientId, accessToken: provider === "meta" ? "" : "isolation-test" } });

/** A live Meta account that answers with client A's campaign to anyone who asks. */
function fakeMeta() {
  const fetchSpy = vi.fn(async (url: string) => {
    const body = url.includes("/insights")
      ? url.includes("time_increment")
        ? { data: [{ campaign_id: "a1", campaign_name: SECRET, date_start: "2026-10-01", impressions: "1000", clicks: "20", spend: "50" }] }
        : { data: [{ campaign_id: "a1", campaign_name: SECRET, impressions: "1000", clicks: "20", ctr: "2", spend: "50" }] }
      : url.includes("/ads?")
        ? { data: [] }
        : { name: "A's ad account", currency: "SEK" };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

const question = () => {
  const f = new FormData();
  f.set("question", "Which campaign did best?");
  return f;
};

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.client.updateMany({ where: { id: { in: [fx.clientA.id, fx.clientB.id] } }, data: { paidMediaInScope: true, isSampleAccount: false, isDemo: false } });
  process.env.META_ADS_ACCESS_TOKEN = "test-token";
  process.env.META_AD_ACCOUNT_ID = "act_test";
  saved = await prisma.integrationConnection.findMany();
  await own("meta", fx.clientA.id);
});
afterEach(() => {
  vi.unstubAllGlobals();
  asked.calls = [];
});
afterAll(async () => {
  process.env = env;
  await prisma.integrationConnection.deleteMany({});
  if (saved.length) await prisma.integrationConnection.createMany({ data: saved });
  await prisma.auditLog.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
});

describe("live ad data belongs to one client", () => {
  it("client B never reads the live account that belongs to client A", async () => {
    const fetchSpy = fakeMeta();
    expect(await getMetaAdAccountInsights(fx.clientB.id)).toEqual({ ok: false, reason: "not_configured" });
    expect(await getMetaDailyInsights(fx.clientB.id)).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
    const own = await getMetaAdAccountInsights(fx.clientA.id);
    expect(own.ok && own.campaigns.map((c) => c.campaignName)).toEqual([SECRET]);
  });

  it("an IntegrationConnection is read only by the client it belongs to", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await prisma.integrationConnection.upsert({ where: { provider: "linkedin" }, update: { clientId: fx.clientA.id, accessToken: "isolation-test" }, create: { provider: "linkedin", clientId: fx.clientA.id, accessToken: "isolation-test" } });
    expect(await getLinkedInAdInsights(fx.clientB.id)).toEqual({ ok: false, reason: "not_connected" });
  });

  it("Ask your data never gives client B client A's campaigns", async () => {
    fakeMeta();
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    await askMarketIntelligenceQuestionAction({}, question());
    expect(asked.calls).toHaveLength(1);
    expect(asked.calls[0].clientId).toBe(fx.clientB.id);
    expect(JSON.stringify(asked.calls[0])).not.toContain(SECRET);

    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    await askMarketIntelligenceQuestionAction({}, question());
    expect(asked.calls[1].liveCampaigns?.map((c) => c.campaignName)).toEqual([SECRET]);
  });

  it("the daily sync never copies client A's campaigns into client B", async () => {
    fakeMeta();
    await syncDailyAdMetrics(fx.clientB.id, { force: true });
    expect(await prisma.adDailyMetric.count({ where: { clientId: fx.clientB.id } })).toBe(0);
  });

  it("an unowned connection feeds nobody: no client, no assistant, no sync", async () => {
    const fetchSpy = fakeMeta();
    for (const p of ["meta", "linkedin", "google-ads"]) await own(p, null);
    for (const c of [fx.clientA, fx.clientB]) {
      expect((await getMetaAdAccountInsights(c.id)).ok).toBe(false);
      expect((await getMetaDailyInsights(c.id)).ok).toBe(false);
      expect((await getLinkedInAdInsights(c.id)).ok).toBe(false);
      expect((await getGoogleAdsAccountInsights(c.id)).ok).toBe(false);
      await syncDailyAdMetrics(c.id, { force: true });
      expect(await prisma.adDailyMetric.count({ where: { clientId: c.id } })).toBe(0);
      expect(await adDataStatus(c.id)).toBe("none");
    }
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    await askMarketIntelligenceQuestionAction({}, question());
    expect(asked.calls[0].liveCampaigns ?? []).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Staff are told: every connected account without an owner is listed.
    expect((await unassignedLiveAdAccounts()).map((a) => a.provider)).toEqual(["meta", "linkedin", "google-ads"]);
    await own("meta", fx.clientA.id);
  });

  it("a client without an ad account gets one clear empty state, not charts of zeros", async () => {
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    const el = (await PerformancePage({ searchParams: Promise.resolve({}) })) as unknown as { type: { name: string } };
    expect(el.type.name).toBe("NoAdAccount");
  });

  it("assigning an owner is logged, and never takes an account from another client", async () => {
    await own("meta", null);
    expect(await setLiveAdsOwner("meta", fx.clientB.id, fx.userA.id)).toEqual({ error: null });
    expect((await setLiveAdsOwner("meta", fx.clientA.id, fx.userA.id)).error).toMatch(/Unassign it there first/);
    expect(await setLiveAdsOwner("meta", null, fx.userA.id)).toEqual({ error: null });
    const log = await prisma.auditLog.findMany({ where: { area: "ad-accounts", clientId: fx.clientB.id }, orderBy: { createdAt: "asc" } });
    expect(log.map((l) => [(l.before as { ownerId: string | null }).ownerId, (l.after as { ownerId: string | null }).ownerId])).toEqual([
      [null, fx.clientB.id],
      [fx.clientB.id, null],
    ]);
    expect(log.every((l) => l.actorUserId === fx.userA.id)).toBe(true);
    await own("meta", fx.clientA.id);
  });
});
