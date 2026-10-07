import { describe, it, expect } from "vitest";
import { typefaces } from "@/lib/brand-typography";

describe("Brand OS typography", () => {
  it("reads plain lines and brand-pack objects the same way", () => {
    expect(typefaces(["Inter — body copy", ""])).toEqual([{ family: "Inter", detail: null, text: "Inter — body copy" }]);
    expect(typefaces([{ family: "Instrument Sans", use: "Body, UI", weights: [400, 600], source: "Google Fonts" }])).toEqual([
      { family: "Instrument Sans", detail: "Body, UI · weights 400, 600 · Google Fonts", text: "Instrument Sans — Body, UI · weights 400, 600 · Google Fonts" },
    ]);
    expect(typefaces(null)).toEqual([]);
    expect(typefaces([42, { nope: true }])).toEqual([]);
  });
});
