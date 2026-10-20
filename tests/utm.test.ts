import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";
import { projectUtmSlug, readUtm, slugify, taggedLinkForAsset, taggedLinkForOutput } from "@/lib/utm";
import { saveOutputLinkAction } from "@/lib/actions/tagged-link-actions";
import { campaignsToMap, setCampaignMapping } from "@/lib/campaign-mapping";
import { outputNumbers } from "@/lib/output-library";

/** Phase V: UTMs on everything Klingit ships, the campaign mapping join, and numbers per piece of work. */

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
let ad: string;
let page: string;
let p1: string;
const link = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { website: "ouhers.com" } });
  p1 = (await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Q4: cloud cream push", type: "CAMPAIGN", status: "IN_PRODUCTION" } })).id;
  ad = (await prisma.asset.create({ data: { clientId: fx.clientA.id, projectId: p1, name: "Whipped, weightless", format: "Story 9:16", platform: "Meta", category: "Ads", status: "DELIVERED", sentVersion: 1 } })).id;
  page = (await prisma.asset.create({ data: { clientId: fx.clientA.id, projectId: p1, name: "Cloud cream PDP", format: "Product page", category: "Web", status: "DELIVERED", sentVersion: 1 } })).id;
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { clientId: fx.clientA.id } });
  await fx.cleanup();
});

describe("UTMs", () => {
  it("a project's slug is set once, unique within the client, and survives a rename", async () => {
    expect(slugify("Q4: cloud cream push")).toBe("q4-cloud-cream-push");
    expect(await projectUtmSlug(p1)).toBe("q4-cloud-cream-push");
    const twin = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Q4: Cloud Cream Push!", type: "CAMPAIGN", status: "IN_PRODUCTION" } });
    expect(await projectUtmSlug(twin.id)).toBe("q4-cloud-cream-push-2");
    await prisma.project.update({ where: { id: p1 }, data: { name: "Q4: cloud cream, renamed" } });
    expect(await projectUtmSlug(p1)).toBe("q4-cloud-cream-push");
  });

  it("an ad gets source, medium, campaign = project slug and content = its id, on the client's website", async () => {
    const t = (await taggedLinkForAsset(ad, fx.clientA.id))!;
    expect(t.params).toEqual({ source: "meta", medium: "paid_social", campaign: "q4-cloud-cream-push", content: ad });
    expect(t.url).toBe(`https://ouhers.com/?utm_source=meta&utm_medium=paid_social&utm_campaign=q4-cloud-cream-push&utm_content=${ad}`);
    expect(readUtm(t.url)).toEqual({ source: "meta", medium: "paid_social", campaign: "q4-cloud-cream-push", content: ad });
    // A web page is the destination itself; another client never gets a link to it.
    expect(await taggedLinkForAsset(page, fx.clientA.id)).toBeNull();
    expect(await taggedLinkForAsset(ad, fx.clientB.id)).toBeNull();
  });

  it("an admin sets where it points; UTMs already on that link are replaced by the piece's own", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    expect(await saveOutputLinkAction({}, link({ kind: "asset", id: ad, url: "ouhers.com/cloud-cream?utm_source=x&ref=1" }))).toEqual({ ok: "Link saved." });
    const t = (await taggedLinkForAsset(ad, fx.clientA.id))!;
    expect(t.url).toBe(`https://ouhers.com/cloud-cream?ref=1&utm_source=meta&utm_medium=paid_social&utm_campaign=q4-cloud-cream-push&utm_content=${ad}`);
    expect((await saveOutputLinkAction({}, link({ kind: "asset", id: ad, url: "not a link" }))).error).toMatch(/web address/);
    // Client B can't touch client A's piece.
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    expect((await saveOutputLinkAction({}, link({ kind: "asset", id: ad, url: "evil.com" }))).error).toBe("Not found.");
  });

  it("what a skill made is tagged with the skill's slug", async () => {
    const o = await prisma.skillOutput.create({ data: { clientId: fx.clientA.id, title: "dew drop · launch caption", format: "Caption", channel: "Instagram", text: "Glass skin." } });
    const t = (await taggedLinkForOutput(o.id, fx.clientA.id))!;
    expect(t.params).toMatchObject({ source: "instagram", campaign: "skill-skill", content: o.id });
  });
});

describe("campaign mapping and numbers per piece", () => {
  it("staff map a campaign to a project; its stored numbers follow; unmapped is Unattributed; logged", async () => {
    const day = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    await prisma.metricDaily.createMany({
      data: [
        { clientId: fx.clientA.id, date: day, source: "Meta", channel: "Meta", campaignId: "c1", campaignName: "Q4 cloud cream push · always on", metric: "spend", value: 500 },
        { clientId: fx.clientA.id, date: day, source: "Meta", channel: "Meta", campaignId: "c1", campaignName: "Q4 cloud cream push · always on", metric: "clicks", value: 40 },
      ],
    });
    const before = await campaignsToMap(fx.clientA.id);
    expect(before.campaigns[0]).toMatchObject({ campaignId: "c1", spend: 500, mapped: null, suggested: "q4-cloud-cream-push" });
    await setCampaignMapping(fx.clientA.id, "Meta", "c1", "q4-cloud-cream-push", fx.adminUser.id);
    expect(await prisma.metricDaily.count({ where: { clientId: fx.clientA.id, campaignId: "c1", utmCampaign: "q4-cloud-cream-push" } })).toBe(2);
    await setCampaignMapping(fx.clientA.id, "Meta", "c1", "", fx.adminUser.id);
    expect(await prisma.metricDaily.count({ where: { clientId: fx.clientA.id, campaignId: "c1", utmCampaign: "" } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { clientId: fx.clientA.id, area: "campaign-mapping" } })).toBe(2);
  });

  it("revenue credited to a piece is the average of first and last touch (shared)", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const row = (model: string, metric: string, value: number) => ({ clientId: fx.clientA.id, date: day, source: "Shopify", channel: "Meta", utmContent: ad, outputId: ad, path: "online", model, metric, value, currency: "EUR" });
    await prisma.metricDaily.createMany({ data: [row("first", "revenue", 1000), row("last", "revenue", 3000), row("first", "orders", 10), row("last", "orders", 30)] });
    expect((await outputNumbers(fx.clientA.id)).get(ad)).toMatchObject({ revenue: 2000, orders: 20, currency: "EUR" });
    expect((await outputNumbers(fx.clientB.id)).size).toBe(0);
  });
});
