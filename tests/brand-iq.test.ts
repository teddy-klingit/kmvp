import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { platformStatus, SECTION_READERS, PLATFORM_SECTIONS } from "@/lib/brand-completeness";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { discardDraftAction } from "@/lib/actions/brand-draft-actions";
import { updateBrandTextDocAction } from "@/lib/actions/brand-doc-actions";
import { AssetTile } from "@/components/portal/asset-tile";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await prisma.brandSectionDraft.deleteMany({ where: { clientId: { in: [fx.clientA.id, fx.clientB.id] } } });
  await fx.cleanup();
});

describe("brand health is computed, never stored", () => {
  it("counts the platform sections that are written", () => {
    const none = platformStatus({ brandSummary: null, brandOS: null });
    expect(none).toMatchObject({ done: 0, total: 8 });
    const two = platformStatus({
      brandSummary: "Pink-first brand",
      brandOS: { vision: null, mission: "Make paying simple", coreValues: [], usps: [], competitiveNote: null, audiencePersonas: [], servicesNote: null, keyProducts: [] },
    });
    expect(two.done).toBe(2);
    expect(two.empty.map((s) => s.slug)).not.toContain("mission");
  });

  it("services & products counts as written with only products listed", () => {
    const s = platformStatus({ brandSummary: null, brandOS: { vision: null, mission: null, coreValues: [], usps: [], competitiveNote: null, audiencePersonas: [], servicesNote: null, keyProducts: ["Pay in 4"] } });
    expect(s.sections.find((x) => x.slug === "services-products")?.done).toBe(true);
  });
});

describe("used by N agents is true", () => {
  it("every section a reader is claimed for is actually in the agents' brand context", () => {
    const ctx = buildBrandContext({ name: "A", industry: null, brandSummary: "S" }, {
      vision: "V-text", mission: "M-text", coreValues: [{ title: "CV-text", description: "d" }], usps: ["U-text"], competitiveNote: "MP-text", servicesNote: "SP-text", keyProducts: [], audiencePersonas: [{ name: "TA-text", description: "d" }],
    } as never);
    for (const needle of ["V-text", "M-text", "CV-text", "U-text", "MP-text", "SP-text", "TA-text"]) expect(ctx).toContain(needle);
    for (const s of PLATFORM_SECTIONS) expect(SECTION_READERS[s.slug].length).toBeGreaterThan(0);
  });
});

describe("agent drafts never save themselves", () => {
  it("a draft stays out of Brand OS until the client saves; saving from it marks it used", async () => {
    const draft = await prisma.brandSectionDraft.create({ data: { clientId: fx.clientA.id, section: "vision", content: "A drafted vision" } });
    expect((await prisma.brandOS.findUnique({ where: { clientId: fx.clientA.id } }))?.vision ?? null).toBeNull();
    setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
    const fd = new FormData();
    fd.set("doc", "vision");
    fd.set("value", "A drafted vision, edited");
    fd.set("draftId", draft.id);
    await updateBrandTextDocAction({}, fd);
    expect((await prisma.brandOS.findUnique({ where: { clientId: fx.clientA.id } }))?.vision).toBe("A drafted vision, edited");
    expect((await prisma.brandSectionDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("USED");
  });

  it("client B can't discard client A's draft", async () => {
    const draft = await prisma.brandSectionDraft.create({ data: { clientId: fx.clientA.id, section: "mission", content: "x" } });
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    const fd = new FormData();
    fd.set("draftId", draft.id);
    await discardDraftAction(fd);
    expect((await prisma.brandSectionDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("PENDING");
  });
});

describe("content library", () => {
  it("shows the asset's own name, not the format twice", () => {
    const html = renderToStaticMarkup(createElement(AssetTile, { name: "Static 1:1 — Product shot", format: "Static 1:1", color: "#ff0000", ctr: null, campaign: "Summer" }));
    expect(html).toContain("Product shot");
    expect(html).not.toMatch(/Static 1:1[^<]*<\/p>\s*<p[^>]*>Static 1:1/);
    expect(html).not.toContain("No data");
  });
});
