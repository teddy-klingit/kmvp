import { describe, expect, it } from "vitest";
import { answerCard, pickTiles, validPick, type Signal } from "@/lib/insights/short-answer";

const signals: Signal[] = [
  { id: "sales", status: "good", value: "+18%", label: "Sales from marketing, now €141k", weight: 3 },
  { id: "reach", status: "attention", value: "−9%", label: "Organic reach, because of fewer Reels", weight: 1.9 },
  { id: "email", status: "good", value: "+12%", label: "Sales from email", weight: 0.6 },
  { id: "ai", status: "watch", value: "31% vs 18%", label: "Plume Skin is named more than you in AI answers", weight: 1.5 },
];

describe("Phase X 2b: the short answer is a headline and 3 tiles", () => {
  it("picks the 3 strongest signals, in the order the tab lists them", () => {
    expect(pickTiles(signals).map((s) => s.id)).toEqual(["sales", "reach", "ai"]);
    expect(pickTiles(signals.slice(0, 2)).map((s) => s.id)).toEqual(["sales", "reach"]);
  });

  it("uses the code's headline and pick when AI wording is off (tests)", () => {
    const card = answerCard("c:overview:30", { headline: "Sales are up. Organic reach and AI visibility need attention.", signals });
    expect(card.headline).toBe("Sales are up. Organic reach and AI visibility need attention.");
    expect(card.tiles.map((t) => t.value)).toEqual(["+18%", "−9%", "31% vs 18%"]);
  });

  it("only keeps an AI pick with real ids, a short headline and the signals' own numbers", () => {
    const fallback = "Sales are up.";
    expect(validPick({ headline: "Sales are up 18%. Reach needs attention.", ids: ["sales", "reach", "ai"] }, signals, fallback, 3)).toBe(true);
    expect(validPick({ headline: "Seven moments are still open.", ids: ["sales", "reach", "ai"] }, signals, fallback, 3)).toBe(false);
    expect(validPick({ headline: "Sales are up 25%.", ids: ["sales", "reach", "ai"] }, signals, fallback, 3)).toBe(false);
    expect(validPick({ headline: "Sales are up.", ids: ["sales", "reach", "nope"] }, signals, fallback, 3)).toBe(false);
    expect(validPick({ headline: "Sales are up.", ids: ["sales", "sales", "ai"] }, signals, fallback, 3)).toBe(false);
    expect(validPick({ headline: "Sales are up.", ids: ["sales", "ai"] }, signals, fallback, 3)).toBe(false);
    expect(validPick({ headline: "one two three four five six seven eight nine ten eleven twelve thirteen", ids: ["sales", "reach", "ai"] }, signals, fallback, 3)).toBe(false);
  });
});
