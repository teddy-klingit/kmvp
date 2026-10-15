import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { CLIENT_TABS } from "@/components/ops/client/client-tabs";

describe("client page: 5 tabs, nothing lost", () => {
  it("has exactly Overview · Projects · Plan · Contract & billing · Brand", () => {
    expect(CLIENT_TABS.map((t) => t.label)).toEqual(["Overview", "Projects", "Plan", "Contract & billing", "Brand"]);
  });

  it("every older client view is reachable under one of the tabs", () => {
    const dir = path.join(__dirname, "../src/app/ops/clients/[clientId]/(workspace)");
    const views = readdirSync(dir).filter((f) => statSync(path.join(dir, f)).isDirectory());
    const reachable = new Set(CLIENT_TABS.flatMap((t) => [t.path, ...t.sub.map((s) => s.path)]));
    expect(views.filter((v) => !reachable.has(v))).toEqual([]);
  });
});
