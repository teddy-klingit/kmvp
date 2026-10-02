import { describe, it, expect } from "vitest";
import { assetThumbnail } from "@/lib/insights-data";

describe("report thumbnails", () => {
  it("uses an uploaded image", () => {
    expect(assetThumbnail({ fileUrl: "/api/assets/a1/download?inline=1", mimeType: "image/png", storageKey: "a1/hero.png" })).toBe("/api/assets/a1/download?inline=1");
  });
  it("falls back to the placeholder otherwise", () => {
    // No stored file: the download route would serve a labelled placeholder SVG.
    expect(assetThumbnail({ fileUrl: "/api/assets/a1/download?inline=1", mimeType: "image/png", storageKey: null })).toBeNull();
    expect(assetThumbnail({ fileUrl: "https://picsum.photos/seed/x/200/200", mimeType: "image/jpeg", storageKey: null })).toBeNull();
    expect(assetThumbnail({ fileUrl: "/api/assets/a2/download?inline=1", mimeType: "video/mp4", storageKey: "a2/reel.mp4" })).toBeNull();
    expect(assetThumbnail({ fileUrl: null, mimeType: null, storageKey: null })).toBeNull();
  });
});
