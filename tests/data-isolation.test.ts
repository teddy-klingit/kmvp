import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";

// What the assistant would be told, captured instead of calling the model.
const asked = vi.hoisted(() => ({ calls: [] as { clientId: string; liveCampaigns?: { campaignName: string }[]; dataContext?: string[] }[], answer: "ok" }));
vi.mock("@/lib/ai/agents/market-intelligence-agent", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/agents/market-intelligence-agent")>()),
  answerMarketIntelligenceQuestion: async (args: { clientId: string; liveCampaigns?: { campaignName: string }[]; dataContext?: string[] }) => {
    asked.calls.push(args);
    return { ok: true, data: { answer: asked.answer } };
  },
}));

import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { getMetaAdAccountInsights, getMetaDailyInsights } from "@/lib/integrations/meta-ads";
import { getLinkedInAdInsights } from "@/lib/integrations/linkedin-ads";
import { syncDailyAdMetrics } from "@/lib/integrations/ad-daily";
import { askMarketIntelligenceQuestionAction } from "@/lib/actions/market-intelligence-actions";
import { clientDataContext } from "@/lib/data-context";
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
        ? { data: [{ campaign_id: "a1", campaign_name: SECRET, date_start: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), impressions: "1000", clicks: "20", spend: "50" }] }
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
    // Ask your data reads the data layer (Phase V): both clients' syncs run first, only A's account answers for A.
    await syncDailyAdMetrics(fx.clientA.id, { force: true });
    await syncDailyAdMetrics(fx.clientB.id, { force: true });
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    await askMarketIntelligenceQuestionAction({}, question());
    expect(asked.calls).toHaveLength(1);
    expect(asked.calls[0].clientId).toBe(fx.clientB.id);
    expect(JSON.stringify(asked.calls[0])).not.toContain(SECRET);

    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    await askMarketIntelligenceQuestionAction({}, question());
    expect(asked.calls[1].liveCampaigns?.map((c) => c.campaignName)).toEqual([SECRET]);
  });

  it("Phase V: Ask your data's one context (data layer, Planner, Output library, Brand OS) never holds another client's data", async () => {
    fakeMeta();
    await syncDailyAdMetrics(fx.clientA.id, { force: true });
    await prisma.metricDaily.create({ data: { clientId: fx.clientA.id, date: new Date().toISOString().slice(0, 10), source: "Shopify", channel: SECRET, path: "online", model: "last", metric: "revenue", value: 98765, currency: "EUR" } });
    const b = await clientDataContext(fx.clientB.id);
    expect(b.lines.join(" ")).not.toContain(SECRET);
    expect(b.pool).not.toContain(98765);
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    await askMarketIntelligenceQuestionAction({}, question());
    expect(JSON.stringify(asked.calls.at(-1))).not.toContain(SECRET);
    // Client A's own context has it.
    expect((await clientDataContext(fx.clientA.id)).lines.join(" ")).toContain(SECRET);
    await prisma.metricDaily.deleteMany({ where: { clientId: fx.clientA.id, source: "Shopify" } });
  });

  it("Phase V: a number the data doesn't hold never reaches the answer; the answer keeps its sources and data size", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    asked.answer = "Your best campaign is Client A's secret campaign. It made 31337 euros last month.";
    const r = await askMarketIntelligenceQuestionAction({}, question());
    expect(r.answer).not.toContain("31337");
    expect(r.answer).toContain("Your best campaign is Client A's secret campaign.");
    expect(r.answer).toMatch(/couldn't be checked against your data/);
    expect(r.sources?.length).toBeGreaterThan(0);
    expect(r.dataSize).toBeTruthy();
    const stored = await prisma.marketIntelligenceQuestion.findFirstOrThrow({ where: { clientId: fx.clientA.id }, orderBy: { createdAt: "desc" } });
    expect(stored.answer).not.toContain("31337");
    asked.answer = "ok";
  });

  it("the daily sync never copies client A's campaigns into client B", async () => {
    fakeMeta();
    await syncDailyAdMetrics(fx.clientB.id, { force: true });
    expect(await prisma.metricDaily.count({ where: { clientId: fx.clientB.id } })).toBe(0);
  });

  it("an unowned connection feeds nobody: no client, no assistant, no sync", async () => {
    const fetchSpy = fakeMeta();
    // Unassigning takes the account's synced numbers out of the previous owner's data layer with it.
    expect((await setLiveAdsOwner("meta", null, fx.adminUser.id)).error).toBeNull();
    for (const p of ["linkedin", "google-ads"]) await own(p, null);
    expect(await prisma.metricDaily.count({ where: { clientId: fx.clientA.id, source: "Meta" } })).toBe(0);
    for (const c of [fx.clientA, fx.clientB]) {
      expect((await getMetaAdAccountInsights(c.id)).ok).toBe(false);
      expect((await getMetaDailyInsights(c.id)).ok).toBe(false);
      expect((await getLinkedInAdInsights(c.id)).ok).toBe(false);
      expect((await getGoogleAdsAccountInsights(c.id)).ok).toBe(false);
      await syncDailyAdMetrics(c.id, { force: true });
      expect(await prisma.metricDaily.count({ where: { clientId: c.id } })).toBe(0);
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
