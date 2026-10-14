import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { addPlanItem, briefByFor, loadLeadTimes, movePlanItem, needsBrief, planIcs, sendPlanReminders, startBriefText, subtractWorkingDays, feedTokenFor } from "@/lib/plan";
import { addPlanItemAction } from "@/lib/actions/plan-item-actions";
import { GET as feed } from "@/app/api/plan/ical/[token]/route";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const at = (s: string) => new Date(`${s}T10:00:00`);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await prisma.planFeedToken.deleteMany({ where: { clientId: fx.clientA.id } });
  await fx.cleanup();
});

describe("brief-by = live date − lead time, in working days", () => {
  it("counts working days only", () => {
    expect(ymd(subtractWorkingDays(at("2026-11-11"), 7))).toBe("2026-11-02"); // Wed → Mon of the week before
    expect(ymd(subtractWorkingDays(at("2026-11-02"), 1))).toBe("2026-10-30"); // Mon → Fri
  });

  it("uses the longest lead time among the formats", async () => {
    const lt = await loadLeadTimes();
    // Design 04/05: Singles Day, live Wed 11 Nov, with a reel (10 working days) → brief by Wed 28 Oct.
    expect(ymd(briefByFor(at("2026-11-11"), ["Carousel", "Stories", "Reel / video"], lt).briefBy)).toBe("2026-10-28");
    // Carousel + stories only (7) → Mon 2 Nov.
    expect(briefByFor(at("2026-11-11"), ["Carousel", "Stories"], lt)).toMatchObject({ days: 7, format: "Carousel" });
    // No format: a post's lead time, which comes from the Price List (Phase S): 3 working days there.
    expect(briefByFor(at("2026-11-11"), [], lt).days).toBe(3);
  });

  it("brief-by uses the Price List's lead time when the format points at an item, else the per-format table", async () => {
    const lt = await loadLeadTimes();
    const post = lt.find((l) => l.format === "Post")!;
    expect([post.workingDays, post.fromPriceList]).toEqual([3, true]);
    expect(lt.find((l) => l.format === "Reel / video")).toMatchObject({ workingDays: 10, fromPriceList: false });
    await prisma.priceListItem.update({ where: { sourceKey: "unique_social_media_design_1_post" }, data: { leadTimeDays: null } });
    try {
      expect((await loadLeadTimes()).find((l) => l.format === "Post")).toMatchObject({ workingDays: 5, fromPriceList: false });
    } finally {
      await prisma.priceListItem.update({ where: { sourceKey: "unique_social_media_design_1_post" }, data: { leadTimeDays: 3 } });
    }
  });

  it("a weekend live date counts from the Friday before (design 04: Halloween reel, Sat 31 Oct → Fri 16 Oct)", async () => {
    const lt = await loadLeadTimes();
    expect(ymd(briefByFor(at("2026-10-31"), ["Reel / video"], lt).briefBy)).toBe("2026-10-16");
  });
});

describe("Add to plan is idempotent", () => {
  it("the same request key never makes a second item, even at the same instant", async () => {
    const input = { title: "Halloween glow reel", date: at("2026-10-31"), channels: ["Instagram", "TikTok"], formats: ["Reel / video"], maker: "klingit_help" as const };
    const results = await Promise.all(Array.from({ length: 5 }, () => addPlanItem(fx.clientA.id, fx.userA.id, input, "key-double-click")));
    expect(new Set(results.map((r) => r.item.id)).size).toBe(1);
    expect(await prisma.clientCalendarItem.count({ where: { clientId: fx.clientA.id, requestKey: "key-double-click" } })).toBe(1);
    expect(ymd(results[0].item.briefBy!)).toBe("2026-10-16");
  });

  it("through the dialog's action too", async () => {
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const f = new FormData();
    for (const [k, v] of Object.entries({ title: "Singles Day self-care set", date: "2026-11-11", maker: "klingit_help", requestKey: "dialog-1" })) f.set(k, v);
    f.append("formats", "Carousel");
    f.append("formats", "Stories");
    f.append("channels", "Instagram");
    await addPlanItemAction({}, f);
    await addPlanItemAction({}, f);
    const items = await prisma.clientCalendarItem.findMany({ where: { clientId: fx.clientA.id, requestKey: "dialog-1" } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ maker: "klingit_help", channel: "Instagram" });
  });

  it("dragging recomputes brief-by; another client can't move it", async () => {
    const item = await prisma.clientCalendarItem.findFirstOrThrow({ where: { clientId: fx.clientA.id, requestKey: "key-double-click" } });
    expect(await movePlanItem(fx.clientB.id, item.id, at("2026-11-06"))).toBeNull();
    const moved = await movePlanItem(fx.clientA.id, item.id, at("2026-11-06"));
    expect(ymd(moved!.briefBy!)).toBe("2026-10-23");
  });
});

describe("reminders and Start brief", () => {
  it("reminds once at 7 days, then at 2, then on the day", async () => {
    const now = new Date(2026, 9, 9, 9); // Fri 9 Oct
    const { item } = await addPlanItem(fx.clientA.id, fx.userA.id, { title: "Reminder test", date: at("2026-10-30"), channels: ["Instagram"], formats: ["Carousel"], maker: "klingit_help" }, "remind-1");
    expect(ymd(item.briefBy!)).toBe("2026-10-21"); // 7 working days
    expect(await sendPlanReminders(now, [fx.clientA.id])).toBe(0); // 14 days out: nothing yet
    const seven = new Date(2026, 9, 16, 9);
    expect(await sendPlanReminders(seven, [fx.clientA.id])).toBeGreaterThan(0);
    expect(await sendPlanReminders(seven, [fx.clientA.id])).toBe(0); // once
    const notes = await prisma.notification.findMany({ where: { clientId: fx.clientA.id, title: { contains: "Reminder test" } } });
    expect(notes).toHaveLength(1);
    expect(notes[0].actionUrl).toBe(`/plan?item=${item.id}`);
    expect((await needsBrief(fx.clientA.id, 21, seven)).some((n) => n.item.id === item.id)).toBe(true);
  });

  it("Start brief hands the brief assistant what the plan knows", () => {
    const text = startBriefText({ title: "Singles Day self-care set", date: at("2026-11-11"), endDate: null, channels: ["Instagram", "TikTok"], formats: ["Carousel", "Stories"], notes: "gift set: cloud cream + lip ours", route: "The gift set edit" });
    expect(text).toContain("live 2026-11-11");
    expect(text).toContain("Instagram and TikTok");
    expect(text).toContain("carousel and stories");
    expect(text).toContain("gift set: cloud cream + lip ours");
    expect(text).toContain("The gift set edit");
  });

  it("the private iCal feed lists the plan and brief-by dates; a revoked link stops working", async () => {
    const t = await feedTokenFor(fx.userA.id, fx.clientA.id);
    const res = await feed(new Request("http://x"), { params: Promise.resolve({ token: t.token }) });
    const ics = await res.text();
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("Brief due: Singles Day self-care set");
    const fresh = await feedTokenFor(fx.userA.id, fx.clientA.id, true);
    expect(fresh.token).not.toBe(t.token);
    expect((await feed(new Request("http://x"), { params: Promise.resolve({ token: t.token }) })).status).toBe(404);
    expect(typeof (await planIcs(fx.clientA.id, { id: fx.clientUserA.id }))).toBe("string");
  });
});
