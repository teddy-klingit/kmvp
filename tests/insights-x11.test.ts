import { describe, expect, it } from "vitest";
import { iconLinks, siteDomain } from "@/lib/competitor-logo";
import { adTag, moveKind } from "@/lib/insights/market-tabs";
import { monogramColor } from "@/components/insights/brand-mark";

describe("Phase X 2b: competitor logos", () => {
  it("keeps only public host names from a typed website", () => {
    expect(siteDomain("https://www.plumeskin.com/se?x=1")).toBe("plumeskin.com");
    expect(siteDomain("dewlab.se")).toBe("dewlab.se");
    expect(siteDomain("Plume Skin")).toBeNull();
    expect(siteDomain("localhost:3000")).toBeNull();
    expect(siteDomain("127.0.0.1")).toBeNull();
    expect(siteDomain("intranet.corp")).toBeNull();
  });

  it("prefers the apple-touch-icon, then PNG/SVG icons, resolved against the page", () => {
    const html = `<head><link rel="icon" href="/favicon.ico"><link rel="icon" type="image/png" href="/icon-32.png"><link rel="apple-touch-icon" href="https://cdn.example.com/touch.png"><link rel="stylesheet" href="/a.css"></head>`;
    expect(iconLinks(html, "https://example.com/")).toEqual(["https://cdn.example.com/touch.png", "https://example.com/icon-32.png", "https://example.com/favicon.ico"]);
  });

  it("gives a brand without a logo the same monogram colour every time", () => {
    expect(monogramColor("Plume Skin")).toBe(monogramColor("plume skin"));
  });
});

describe("Phase X 2b: type tags", () => {
  it("tags a competitor's move as New product, Price cut or Campaign", () => {
    expect(moveKind("Plume Skin launched a tinted SPF fluid")).toBe("New product");
    expect(moveKind("Dewlab put 20% off all serums")).toBe("Price cut");
    expect(moveKind("Nord Bare launched refill pouches, 2 weeks before yours")).toBe("New product");
    expect(moveKind("Kind Ritual sponsored a podcast")).toBe("Campaign");
  });

  it("tags what they advertise as Launch, Discount, Sustainability or Brand", () => {
    expect(adTag("SPF that disappears")).toBe("Launch");
    expect(adTag("−20% on all serums")).toBe("Discount");
    expect(adTag("refill, don't rebuy")).toBe("Sustainability");
    expect(adTag("Real skin, real people")).toBe("Brand");
  });
});
