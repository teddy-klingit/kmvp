import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { approveAllAssetsAction, approveAssetAction, postCommentAction } from "@/lib/actions/project-actions";
import { postProjectEvent } from "@/lib/project-events";
import { loadProjectConversation } from "@/lib/project-conversation";
import { getPortalViewer } from "@/lib/current-viewer";
import type { AssetStatus, ProjectStatus } from "@/generated/prisma";
import { ensureAssetVersions } from "@/lib/qc/backfill";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

const asA = () => setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

async function projectWith(status: ProjectStatus, assets: AssetStatus[]) {
  const project = await prisma.project.create({ data: { clientId: fx.clientA.id, name: `Review ${status}`, type: "CAMPAIGN", status } });
  const created = [];
  for (const [i, s] of assets.entries()) {
    created.push(await prisma.asset.create({ data: { projectId: project.id, clientId: fx.clientA.id, name: `Asset ${i + 1}`, format: "Static 1:1", status: s } }));
  }
  // Their first versions: sent if the project is with the client, else still in the quality check.
  await ensureAssetVersions(prisma);
  return { project, assets: created };
}

const statusOf = async (id: string) => (await prisma.asset.findUniqueOrThrow({ where: { id } })).status;
const events = (projectId: string) => prisma.comment.findMany({ where: { projectId, kind: "SYSTEM" }, select: { body: true } });

describe("Work tab review actions", () => {
  it("an asset still in Klingit's QA (project in production) can't be approved by the client", async () => {
    asA();
    const { project, assets } = await projectWith("IN_PRODUCTION", ["IN_REVIEW"]);
    await approveAssetAction(form({ assetId: assets[0].id }));
    await approveAllAssetsAction(form({ projectId: project.id }));
    expect(await statusOf(assets[0].id)).toBe("IN_REVIEW");
    expect(await events(project.id)).toEqual([]);
  });

  it("approving one asset at a time moves the project on only when the last open asset is approved", async () => {
    asA();
    const { project, assets } = await projectWith("AWAITING_REVIEW", ["IN_REVIEW", "IN_REVIEW", "APPROVED"]);
    await approveAssetAction(form({ assetId: assets[0].id }));
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe("AWAITING_REVIEW");
    await approveAssetAction(form({ assetId: assets[1].id }));
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe("IN_FEEDBACK");
    expect(await events(project.id)).toEqual([{ body: "All assets approved" }]);
  });

  it("'Approve N in review' leaves assets with requested changes alone, so the round stays open", async () => {
    asA();
    const { project, assets } = await projectWith("AWAITING_REVIEW", ["IN_REVIEW", "CHANGES_REQUESTED"]);
    await approveAllAssetsAction(form({ projectId: project.id }));
    expect(await statusOf(assets[0].id)).toBe("APPROVED");
    expect(await statusOf(assets[1].id)).toBe("CHANGES_REQUESTED");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe("AWAITING_REVIEW");
  });

  it("another client can't approve the asset", async () => {
    const { assets } = await projectWith("AWAITING_REVIEW", ["IN_REVIEW"]);
    setMockSession({ user: { id: fx.userB.id, role: "CLIENT" } });
    await approveAssetAction(form({ assetId: assets[0].id }));
    expect(await statusOf(assets[0].id)).toBe("IN_REVIEW");
  });
});

describe("Conversation context chips", () => {
  it("stores an asset context only when the asset belongs to the project", async () => {
    asA();
    const { project, assets } = await projectWith("AWAITING_REVIEW", ["IN_REVIEW"]);
    const other = await projectWith("AWAITING_REVIEW", ["IN_REVIEW"]);
    await postCommentAction(form({ projectId: project.id, body: "Bigger logo?", contextKind: "asset", contextRef: assets[0].id, contextLabel: "On Asset 1" }));
    await postCommentAction(form({ projectId: project.id, body: "Wrong asset", contextKind: "asset", contextRef: other.assets[0].id, contextLabel: "On elsewhere" }));
    await postCommentAction(form({ projectId: project.id, body: "Made up", contextKind: "invoice", contextRef: "x", contextLabel: "On invoice" }));
    const rows = await prisma.comment.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.body, r.contextKind, r.assetId])).toEqual([
      ["Bigger logo?", "asset", assets[0].id],
      ["Wrong asset", null, null],
      ["Made up", null, null],
    ]);
  });

  it("caps the label at 120 characters", async () => {
    asA();
    await postCommentAction(form({ projectId: fx.projectA.id, body: "About the brief", contextKind: "brief", contextLabel: "x".repeat(300) }));
    const row = await prisma.comment.findFirstOrThrow({ where: { projectId: fx.projectA.id, body: "About the brief" } });
    expect(row.contextLabel).toHaveLength(120);
  });

  it("system events show in the thread but never count as unread", async () => {
    asA();
    const { project } = await projectWith("AWAITING_REVIEW", []);
    await postProjectEvent(project.id, "Estimate v1 sent");
    const viewer = await getPortalViewer();
    const convo = await loadProjectConversation(project.id, viewer, [{ name: "Sara N." }]);
    expect(convo.klingit.map((m) => [m.kind, m.body])).toEqual([["SYSTEM", "Estimate v1 sent"]]);
    expect(convo.unread.klingit).toBe(0);
  });

  it("the thread hint reads naturally for one person and for several", async () => {
    asA();
    const viewer = await getPortalViewer();
    const one = await loadProjectConversation(fx.projectA.id, viewer, [{ name: "Sara N." }]);
    const two = await loadProjectConversation(fx.projectA.id, viewer, [{ name: "Sara N." }, { name: "Marcus L." }]);
    expect(one.hints.klingit).toBe("Sara sees this thread.");
    expect(two.hints.klingit).toBe("Sara and Marcus see this thread.");
  });
});
