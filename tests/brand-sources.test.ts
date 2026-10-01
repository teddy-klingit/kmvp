import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createElement, Fragment, isValidElement, cloneElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { addSourceFromAppAction, addSourceLinkAction, connectDemoAppAction, removeSourceAction } from "@/lib/actions/brand-source-actions";
import { brandSourcesForAgents, listBrandSources } from "@/lib/brand-sources-data";
import { detectApp, normaliseUrl } from "@/lib/brand-sources";
import { buildBrandContext } from "@/lib/ai/brand-context";
import SourcesPage from "@/app/(portal)/assets/sources/page";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

const asA = () => setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
const asB = () => setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};

async function resolve(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (!isValidElement(node)) return node;
  const { type, props } = node as ReactElement<{ children?: ReactNode }>;
  if (typeof type === "function" && type.constructor.name === "AsyncFunction") return resolve(await (type as (p: unknown) => Promise<ReactNode>)(props));
  if (props?.children === undefined) return node;
  return cloneElement(node, undefined, await resolve(props.children));
}
const html = async (el: Promise<ReactNode>) => renderToStaticMarkup(createElement(Fragment, null, await resolve(await el)));

describe("linked sources", () => {
  it("detects the app from the domain", () => {
    expect(detectApp("https://drive.google.com/drive/folders/abc")).toBe("google_drive");
    expect(detectApp("https://docs.google.com/presentation/d/1")).toBe("google_drive");
    expect(detectApp("https://www.figma.com/file/x/Klarna-DS")).toBe("figma");
    expect(detectApp("https://klarna.notion.site/Brand-123")).toBe("notion");
    expect(detectApp("https://www.dropbox.com/scl/fo/x")).toBe("dropbox");
    expect(detectApp("https://klarna.sharepoint.com/sites/brand")).toBe("sharepoint");
    expect(detectApp("https://www.canva.com/design/x")).toBe("canva");
    expect(detectApp("https://app.frame.io/reviews/x")).toBe("frameio");
    expect(detectApp("https://www.klarna.com/brand")).toBe("web");
  });

  it("only stores http(s) links", () => {
    expect(normaliseUrl("figma.com/file/x")).toBe("https://figma.com/file/x");
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseUrl("data:text/html,hi")).toBeNull();
    expect(normaliseUrl("not a link")).toBeNull();
  });

  it("a pasted link is stored for the signed-in client with the detected app and section", async () => {
    asA();
    const r = await addSourceLinkAction({}, form({ url: "https://www.figma.com/file/abc/Klarna-Design-System", section: "visual-identity" }));
    expect(r.ok).toBeTruthy();
    const [s] = await listBrandSources(fx.clientA.id, "visual-identity");
    expect(s).toMatchObject({ app: "figma", section: "visual-identity", isDemo: false, title: "Klarna Design System" });
  });

  it("client B can't see client A's sources", async () => {
    asA();
    await addSourceLinkAction({}, form({ url: "https://drive.google.com/drive/folders/secret-a", title: "A's secret folder" }));
    asB();
    const page = await html(SourcesPage({ searchParams: Promise.resolve({}) }));
    expect(page).not.toContain("A&#x27;s secret folder");
    expect(page).not.toContain("secret-a");
    expect(await brandSourcesForAgents(fx.clientB.id)).not.toContain("secret");
  });

  it("client B can't add to or remove client A's sources", async () => {
    asA();
    await connectDemoAppAction({}, form({ app: "figma", file: ["fg-ds"] }));
    const aSource = (await listBrandSources(fx.clientA.id)).find((s) => s.title === "Klarna Design System" && s.isDemo)!;

    asB();
    // B adding anything only ever writes to B's own client.
    await addSourceLinkAction({}, form({ url: "https://www.notion.so/b-page", section: "vision" }));
    expect((await listBrandSources(fx.clientA.id)).some((s) => s.url.includes("b-page"))).toBe(false);
    // B can't pin from A's connected Figma: B has no connection of their own.
    const pin = await addSourceFromAppAction({}, form({ app: "figma", file: "fg-ds", section: "vision" }));
    expect(pin.error).toMatch(/Connect/);
    // B removing A's source by id does nothing.
    await removeSourceAction(form({ sourceId: aSource.id }));
    expect((await prisma.brandSource.findUniqueOrThrow({ where: { id: aSource.id } })).archivedAt).toBeNull();
  });

  it("removing a chip archives the source (never deletes)", async () => {
    asA();
    await addSourceLinkAction({}, form({ url: "https://www.dropbox.com/s/x/shoot", title: "Shoot", section: "mission" }));
    const s = (await listBrandSources(fx.clientA.id, "mission"))[0];
    await removeSourceAction(form({ sourceId: s.id }));
    expect(await listBrandSources(fx.clientA.id, "mission")).toEqual([]);
    expect((await prisma.brandSource.findUniqueOrThrow({ where: { id: s.id } })).archivedAt).not.toBeNull();
  });

  it("agents get titles, apps, URLs and sections, never contents", async () => {
    const block = await brandSourcesForAgents(fx.clientA.id);
    expect(block).toContain("Klarna Design System (Figma, demo link)");
    expect(block).toContain("[Visual identity]: https://www.figma.com/file/abc/Klarna-Design-System");
    expect(block).toMatch(/contents are not available/);
    const ctx = buildBrandContext({ name: "A", industry: null, brandSummary: null }, null, block);
    expect(ctx).toContain("Linked brand sources");
  });
});
