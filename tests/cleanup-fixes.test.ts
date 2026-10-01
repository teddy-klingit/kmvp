import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMockSession } from "./setup";
import { createSecurityFixtures } from "./fixtures";
import { recordPerformanceSnapshots } from "@/lib/integrations/performance-alerts";
import { startBriefFromIntakeAction } from "@/lib/actions/brief-intake-actions";
import type { PlatformCampaign } from "@/lib/performance";

const intakeResult = vi.hoisted(() => ({
  ok: true as const,
  data: {
    suggestedName: "Klarna 10-Slide Deck",
    projectType: "PRESENTATION" as const,
    summary: "A 10-slide deck.",
    clarifyingQuestions: [{ key: "audience", question: "Who is it for?", quickAnswers: ["Investors"] }],
  },
}));
vi.mock("@/lib/ai/agents/intake-agent", () => ({ intakeBrief: vi.fn(async () => intakeResult) }));

function campaign(ctr: number): PlatformCampaign {
  return {
    platform: "LinkedIn",
    accountName: "Test",
    currency: "EUR",
    campaignId: "cmp-1",
    campaignName: "Awareness video",
    impressions: 10_000,
    clicks: Math.round(ctr * 100),
    ctr,
    spend: 100,
    conversions: 0,
    costPerConversion: null,
  };
}

describe("performance drop alerts", () => {
  it("raises one alert for an ongoing drop, not one per check", async () => {
    const fx = await createSecurityFixtures();
    try {
      await prisma.performanceSnapshot.create({
        data: {
          clientId: fx.clientA.id,
          platform: "LinkedIn",
          campaignId: "cmp-1",
          campaignName: "Awareness video",
          ctr: 0.8,
          impressions: 10_000,
          clicks: 80,
          capturedAt: new Date(Date.now() - 6 * 86400000),
        },
      });

      await recordPerformanceSnapshots(fx.clientA.id, [campaign(0.2)]);

      // Age the check past the 6h re-check gate, still dropped.
      await prisma.performanceSnapshot.updateMany({
        where: { clientId: fx.clientA.id, capturedAt: { gte: new Date(Date.now() - 60_000) } },
        data: { capturedAt: new Date(Date.now() - 7 * 3600000) },
      });
      await recordPerformanceSnapshots(fx.clientA.id, [campaign(0.15)]);

      const alerts = await prisma.notification.findMany({
        where: { clientId: fx.clientA.id, title: "Performance drop detected" },
      });
      const signals = await prisma.marketSignal.findMany({ where: { clientId: fx.clientA.id, type: "PERFORMANCE" } });
      expect(alerts).toHaveLength(1);
      expect(signals).toHaveLength(1);
      expect(signals[0].dedupeKey).toBe("perf:LinkedIn:cmp-1");
    } finally {
      await fx.cleanup();
    }
  });

  it("an archived repeat still suppresses re-alerting", async () => {
    const fx = await createSecurityFixtures();
    try {
      await prisma.marketSignal.create({
        data: {
          clientId: fx.clientA.id,
          type: "PERFORMANCE",
          title: "old",
          summary: "old",
          publishedAt: new Date(Date.now() - 2 * 86400000),
          dedupeKey: "perf:LinkedIn:cmp-1",
          archivedAt: new Date(),
        },
      });
      await prisma.performanceSnapshot.create({
        data: {
          clientId: fx.clientA.id,
          platform: "LinkedIn",
          campaignId: "cmp-1",
          campaignName: "Awareness video",
          ctr: 0.8,
          impressions: 10_000,
          clicks: 80,
          capturedAt: new Date(Date.now() - 6 * 86400000),
        },
      });

      await recordPerformanceSnapshots(fx.clientA.id, [campaign(0.2)]);

      const alerts = await prisma.notification.count({ where: { clientId: fx.clientA.id, title: "Performance drop detected" } });
      expect(alerts).toBe(0);
    } finally {
      await fx.cleanup();
    }
  });
});

describe("new brief intake", () => {
  function intakeForm(extra: Record<string, string> = {}) {
    const fd = new FormData();
    fd.set("rawText", "I need a 10 slide presentation");
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  }

  it("offers 'Continue your draft' instead of creating a near-duplicate", async () => {
    const fx = await createSecurityFixtures();
    try {
      const draft = await prisma.project.create({
        data: { clientId: fx.clientA.id, name: "Klarna Presentation Deck", type: "PRESENTATION", status: "DRAFT" },
      });
      setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });

      const state = await startBriefFromIntakeAction({}, intakeForm());

      expect(state.existingDraft).toEqual({ id: draft.id, name: "Klarna Presentation Deck" });
      expect(state.submitted?.rawText).toBe("I need a 10 slide presentation");
      expect(await prisma.project.count({ where: { clientId: fx.clientA.id } })).toBe(2);
    } finally {
      await fx.cleanup();
    }
  });

  it("still creates a new project when the client chooses to", async () => {
    const fx = await createSecurityFixtures();
    try {
      await prisma.project.create({
        data: { clientId: fx.clientA.id, name: "Klarna Presentation Deck", type: "PRESENTATION", status: "DRAFT" },
      });
      setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });

      await expect(startBriefFromIntakeAction({}, intakeForm({ startNew: "1" }))).rejects.toThrow(/^REDIRECT:\/projects\/[^/]+$/);
      expect(await prisma.project.count({ where: { clientId: fx.clientA.id, type: "PRESENTATION" } })).toBe(2);
    } finally {
      await fx.cleanup();
    }
  });

  it("ignores drafts of a different type, archived projects, and other clients", async () => {
    const fx = await createSecurityFixtures();
    try {
      await prisma.project.createMany({
        data: [
          { clientId: fx.clientA.id, name: "Video", type: "MOTION_VIDEO", status: "DRAFT" },
          { clientId: fx.clientA.id, name: "Old deck", type: "PRESENTATION", status: "ARCHIVED" },
          { clientId: fx.clientB.id, name: "B's deck", type: "PRESENTATION", status: "DRAFT" },
        ],
      });
      setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });

      await expect(startBriefFromIntakeAction({}, intakeForm())).rejects.toThrow(/^REDIRECT:/);
    } finally {
      await fx.cleanup();
    }
  });

  it("does not suggest a teammate's confidential draft", async () => {
    const fx = await createSecurityFixtures();
    try {
      const teammate = await prisma.user.create({
        data: { name: "Teammate", email: `mate-${Date.now()}@test.local`, role: "CLIENT", status: "ACTIVE" },
      });
      const teammateCU = await prisma.clientUser.create({
        data: { userId: teammate.id, clientId: fx.clientA.id, permission: "APPROVER" },
      });
      await prisma.project.create({
        data: {
          clientId: fx.clientA.id,
          name: "Secret deck",
          type: "PRESENTATION",
          status: "DRAFT",
          confidential: true,
          createdByClientUserId: teammateCU.id,
        },
      });
      setMockSession({ user: { id: fx.userA.id, role: "CLIENT" } });

      try {
        await expect(startBriefFromIntakeAction({}, intakeForm())).rejects.toThrow(/^REDIRECT:/);
      } finally {
        await prisma.user.delete({ where: { id: teammate.id } });
      }
    } finally {
      await fx.cleanup();
    }
  });
});
