import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSecurityFixtures } from "./fixtures";
import { setMockSession } from "./setup";
import { categoryFor } from "@/lib/output-categories";
import { loadOutputLibrary } from "@/lib/output-library";
import { addOutputFactAction } from "@/lib/actions/output-fact-actions";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;
const ids: Record<string, string> = {};

beforeAll(async () => {
  fx = await createSecurityFixtures();
  const p = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Q4 retail", type: "CAMPAIGN", status: "DELIVERED" } });
  const mk = async (key: string, data: { name: string; format: string; type?: "IMAGE" | "VIDEO" | "COPY"; platform?: string; performanceCtr?: number; performanceViews?: number }) => {
    const a = await prisma.asset.create({ data: { projectId: p.id, clientId: fx.clientA.id, status: "DELIVERED", sentVersion: 1, ...data } });
    await prisma.assetVersion.create({ data: { assetId: a.id, projectId: p.id, number: 1, state: "APPROVED", sentAt: new Date() } });
    ids[key] = a.id;
  };
  await mk("deck", { name: "Q4 retail sell-in deck", format: "Presentation 16:9" });
  await mk("poster", { name: "Retail poster 50×70", format: "Poster" });
  await mk("ad", { name: "dew drop static", format: "Static 1:1", platform: "Meta", performanceCtr: 1.9 });
  await mk("zero", { name: "Gift card", format: "Print 85×55", performanceViews: 0 });
});
afterAll(async () => {
  await fx.cleanup();
});

describe("Output library for every kind of work", () => {
  it("maps a category from format, type, channel and project type", () => {
    expect(categoryFor({ format: "Story 9:16", channel: "Meta" })).toBe("Ads");
    expect(categoryFor({ format: "Carousel 1:1", channel: "Instagram" })).toBe("Social");
    expect(categoryFor({ format: "Presentation 16:9" })).toBe("Presentations");
    expect(categoryFor({ format: "Story 9:16", type: "VIDEO" })).toBe("Video & motion");
    expect(categoryFor({ format: "A5", title: "Department store shelf talker" })).toBe("Print");
    expect(categoryFor({ format: "SVG", title: "Ingredient icons" })).toBe("Illustration");
    expect(categoryFor({ format: "Email", type: "COPY" })).toBe("Copy & email");
    expect(categoryFor({ format: "85×55", title: "Gift card" })).toBe("Print"); // not a "gif"
    expect(categoryFor({ format: "Product page", projectType: "DEVELOPMENT" })).toBe("Web");
  });

  it("under each piece: how it performed, how it was used, or '+ Add how it did'; never a zero", async () => {
    const lib = await loadOutputLibrary(fx.clientA.id);
    const by = (id: string) => lib.items.find((i) => i.id === id)!;
    expect(by(ids.ad)).toMatchObject({ category: "Ads", info: { kind: "performed", text: "CTR 1.9%" } });
    expect(by(ids.deck)).toMatchObject({ category: "Presentations", info: { kind: "add" } });
    expect(by(ids.zero).info.kind).toBe("add"); // 0 views is no data, not "0 views"
    expect(lib.categoryCounts).toMatchObject({ Ads: 1, Presentations: 1, Print: 2 });
  });

  it("'+ Add how it did' saves a fact on the piece, for its own client only", async () => {
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    const deny = new FormData();
    for (const [k, v] of Object.entries({ key: `a_${ids.poster}`, label: "Printed", value: "2000" })) deny.set(k, v);
    expect((await addOutputFactAction({}, deny)).error).toBeTruthy();
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    expect(await addOutputFactAction({}, deny)).toEqual({ ok: "Saved." });
    const lib = await loadOutputLibrary(fx.clientA.id);
    expect(lib.items.find((i) => i.id === ids.poster)!.info).toEqual({ kind: "used", text: "Printed: 2,000" });
  });
});
