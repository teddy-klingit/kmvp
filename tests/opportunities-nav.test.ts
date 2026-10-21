import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import nextConfig from "../next.config";
import { PlaceholderTag, StaffTagsProvider } from "@/components/ds/placeholder-tag";

/** Phase W step 1: Opportunities in the main nav, the old URLs redirect, and no Placeholder or demo tags for clients. */
describe("Opportunities has its own place", () => {
  it("is in the client nav between Planner and Insights, with a count of new ones", () => {
    const nav = readFileSync("src/components/portal/sidebar.tsx", "utf8");
    const order = ["/planner\"", "/opportunities\"", "/insights\""].map((h) => nav.indexOf(`href: "${h}`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expect(nav).toMatch(/badge: summary\.opportunities/);
  });

  it("the old Planner URLs redirect to /opportunities", async () => {
    const rules = (await nextConfig.redirects!()) as { source: string; destination: string }[];
    const to = (source: string) => rules.find((r) => r.source === source)?.destination;
    expect(to("/planner/opportunities")).toBe("/opportunities");
    expect(to("/planner/opportunities/:id")).toBe("/opportunities/:id");
  });

  it("nothing links to /planner/opportunities any more", () => {
    const hits = execSync("grep -rln '/planner/opportunities' src || true", { encoding: "utf8" }).trim();
    expect(hits).toBe("");
  });
});

describe("no Placeholder or demo tags on the client side", () => {
  it("the Placeholder tag shows for staff and not inside the client portal", () => {
    expect(renderToStaticMarkup(createElement(PlaceholderTag, null, "Prices"))).toContain("Prices");
    expect(renderToStaticMarkup(createElement(StaffTagsProvider, { show: false }, createElement(PlaceholderTag, null, "Prices")))).toBe("");
    expect(readFileSync("src/app/(portal)/layout.tsx", "utf8")).toMatch(/<StaffTagsProvider show=\{false\}>/);
  });

  it("no client page or component says “demo data” or “· demo”", () => {
    const hits = execSync(`grep -rniE 'demo data|· demo|"demo"\\s*:|>demo<|Demo link' "src/app/(portal)" src/components/portal src/components/insights || true`, { encoding: "utf8" })
      .split("\n")
      .filter((l) => l && !/^\S+:\d+:\s*(\/\/|\*|\/\*)/.test(l));
    expect(hits).toEqual([]);
  });
});
