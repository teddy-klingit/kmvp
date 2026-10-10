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

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const SECRET = "Client A's secret campaign";
const env = { ...process.env };

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
  process.env.LIVE_ADS_CLIENT_ID = fx.clientA.id;
});
afterEach(() => {
  vi.unstubAllGlobals();
  asked.calls = [];
});
afterAll(async () => {
  process.env = env;
  await prisma.integrationConnection.deleteMany({ where: { provider: "linkedin", accessToken: "isolation-test" } });
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

  it("nobody reads the live account when no owner is set", async () => {
    const fetchSpy = fakeMeta();
    delete process.env.LIVE_ADS_CLIENT_ID;
    expect((await getMetaAdAccountInsights(fx.clientA.id)).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    process.env.LIVE_ADS_CLIENT_ID = fx.clientA.id;
  });
});
