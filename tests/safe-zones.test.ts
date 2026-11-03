import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { safeZoneFor, safeZonePrompt } from "@/lib/safe-zones";
import { pickSize } from "@/lib/ai/generate-image";
import { InContext } from "@/components/review/in-context";

/** The platform's dead areas: Stories and Reels have them, feed placements don't. */
describe("safe zones", () => {
  it("knows Stories, Reels and feed apart", () => {
    expect(safeZoneFor("Story 9:16")).toMatchObject({ kind: "story", top: 0.14, bottom: 0.2, side: 0 });
    expect(safeZoneFor("9:16 for Stories/Reels")).toMatchObject({ kind: "reel", bottom: 0.35, side: 0.06 });
    expect(safeZoneFor("Reel / video")).toMatchObject({ kind: "reel" });
    expect(safeZoneFor(9 / 16)).toMatchObject({ kind: "story" });
    for (const f of ["Feed 4:5", "Square 1:1", "Landscape 16:9", "Carousel 4:5", null]) expect(safeZoneFor(f)).toBeNull();
  });

  it("tells the image model to keep words, logo and CTA out of the bands (and says nothing for feed)", () => {
    const p = safeZonePrompt("Story 9:16");
    expect(p).toMatch(/top 14% and the bottom 20%/);
    expect(p).toMatch(/every word, the logo, the call to action/);
    // Feed has no UI bands, but every format keeps its margins from the edges.
    expect(safeZonePrompt("Feed 4:5")).toMatch(/^MARGINS: .*at least 7% of the width in from the left and right edges and the top and bottom/);
    expect(p).toMatch(/at least 7% of the width in from the left and right edges/);
    expect(safeZonePrompt("Reel / video")).toMatch(/at least 7%/);
  });

  it("images are made at the placement's exact shape, so nothing is cropped in the frame", () => {
    const ratio = (s: string) => s.split("x").map(Number).reduce((w, h) => w / h);
    expect(ratio(pickSize("9:16 for Stories/Reels"))).toBeCloseTo(9 / 16, 2);
    expect(ratio(pickSize("Story 9:16"))).toBeCloseTo(9 / 16, 2);
    expect(ratio(pickSize("4:5 feed"))).toBeCloseTo(4 / 5, 2);
    expect(ratio(pickSize("16:9 blog header"))).toBeCloseTo(16 / 9, 2);
    expect(pickSize("1:1 for feed")).toBe("1024x1024");
    for (const s of ["9:16", "4:5", "16:9", "1.91:1 link", "2:3"]) expect(pickSize(s).split("x").every((n) => Number(n) % 16 === 0)).toBe(true);
  });

  it("the in-context story frame shades the dead areas only when asked", () => {
    const props = { src: "/x.png", alt: "ad", ratio: 9 / 16, brand: "ouhers", caption: "c", format: "Story 9:16" };
    expect(renderToStaticMarkup(createElement(InContext, props))).not.toContain("UI covers this");
    expect(renderToStaticMarkup(createElement(InContext, { ...props, safeZones: true }))).toContain("UI covers this");
    expect(renderToStaticMarkup(createElement(InContext, { ...props, ratio: 0.8, format: "Feed 4:5", safeZones: true }))).not.toContain("UI covers this");
  });
});
