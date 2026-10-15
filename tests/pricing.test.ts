import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { aiTopUpPrice, convertEur, creativePackPrice, loadPricing, monthlyPrice, round5 } from "@/lib/pricing";

afterAll(async () => {
  await prisma.priceOverride.deleteMany({ where: { ref: "plan:pro" } });
});

describe("Phase S prices (placeholders, all from the database)", () => {
  it("seeds Basic €25 / Pro €99 / Enterprise €249 and the six packs plus Per request, all needing Enterprise", async () => {
    const p = await loadPricing();
    expect(p.plans.map((x) => [x.key, x.priceEur, x.aiCreditsPerMonth, x.ownModel])).toEqual([
      // Phase U: AI budgets $3 / $10 / $30 → 300 / 1,000 / 3,000 credits; own Claude works on every plan.
      ["basic", 25, 300, false],
      ["pro", 99, 1000, false],
      ["enterprise", 249, 3000, false],
    ]);
    expect(p.packs.map((x) => [x.key, x.pmCredits, x.creativeCredits, x.priceEur])).toEqual([
      ["pm10", 10, 0, 995],
      ["pm20", 20, 0, 1895],
      ["pm40", 40, 0, 3270],
      ["pmc10_20", 10, 20, 2655],
      ["pmc20_40", 20, 40, 4600],
      ["pmc40_80", 40, 80, 8865],
      ["per_request", 0, 0, null],
    ]);
    expect(new Set(p.packs.map((x) => x.requiresPlanKey))).toEqual(new Set(["enterprise"]));
  });

  it("converts with EUR × rate × 1.02, rounded to the nearest 5; NOK, SEK, GBP and USD", async () => {
    expect(round5(1086.5)).toBe(1085);
    expect(convertEur(99, "SEK", { SEK: 10.76 }, 0.02)).toBe(1085);
    expect(convertEur(249, "SEK", { SEK: 10.76 }, 0.02)).toBe(2735);
    expect(convertEur(249, "EUR", {}, 0.02)).toBe(249);
    const p = await loadPricing();
    expect(p.list("plan:enterprise", 249, "GBP")).toBe(round5(249 * 0.868 * 1.02));
    expect(() => convertEur(1, "NOK", {}, 0.02)).toThrow(/No FX rate/);
  });

  it("a staff override wins over the FX rule", async () => {
    await prisma.priceOverride.create({ data: { ref: "plan:pro", currency: "SEK", amount: 1095 } });
    const p = await loadPricing();
    expect(p.list("plan:pro", 99, "SEK")).toBe(1095);
    expect(monthlyPrice(p, { planKey: "pro", term: 12, currency: "SEK" }).platform).toBe(1095);
  });

  it("adjusts for the term and upfront payment against 12 months, quarterly", async () => {
    const p = await loadPricing();
    const at = (term: number, upfront = false) => monthlyPrice(p, { planKey: "enterprise", packKey: "pmc20_40", term, upfront, currency: "EUR" });
    expect(at(12)).toMatchObject({ platform: 249, team: 4600, total: 4849 });
    expect(at(6)).toMatchObject({ platform: 261, team: 4830 }); // +5%
    expect(at(18)).toMatchObject({ platform: 237, team: 4370 }); // −5%
    expect(at(12, true)).toMatchObject({ platform: 242, team: 4462 }); // −3%
    expect(at(3)).toMatchObject({ platform: 274, team: 5060 }); // +10% (placeholder)
  });

  it("Per request takes the staff-set team price; platform only has no team part", async () => {
    const p = await loadPricing();
    expect(monthlyPrice(p, { planKey: "enterprise", packKey: "per_request", customTeamEur: 1500, term: 12, currency: "EUR" })).toMatchObject({ team: 1500, total: 1749 });
    expect(monthlyPrice(p, { planKey: "enterprise", packKey: "per_request", term: 12, currency: "EUR" })).toMatchObject({ team: null, total: null });
    expect(monthlyPrice(p, { planKey: "pro", term: 12, currency: "EUR" })).toMatchObject({ platform: 99, team: 0, total: 99 });
  });

  it("extra creative packs: the pack's per-credit price + 10% × 10; with no pack the priciest per credit", async () => {
    const p = await loadPricing();
    expect(creativePackPrice(p, "pmc20_40", "EUR")).toEqual({ credits: 10, price: Math.round((4600 / 60) * 1.1 * 10) });
    expect(creativePackPrice(p, null, "EUR")).toEqual({ credits: 10, price: Math.round((995 / 10) * 1.1 * 10) });
    expect(aiTopUpPrice(p, "EUR")).toEqual({ credits: 1000, price: 25 });
  });
});
