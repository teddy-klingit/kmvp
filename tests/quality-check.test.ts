import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Uploads go to a throwaway folder; the AI half of the check returns whatever a test sets.
const qc = vi.hoisted(() => ({ vision: [] as { key: string; label: string; source: string; passed: boolean; flag?: { label: string; detail: string } }[] }));
vi.hoisted(() => {
  process.env.UPLOADS_DIR = `${process.env.TMPDIR ?? "/tmp"}/klingit-qc-test-uploads`;
});
vi.mock("@/lib/qc/vision-check", () => ({ visionChecks: async () => ({ results: qc.vision, runId: null }) }));

import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { saveUpload } from "@/lib/uploads";
import { acceptFlag, addAssetVersion, clientCheckSummary, loadQcSet, qcGate, sendFlagToDesigner, sendToClient } from "@/lib/qc/quality-check";
import { recheckSentVersions, runBrandCheck } from "@/lib/qc/brand-check";
import { specChecks } from "@/lib/qc/specs";
import { imageSize } from "@/lib/qc/image-size";
import { loadReviewAssets } from "@/lib/review-assets";
import { approveAssetAction } from "@/lib/actions/project-actions";
import { GET as downloadAsset } from "@/app/api/assets/[assetId]/download/route";
import { GET as downloadVersion } from "@/app/api/assets/[assetId]/versions/[number]/route";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

/** The header bytes of a PNG of this size: enough for the size check. */
function png(width: number, height: number) {
  const b = Buffer.alloc(64);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

async function upload(projectId: string, by: string, a: { name?: string; format?: string; assetId?: string; width: number; height: number }) {
  const saved = await saveUpload(projectId, new File([png(a.width, a.height)], "ad.png", { type: "image/png" }));
  const v = await addAssetVersion({ projectId, clientId: fx.clientA.id, assetId: a.assetId ?? null, name: a.name ?? "", format: a.format ?? "", file: saved, uploadedByUserId: by });
  await runBrandCheck(v!.id);
  return prisma.assetVersion.findUniqueOrThrow({ where: { id: v!.id }, include: { flags: true } });
}

async function project(name: string) {
  return prisma.project.create({ data: { clientId: fx.clientA.id, name, type: "CAMPAIGN", status: "IN_PRODUCTION" } });
}

const asClient = () => setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });
const asStaff = () => setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
const fetchAsset = (assetId: string) => downloadAsset(new Request(`http://x/api/assets/${assetId}/download`), { params: Promise.resolve({ assetId }) });
const fetchVersion = (assetId: string, n: number) => downloadVersion(new Request(`http://x/api/assets/${assetId}/versions/${n}`), { params: Promise.resolve({ assetId, number: String(n) }) });

beforeAll(async () => {
  fx = await createSecurityFixtures();
  await prisma.client.update({ where: { id: fx.clientA.id }, data: { accountLeadId: fx.adminStaff.id } });
});
afterAll(async () => {
  await fx.cleanup();
});

describe("Brand OS check: platform specs", () => {
  it("reads the size of an image from its bytes", () => {
    expect(imageSize(png(1080, 1920))).toEqual({ width: 1080, height: 1920 });
  });

  it("flags a wrong ratio, a wrong banner size and a heavy banner", () => {
    const flagged = (format: string, width: number, height: number, sizeBytes = 40_000) =>
      specChecks({ format, platform: null, mimeType: "image/png", sizeBytes, width, height })
        .filter((c) => !c.passed)
        .map((c) => c.flag?.label);
    expect(flagged("Story 9:16", 1080, 1920)).toEqual([]);
    expect(flagged("Story 9:16", 1200, 628)).toEqual(["Wrong ratio"]);
    expect(flagged("Banner 300×250", 600, 500)).toEqual([]);
    expect(flagged("Banner 300×250", 300, 260)).toEqual(["Wrong size"]);
    expect(flagged("Banner 300×250", 300, 250, 400_000)).toEqual(["File too heavy"]);
  });
});

describe("version visibility per role", () => {
  it("a client can't see or fetch a version before it's sent, and keeps the sent one while the next is checked", async () => {
    qc.vision = [];
    const p = await project("QC visibility");
    const v1 = await upload(p.id, fx.creatorUser.id, { name: "Beach hero", format: "Story 9:16", width: 1080, height: 1920 });
    expect(v1.state).toBe("QC_READY");

    asClient();
    expect((await fetchAsset(v1.assetId)).status).toBe(404);
    expect((await fetchVersion(v1.assetId, 1)).status).toBe(404);
    expect(await loadReviewAssets(p.id, fx.clientA.id)).toEqual([]);
    await prisma.project.update({ where: { id: p.id }, data: { status: "AWAITING_REVIEW" } });
    const fd = new FormData();
    fd.set("assetId", v1.assetId);
    await approveAssetAction(fd);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: v1.assetId } })).status).toBe("IN_REVIEW");
    await prisma.project.update({ where: { id: p.id }, data: { status: "IN_PRODUCTION" } });

    asStaff();
    expect((await fetchVersion(v1.assetId, 1)).status).toBe(200);
    expect(await sendToClient(p.id, fx.adminUser.id)).toMatchObject({ ok: true, sent: 1 });

    asClient();
    expect((await fetchAsset(v1.assetId)).status).toBe(200);
    expect((await fetchVersion(v1.assetId, 1)).status).toBe(200);
    expect((await loadReviewAssets(p.id, fx.clientA.id)).map((a) => a.name)).toEqual(["Beach hero"]);

    // The designer uploads v2: staff see it, the client still has v1 and can't fetch v2.
    const v2 = await upload(p.id, fx.creatorUser.id, { assetId: v1.assetId, width: 720, height: 1280 });
    expect(v2.number).toBe(2);
    expect((await fetchVersion(v1.assetId, 2)).status).toBe(404);
    const served = Buffer.from(await (await fetchAsset(v1.assetId)).arrayBuffer());
    expect(imageSize(served)).toEqual({ width: 1080, height: 1920 });
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: v1.assetId } });
    expect([asset.sentVersion, asset.version]).toEqual([1, 2]);
    asStaff();
    expect((await fetchVersion(v1.assetId, 2)).status).toBe(200);
  });
});

