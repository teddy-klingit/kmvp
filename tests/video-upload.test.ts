import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Uploads go to a throwaway folder; the Brand OS check that runs after the response isn't part of this test.
vi.hoisted(() => {
  process.env.UPLOADS_DIR = `${process.env.TMPDIR ?? "/tmp"}/klingit-video-upload-test`;
});
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));

import { readFileSync } from "fs";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { uploadAssetAction } from "@/lib/actions/cockpit-actions";
import { readUpload } from "@/lib/uploads";

type Fx = Awaited<ReturnType<typeof createSecurityFixtures>>;
let fx: Fx;

beforeAll(async () => {
  fx = await createSecurityFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

describe("uploading a video", () => {
  it("stores duration, fps and sound from the file, and the poster and strip drawn in the browser", async () => {
    const project = await prisma.project.create({ data: { clientId: fx.clientA.id, name: "Film upload", type: "MOTION_VIDEO", status: "IN_PRODUCTION" } });
    setMockSession({ user: { id: fx.adminUser.id, role: "INTERNAL" } });
    const mp4 = readFileSync("prisma/demo/ouhers/creatives/p12-brand-film/dewy-by-default-1x1-v1.mp4");
    const jpeg = readFileSync("prisma/demo/ouhers/creatives/p12-brand-film/poster-9x16.jpg");
    const fd = new FormData();
    fd.set("projectId", project.id);
    fd.set("name", "Brand film");
    fd.set("format", "Square 1:1");
    fd.set("file", new File([mp4], "film.mp4", { type: "video/mp4" }));
    fd.set("poster", new File([jpeg], "poster.jpg", { type: "image/jpeg" }));
    fd.set("strip", new File([jpeg], "strip.jpg", { type: "image/jpeg" }));
    // What the browser measured is only a fallback: the MP4 header wins.
    fd.set("durationSeconds", "14.2");
    const r = await uploadAssetAction({}, fd);
    expect(r.error).toBeUndefined();

    const asset = await prisma.asset.findFirstOrThrow({ where: { projectId: project.id }, include: { versions: true } });
    expect([asset.type, asset.durationSeconds]).toEqual(["VIDEO", 15]);
    const v = asset.versions[0];
    expect([v.durationSeconds, v.fps, v.hasAudio, v.width, v.height]).toEqual([15, 30, true, 1080, 1080]);
    expect((await readUpload(v.posterKey!))?.equals(jpeg)).toBe(true);
    expect(v.thumbStripKey).toBeTruthy();
  });
});
