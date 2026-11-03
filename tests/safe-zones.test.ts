import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { safeZoneFor, safeZonePrompt } from "@/lib/safe-zones";
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
    expect(safeZonePrompt("Feed 4:5")).toBe("");
  });

  it("the in-context story frame shades the dead areas only when asked", () => {
    const props = { src: "/x.png", alt: "ad", ratio: 9 / 16, brand: "ouhers", caption: "c", format: "Story 9:16" };
    expect(renderToStaticMarkup(createElement(InContext, props))).not.toContain("UI covers this");
    expect(renderToStaticMarkup(createElement(InContext, { ...props, safeZones: true }))).toContain("UI covers this");
    expect(renderToStaticMarkup(createElement(InContext, { ...props, ratio: 0.8, format: "Feed 4:5", safeZones: true }))).not.toContain("UI covers this");
  });
});
