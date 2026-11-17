import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { askKey, tabFindings, upsertInsight } from "@/lib/insight-records";
import { askForIdeaAction } from "@/lib/actions/insight-actions";
import { listOpportunities } from "@/lib/opportunities";
import { keepsNumbers, shortAnswer } from "@/lib/insights/short-answer";
import { hrefAliases } from "@/lib/insights/tabs";

/** Phase X2: the parts every Insights tab is built from. */
type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

describe("the short answer", () => {
  it("is the template when AI wording is off (tests), so it's never missing or wrong", () => {
    const t = "Your ads brought €61k in sales on €30.6k (2.0×).";
    expect(shortAnswer("client:paid:30", t)).toBe(t);
  });

  it("a reworded answer must keep every number and add none", () => {
    const t = "Reach fell 9% because you posted 4 Reels instead of 9.";
    expect(keepsNumbers("You posted 4 Reels instead of 9, so reach fell 9%.", t)).toBe(true);
    expect(keepsNumbers("Reach fell 9% with 4 Reels.", t)).toBe(false);
    expect(keepsNumbers("Reach fell 12% because you posted 4 Reels instead of 9.", t)).toBe(false);
  });
});

describe("a tab's findings", () => {
  it("finds the tab's findings under its new and old address, and only this client's", async () => {
    const a = await upsertInsight(fx.clientA.id, { key: "test:x2-old-href", kind: "data", title: "Saves on ritual posts", value: "+64%", sources: ["Meta"], href: "/insights/audience" });
    const n = await upsertInsight(fx.clientA.id, { key: "test:x2-new-href", kind: "data", title: "Reels reach 3× more", value: "3×", sources: ["Meta"], href: "/insights/organic" });
    await upsertInsight(fx.clientA.id, { key: "test:x2-other-tab", kind: "data", title: "Email opens", value: "41%", sources: ["Klaviyo"], href: "/insights/email" });
    await upsertInsight(fx.clientB.id, { key: "test:x2-b", kind: "data", title: "B's organic secret", value: "9%", sources: ["Meta"], href: "/insights/organic" });
    const found = await tabFindings(fx.clientA.id, hrefAliases("/insights/organic"));
    expect(found.map((f) => f.insight.id).sort()).toEqual([a.id, n.id].sort());
    expect(found.every((f) => f.used.length === 0 && f.askedAt === null)).toBe(true);
  });
});

describe("Ask for an idea", () => {
  it("creates one hidden request linked to the finding and messages the PM; asking again adds nothing", async () => {
    const i = await upsertInsight(fx.clientA.id, { key: "test:x2-ask", kind: "data", title: "“Is it safe for sensitive skin?” asked 94 times", value: "94", sources: ["Instagram"], href: "/insights/organic" });
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const f = new FormData();
    f.set("insightId", i.id);
    expect(await askForIdeaAction({}, f)).toEqual({ ok: true });
    expect(await askForIdeaAction({}, f)).toEqual({ ok: true });
    const asks = await prisma.opportunity.findMany({ where: { clientId: fx.clientA.id, sourceKey: askKey(i.id) }, include: { insights: true } });
    expect(asks).toHaveLength(1);
    expect(asks[0].hiddenAt).not.toBeNull();
    expect(asks[0].insights.map((x) => x.insightId)).toEqual([i.id]);
    // Hidden from the client until the PM has written it up.
    expect((await listOpportunities(fx.clientA.id)).some((o) => o.id === asks[0].id)).toBe(false);
    const [found] = await tabFindings(fx.clientA.id, ["/insights/organic"], { take: 1 });
    expect(found.insight.id).toBe(i.id);
    expect(found.askedAt).not.toBeNull();
  });

  it("can't ask about another client's finding", async () => {
    const b = await upsertInsight(fx.clientB.id, { key: "test:x2-ask-b", kind: "data", title: "B only", value: "1", sources: ["Meta"] });
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const f = new FormData();
    f.set("insightId", b.id);
    expect((await askForIdeaAction({}, f)).error).toBeTruthy();
    expect(await prisma.opportunity.count({ where: { sourceKey: askKey(b.id) } })).toBe(0);
  });
});
