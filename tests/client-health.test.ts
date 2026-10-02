import { describe, it, expect } from "vitest";
import { healthFrom, AT_RISK_BELOW } from "@/lib/client-health";
import type { OpsProject } from "@/lib/ops-exceptions";

const NOW = new Date("2026-10-02T10:00:00Z");
const project = (o: { due?: Date; stage?: string; exceptions?: { kind: string }[] }) =>
  ({ state: { stage: o.stage ?? "production", paused: false, keyFacts: { dueDate: o.due ?? null } }, exceptions: o.exceptions ?? [] }) as unknown as OpsProject;

describe("client health is computed from what's happening", () => {
  it("a healthy account scores 100 with no reasons", () => {
    expect(healthFrom({ projects: [project({})], creditBalance: 80, monthlyCreditAllowance: 120, renewalDate: null, brandDone: 6 }, NOW)).toEqual({ score: 100, atRisk: false, reasons: [] });
  });

  it("overdue work, a waiting client and low credits put it at risk, with the reasons", () => {
    const h = healthFrom(
      { projects: [project({ due: new Date("2026-09-28T10:00:00Z"), exceptions: [{ kind: "client_waiting" }] })], creditBalance: 5, monthlyCreditAllowance: 120, renewalDate: new Date("2026-10-10T00:00:00Z"), brandDone: 1 },
      NOW
    );
    expect(h.score).toBeLessThan(AT_RISK_BELOW);
    expect(h.atRisk).toBe(true);
    expect(h.reasons).toEqual(expect.arrayContaining(["1 project past due", "1 waiting or at-risk item", "under 10% of credits left", "renews within 2 weeks", "Brand OS mostly unwritten"]));
  });

  it("never goes below 0", () => {
    const many = Array.from({ length: 10 }, () => project({ due: new Date("2026-09-01T10:00:00Z"), exceptions: [{ kind: "failed_agent" }, { kind: "staffing" }] }));
    expect(healthFrom({ projects: many, creditBalance: -5, monthlyCreditAllowance: 120, renewalDate: new Date("2026-10-05T00:00:00Z"), brandDone: 0 }, NOW).score).toBe(0);
  });
});