describe("the send gate", () => {
  it("open flags block sending; accept as is needs a reason; a flag sent to the designer comes back as a new version; the maker can't send", async () => {
    asStaff();
    const p = await project("QC gate");
    qc.vision = [{ key: "safe_zone", label: "Platform safe zone", source: "Platform safe zone", passed: false, flag: { label: "CTA under UI", detail: "CTA sits under the Reels UI" } }];
    const summer = await upload(p.id, fx.creatorUser.id, { name: "Summer picks", format: "Story 9:16", width: 1080, height: 1920 });
    qc.vision = [];
    const app = await upload(p.id, fx.creatorUser.id, { name: "App hero", format: "Story 9:16", width: 1200, height: 628 });
    expect(summer.flags.map((f) => f.label)).toEqual(["CTA under UI"]);
    expect(app.flags.map((f) => f.label)).toEqual(["Wrong ratio"]);

    let gate = qcGate(await loadQcSet(p.id), fx.adminUser.id);
    expect(gate.canSend).toBe(false);
    expect(gate.blockers.join(" ")).toContain("Fix or accept the 2 flags");
    expect(await sendToClient(p.id, fx.adminUser.id)).toHaveProperty("error");
    expect(await prisma.assetVersion.count({ where: { projectId: p.id, state: "SENT_TO_CLIENT" } })).toBe(0);

    // Accept as is: refused without a reason, logged with one.
    expect(await acceptFlag(summer.flags[0].id, fx.adminUser.id, "  ")).toHaveProperty("error");
    expect((await prisma.qcFlag.findUniqueOrThrow({ where: { id: summer.flags[0].id } })).status).toBe("OPEN");
    expect(await acceptFlag(summer.flags[0].id, fx.adminUser.id, "Client asked for the CTA there")).toEqual({ ok: true });
    const log = await prisma.decisionLog.findFirstOrThrow({ where: { projectId: p.id, action: { startsWith: "Accepted as is" } } });
    expect(log.reason).toBe("Client asked for the CTA there");

    // Send to designer: the version goes back to draft and the set can't go.
    await sendFlagToDesigner(app.flags[0].id, fx.adminUser.id);
    expect((await prisma.assetVersion.findUniqueOrThrow({ where: { id: app.id } })).state).toBe("DRAFT");
    gate = qcGate(await loadQcSet(p.id), fx.adminUser.id);
    expect(gate.blockers.join(" ")).toContain("1 back with the designer");

    // The fixed version passes; the designer who made it still can't send it, someone else can.
    const fixed = await upload(p.id, fx.creatorUser.id, { assetId: app.assetId, width: 1080, height: 1920 });
    expect(fixed.flags).toEqual([]);
    expect(qcGate(await loadQcSet(p.id), fx.creatorUser.id).canSend).toBe(false);
    expect(await sendToClient(p.id, fx.creatorUser.id)).toHaveProperty("error");
    expect(qcGate(await loadQcSet(p.id), fx.adminUser.id).canSend).toBe(true);
    expect(await sendToClient(p.id, fx.adminUser.id)).toMatchObject({ ok: true, sent: 2 });

    // The client is told, the timeline has the event, and the chip lists what was checked without any reason.
    const note = await prisma.notification.findFirstOrThrow({ where: { projectId: p.id, userId: fx.userA.id } });
    expect(note.type).toBe("APPROVAL_NEEDED");
    expect(await prisma.comment.count({ where: { projectId: p.id, kind: "SYSTEM", body: { contains: "quality checked" } } })).toBe(1);
    const summary = await clientCheckSummary(p.id);
    expect(summary.total).toBeGreaterThan(0);
    expect(JSON.stringify(summary)).not.toContain("Client asked");
    expect(JSON.stringify(summary)).not.toContain("CTA under UI");
  });
});

describe("a check that fails after sending", () => {
  it("goes to the PM, never the client", async () => {
    asStaff();
    qc.vision = [];
    const p = await project("QC late");
    await upload(p.id, fx.creatorUser.id, { name: "Product shot", format: "Static 1:1", width: 1080, height: 1080 });
    await sendToClient(p.id, fx.adminUser.id);
    const clientNotes = await prisma.notification.count({ where: { userId: fx.userA.id } });

    // The Brand OS changed: the tone rule now fails on work the client already has.
    qc.vision = [{ key: "tone", label: "Tone of voice", source: "Brand OS · voice rules", passed: false, flag: { label: "Off tone", detail: "Headline breaks the new voice rule" } }];
    expect(await recheckSentVersions(fx.clientA.id)).toBeGreaterThan(0);
    const late = await prisma.qcFlag.findFirstOrThrow({ where: { projectId: p.id, late: true } });
    expect(late.detail).toBe("Headline breaks the new voice rule");
    expect(await prisma.notification.count({ where: { userId: fx.adminUser.id, projectId: p.id, title: { contains: "no longer passes" } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: fx.userA.id } })).toBe(clientNotes);
    // The client's view is unchanged: still sent, nothing new.
    const v = await prisma.assetVersion.findFirstOrThrow({ where: { projectId: p.id } });
    expect(v.state).toBe("SENT_TO_CLIENT");
    expect(JSON.stringify(await clientCheckSummary(p.id))).not.toContain("Off tone");
    qc.vision = [];
  });
});
